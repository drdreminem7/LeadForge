import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");

const ROLE_EMAIL_PREFIXES = new Set([
    "info",
    "office",
    "contact",
    "hello",
    "sales",
    "support",
    "team",
    "finance",
    "accounts",
    "accounting",
]);

const ENTERPRISE_NAME_PATTERNS = [
    /\bkpmg\b/i,
    /\bpwc\b/i,
    /\bdeloitte\b/i,
    /\bey\b/i,
    /\bmazars\b/i,
    /\bbdo\b/i,
    /\bgrant thornton\b/i,
    /\binternational\b/i,
    /\bglobal\b/i,
    /\bholdings\b/i,
    /\bcorporation\b/i,
    /\bcorp\b/i,
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

function parseCSV(raw) {
    const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const headers = parseCSVRow(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = parseCSVRow(lines[i]);
        const obj = {};
        headers.forEach((h, idx) => {
            obj[h] = values[idx] || "";
        });
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

function writeCSV(rows, filepath) {
    if (rows.length === 0) {
        fs.writeFileSync(filepath, "", "utf8");
        return;
    }

    const headers = Object.keys(rows[0]);
    const lines = [
        headers.join(","),
        ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(",")),
    ];
    fs.writeFileSync(filepath, lines.join("\n"), "utf8");
}

function isEU(row) {
    const lane = String(row["Market Lane"] || "").trim().toUpperCase();
    if (lane === "EU") return true;
    const country = String(row.Country || "").trim().toLowerCase();
    return EU_COUNTRIES.has(country);
}

function extractDomain(urlLike) {
    const text = String(urlLike || "").trim();
    if (!text) return "";
    try {
        return new URL(text).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
        return "";
    }
}

function scoreSMB(row) {
    let score = 0;
    const reasons = [];

    const name = String(row.Name || "").trim();
    const confidence = String(row.Confidence || "").trim().toLowerCase();
    const email = String(row.Email || "").trim().toLowerCase();
    const website = String(row.Website || "").trim();

    if (confidence === "high") {
        score += 30;
        reasons.push("high-confidence-email");
    } else if (confidence === "medium") {
        score += 20;
        reasons.push("medium-confidence-email");
    } else if (confidence === "low") {
        score += 10;
        reasons.push("low-confidence-email");
    }

    if (website.startsWith("http")) {
        score += 10;
        reasons.push("has-website");
    }

    if (email.includes("@")) {
        const local = email.split("@")[0];
        if (ROLE_EMAIL_PREFIXES.has(local)) {
            score += 25;
            reasons.push("role-email");
        } else {
            score += 8;
            reasons.push("personal-email");
        }
    }

    const websiteDomain = extractDomain(website);
    const emailDomain = extractDomain(email.includes("@") ? `https://${email.split("@")[1]}` : "");
    if (websiteDomain && emailDomain && (websiteDomain === emailDomain || websiteDomain.endsWith(`.${emailDomain}`) || emailDomain.endsWith(`.${websiteDomain}`))) {
        score += 20;
        reasons.push("domain-match");
    }

    const wordCount = name.split(/\s+/).filter(Boolean).length;
    if (wordCount > 0 && wordCount <= 4) {
        score += 10;
        reasons.push("compact-brand-name");
    }

    const enterpriseHit = ENTERPRISE_NAME_PATTERNS.some((pattern) => pattern.test(name));
    if (enterpriseHit) {
        score -= 40;
        reasons.push("likely-large-enterprise");
    }

    if (!email) {
        score -= 10;
        reasons.push("no-email");
    }

    if (score < 0) score = 0;
    if (score > 100) score = 100;

    let band = "Review";
    if (score >= 65) band = "Tier1-SMB";
    else if (score >= 50) band = "Tier2-SMB";

    return { score, band, reasons: reasons.join(";") };
}

function addSMBFields(row) {
    const scored = scoreSMB(row);
    return {
        ...row,
        "SMB Score": scored.score,
        "SMB Band": scored.band,
        "SMB Reason": scored.reasons,
    };
}

function latestFileByPrefix(prefix) {
    const files = fs
        .readdirSync(DATA_DIR)
        .filter((f) => f.startsWith(prefix) && f.endsWith(".csv"))
        .sort()
        .reverse();
    return files[0] ? path.join(DATA_DIR, files[0]) : null;
}

function main() {
    let inputFile = process.argv[2];
    if (!inputFile) {
        inputFile = latestFileByPrefix("companies_with_emails") || latestFileByPrefix("companies_processed_with_emails");
    }

    if (!inputFile) {
        console.error("No companies_with_emails*.csv file found in ./data/");
        process.exit(1);
    }

    if (!path.isAbsolute(inputFile)) {
        inputFile = path.join(DATA_DIR, inputFile);
    }

    if (!fs.existsSync(inputFile)) {
        console.error(`Input file not found: ${inputFile}`);
        process.exit(1);
    }

    const raw = fs.readFileSync(inputFile, "utf8");
    const rows = parseCSV(raw);
    const euRows = rows.filter(isEU).map(addSMBFields);

    const tier1 = euRows.filter((r) => r["SMB Band"] === "Tier1-SMB");
    const tier2 = euRows.filter((r) => r["SMB Band"] === "Tier2-SMB");
    const review = euRows.filter((r) => r["SMB Band"] === "Review");

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    const tier1File = path.join(DATA_DIR, `EU_tier1_smb_${stamp}.csv`);
    const tier2File = path.join(DATA_DIR, `EU_tier2_smb_${stamp}.csv`);
    const reviewFile = path.join(DATA_DIR, `EU_review_queue_${stamp}.csv`);

    writeCSV(tier1, tier1File);
    writeCSV(tier2, tier2File);
    writeCSV(review, reviewFile);

    writeCSV(tier1, path.join(DATA_DIR, "EU_tier1_smb.csv"));
    writeCSV(tier2, path.join(DATA_DIR, "EU_tier2_smb.csv"));
    writeCSV(review, path.join(DATA_DIR, "EU_review_queue.csv"));

    console.log(`Loaded rows: ${rows.length}`);
    console.log(`EU rows: ${euRows.length}`);
    console.log(`Tier 1 SMB rows: ${tier1.length}`);
    console.log(`Tier 2 SMB rows: ${tier2.length}`);
    console.log(`Review queue rows: ${review.length}`);
    console.log(`Output files:`);
    console.log(`- ${tier1File}`);
    console.log(`- ${tier2File}`);
    console.log(`- ${reviewFile}`);
}

main();
