/**
 * email-enricher.js
 * Reads a companies CSV, fetches each website, extracts emails,
 * and writes companies_with_emails.csv to ./data/
 *
 * Usage: node email-enricher.js [input.csv]
 * Default input: most recent companies_*.csv in ./data/
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");

const CFG = {
    concurrency: 5,
    requestTimeout: 6000,
    delayMs: 300,
    maxRedirects: 5,
    userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    contactPaths: [
        "/contact",
        "/contacts",
        "/contact-us",
        "/about",
        "/about-us",
        "/team",
        "/imprint",
        "/impressum",
        "/kontakt",
        "/contatti",
        "/contato",
        "/contacto",
        "/over-ons",
        "/kancelaria",
        "/контакти",
        "/za-nas",
        "/chi-siamo",
    ],
};

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Prefixes ranked by likelihood of being a business contact
const PREFERRED_PREFIXES = ["info", "office", "contact", "hello", "sales", "support", "admin", "mail", "enquiries", "enquiry", "team"];

const BLACKLISTED_EMAIL_PATTERNS = [
    /\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|ttf)$/i,
    /@(example\.com|sentry\.io|wixpress\.com|squarespace\.com|wordpress\.com|sendgrid\.net|mailchimp\.com|googletagmanager|schema\.org)/i,
    /noreply|no-reply|donotreply/i,
    /^(your|you|youremail|yourname|name|email|test|user|username|address|someone)@/i,
];

const EU_COUNTRIES = new Set([
    "austria",
    "belgium",
    "bulgaria",
    "croatia",
    "cyprus",
    "czechia",
    "czech republic",
    "denmark",
    "estonia",
    "finland",
    "france",
    "germany",
    "greece",
    "hungary",
    "ireland",
    "italy",
    "latvia",
    "lithuania",
    "luxembourg",
    "malta",
    "netherlands",
    "poland",
    "portugal",
    "romania",
    "slovakia",
    "slovenia",
    "spain",
    "sweden",
]);

function isEUCountry(country) {
    return EU_COUNTRIES.has(String(country || "").trim().toLowerCase());
}

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(raw) {
    const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const headers = parseCSVRow(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = parseCSVRow(lines[i]);
        const obj = {};
        headers.forEach((h, idx) => (obj[h] = values[idx] || ""));
        rows.push(obj);
    }
    return rows;
}

function parseCSVRow(line) {
    const fields = [];
    let inQuote = false;
    let field = "";
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuote) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuote = false;
                }
            } else {
                field += ch;
            }
        } else {
            if (ch === '"') {
                inQuote = true;
            } else if (ch === ",") {
                fields.push(field);
                field = "";
            } else {
                field += ch;
            }
        }
    }
    fields.push(field);
    return fields;
}

// ── HTTP fetcher ──────────────────────────────────────────────────────────────

async function fetchHTML(url, redirectsLeft = CFG.maxRedirects) {
    if (redirectsLeft <= 0) throw new Error("Too many redirects");
    return new Promise((resolve, reject) => {
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch {
            return reject(new Error(`Invalid URL: ${url}`));
        }

        const isHttps = parsedUrl.protocol === "https:";
        const mod = isHttps ? https : http;
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: "GET",
            headers: {
                "User-Agent": CFG.userAgent,
                Accept: "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9,de;q=0.8,nl;q=0.7,es;q=0.7,pt;q=0.7,ro;q=0.7,pl;q=0.7,el;q=0.7,cs;q=0.7",
                Connection: "close",
            },
            rejectUnauthorized: false, // handle self-signed SSL on Bulgarian sites
            timeout: CFG.requestTimeout,
        };

        const req = mod.request(options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let next;
                try {
                    next = new URL(res.headers.location, url).toString();
                } catch {
                    res.resume();
                    return resolve(""); // unparseable redirect (e.g. garbled Cyrillic), skip
                }
                res.resume();
                fetchHTML(next, redirectsLeft - 1).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode >= 400) {
                res.resume();
                return resolve(""); // treat client/server error as empty
            }
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => resolve(chunks.join("")));
        });

        req.on("error", reject);
        req.on("timeout", () => {
            req.destroy();
            reject(new Error("Timeout"));
        });
        req.end();
    });
}

// ── Email extraction ──────────────────────────────────────────────────────────

function extractEmailsFromHTML(html, sourceUrl) {
    const results = new Map(); // email -> { sourceUrl, fromMailto }

    // 1. mailto: links (highest confidence)
    const mailtoRe = /mailto:([^"'?>\s]+)/gi;
    let m;
    while ((m = mailtoRe.exec(html)) !== null) {
        const email = m[1].split("?")[0].toLowerCase().trim();
        if (isValidEmail(email)) {
            results.set(email, { sourceUrl, fromMailto: true });
        }
    }

    // 2. Obfuscated with [at] / (at) / _at_
    const obfuscated = html.replace(/\[at\]|\(at\)|_at_/gi, "@").replace(/\[dot\]|\(dot\)|_dot_/gi, ".");

    // 3. Plain text regex scan
    const found = obfuscated.match(EMAIL_REGEX) || [];
    for (const email of found) {
        const lower = email.toLowerCase().trim();
        if (isValidEmail(lower) && !results.has(lower)) {
            results.set(lower, { sourceUrl, fromMailto: false });
        }
    }

    return results;
}

function isValidEmail(email) {
    if (!email || email.length > 100) return false;
    if (!email.includes("@")) return false;
    if (/%[0-9A-Fa-f]{2}/.test(email)) return false; // reject URL-encoded chars
    for (const pattern of BLACKLISTED_EMAIL_PATTERNS) {
        if (pattern.test(email)) return false;
    }
    // Basic structure check
    return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);
}

function rankEmails(emailMap, websiteDomain) {
    const entries = [...emailMap.entries()].map(([email, meta]) => {
        const [localPart, domain] = email.split("@");
        const sameDomain = domain === websiteDomain || domain.endsWith("." + websiteDomain) || websiteDomain.endsWith("." + domain);
        const prefixScore = PREFERRED_PREFIXES.indexOf(localPart);
        const prefixRank = prefixScore === -1 ? 999 : prefixScore;

        // confidence: high = same domain + mailto, medium = same domain, low = other
        let confidence;
        if (sameDomain && meta.fromMailto) confidence = "high";
        else if (sameDomain) confidence = "medium";
        else if (meta.fromMailto) confidence = "medium";
        else confidence = "low";

        return { email, ...meta, sameDomain, prefixRank, confidence };
    });

    // Sort: same domain first, then by mailto, then by prefix rank
    entries.sort((a, b) => {
        if (a.sameDomain !== b.sameDomain) return b.sameDomain - a.sameDomain;
        if (a.fromMailto !== b.fromMailto) return b.fromMailto - a.fromMailto;
        return a.prefixRank - b.prefixRank;
    });

    return entries;
}

// ── Core enricher ─────────────────────────────────────────────────────────────

async function enrichCompany(company) {
    const website = (company.Website || "").trim();
    if (!website || !website.startsWith("http")) {
        return { ...company, Email: "", "Email Source": "", Confidence: "" };
    }

    let websiteDomain;
    try {
        websiteDomain = new URL(website).hostname.replace(/^www\./, "");
    } catch {
        return { ...company, Email: "", "Email Source": "", Confidence: "" };
    }

    const allEmails = new Map();

    // Fetch homepage first
    const urls = [website, ...CFG.contactPaths.map((p) => {
        try { return new URL(p, website).toString(); } catch { return null; }
    }).filter(Boolean)];

    for (const url of urls) {
        try {
            const html = await fetchHTML(url);
            if (!html) continue;
            const found = extractEmailsFromHTML(html, url);
            for (const [email, meta] of found) {
                if (!allEmails.has(email)) allEmails.set(email, meta);
            }
            // Stop early if we already found a same-domain high-confidence email
            const ranked = rankEmails(allEmails, websiteDomain);
            if (ranked.length > 0 && ranked[0].confidence === "high") break;
        } catch {
            // silently skip failed pages
        }
        await sleep(200); // small delay between pages of the same domain
    }

    const ranked = rankEmails(allEmails, websiteDomain);
    if (ranked.length === 0) {
        return { ...company, Email: "", "Email Source": "", Confidence: "" };
    }

    const best = ranked[0];
    return {
        ...company,
        Email: best.email,
        "Email Source": best.sourceUrl,
        Confidence: best.confidence,
    };
}

// ── Concurrency helper ────────────────────────────────────────────────────────

async function processWithConcurrency(items, fn, concurrency) {
    const results = new Array(items.length);
    let index = 0;

    async function worker() {
        while (index < items.length) {
            const i = index++;
            results[i] = await fn(items[i], i);
        }
    }

    const workers = Array.from({ length: concurrency }, worker);
    await Promise.all(workers);
    return results;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// ── CSV writer ────────────────────────────────────────────────────────────────

function writeCSV(rows, filepath) {
    if (rows.length === 0) { console.warn("No rows to write."); return; }
    const headers = Object.keys(rows[0]);
    const escape = (v) => `"${(v || "").toString().replace(/"/g, '""')}"`;
    const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))];
    fs.writeFileSync(filepath, lines.join("\n"), "utf8");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    // Find input file
    let inputFile = process.argv[2];
    if (!inputFile) {
        const csvFiles = fs
            .readdirSync(DATA_DIR)
            .filter((f) => f.match(/^companies_\d{4}-\d{2}-\d{2}\.csv$/))
            .sort()
            .reverse();
        if (csvFiles.length === 0) {
            console.error("No companies_*.csv found in ./data/");
            process.exit(1);
        }
        inputFile = path.join(DATA_DIR, csvFiles[0]);
        console.log(`📂 Auto-selected: ${csvFiles[0]}`);
    } else {
        // If relative path given, resolve from DATA_DIR
        if (!path.isAbsolute(inputFile)) {
            inputFile = path.join(DATA_DIR, inputFile);
        }
    }

    if (!fs.existsSync(inputFile)) {
        console.error(`File not found: ${inputFile}`);
        process.exit(1);
    }

    const raw = fs.readFileSync(inputFile, "utf8");
    const companies = parseCSV(raw);
    console.log(`📋 Loaded ${companies.length} companies from ${path.basename(inputFile)}`);

    const euCompanies = companies.filter((c) => {
        const lane = String(c["Market Lane"] || "").trim().toUpperCase();
        if (lane === "EU") return true;
        return isEUCountry(c.Country);
    });

    const withWebsite = euCompanies.filter((c) => (c.Website || "").startsWith("http"));
    const withoutWebsite = euCompanies.filter((c) => !(c.Website || "").startsWith("http"));
    console.log(`🌐 ${withWebsite.length} have a website URL, ${withoutWebsite.length} do not`);

    if (withWebsite.length === 0) {
        console.error("No companies with website URLs found. Nothing to enrich.");
        process.exit(1);
    }

    console.log(`\n🔍 Enriching emails with concurrency=${CFG.concurrency}...\n`);

    let done = 0;
    const enriched = await processWithConcurrency(withWebsite, async (company, i) => {
        const result = await enrichCompany(company);
        done++;
        const status = result.Email ? `✅ ${result.Email}` : "⬜ no email found";
        const name = (company.Name || "").slice(0, 40).padEnd(42);
        console.log(`[${done}/${withWebsite.length}] ${name} ${status}`);
        await sleep(CFG.delayMs);
        return result;
    }, CFG.concurrency);

    // Re-combine with no-website companies (add empty email fields)
    const noEmailRows = withoutWebsite.map((c) => ({
        ...c,
        Email: "",
        "Email Source": "",
        Confidence: "",
    }));
    const allRows = [...enriched, ...noEmailRows];

    const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputFile = path.join(DATA_DIR, `companies_processed_with_emails_${runStamp}.csv`);
    const canonicalOutputFile = path.join(DATA_DIR, "companies_with_emails.csv");
    writeCSV(allRows, outputFile);
    writeCSV(allRows, canonicalOutputFile);

    const foundCount = enriched.filter((c) => c.Email).length;
    console.log(`\n✅ Done. ${foundCount}/${withWebsite.length} emails found.`);
    console.log(`📁 Output: ${outputFile}`);
    console.log(`📁 Canonical: ${canonicalOutputFile}`);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
