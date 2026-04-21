import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { CONFIG } from "../config.js";
import { DataExporter } from "./exporter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runNodeScript(scriptRelativePath, args = []) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.resolve(__dirname, scriptRelativePath);
        const proc = spawn(process.execPath, [scriptPath, ...args], {
            stdio: "inherit",
            cwd: path.resolve(__dirname, ".."),
        });

        proc.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Script exited with code ${code}`));
            }
        });

        proc.on("error", reject);
    });
}

function parseArgs(argv) {
    const args = {
        startCity: "",
        existingCsv: "",
        city: "",
        country: "",
        coords: "",
        zoom: 12,
        tier: "Tier1",
    };

    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (token === "--start-city" && argv[i + 1]) {
            args.startCity = argv[i + 1];
            i++;
        } else if (token === "--existing-csv" && argv[i + 1]) {
            args.existingCsv = argv[i + 1];
            i++;
        } else if (token === "--city" && argv[i + 1]) {
            args.city = argv[i + 1];
            i++;
        } else if (token === "--country" && argv[i + 1]) {
            args.country = argv[i + 1];
            i++;
        } else if (token === "--coords" && argv[i + 1]) {
            args.coords = argv[i + 1];
            i++;
        } else if (token === "--zoom" && argv[i + 1]) {
            const parsedZoom = Number.parseInt(argv[i + 1], 10);
            if (!Number.isNaN(parsedZoom)) {
                args.zoom = parsedZoom;
            }
            i++;
        } else if (token === "--tier" && argv[i + 1]) {
            args.tier = argv[i + 1];
            i++;
        }
    }

    return args;
}

/**
 * GoogleMapsScraper - Main scraping orchestrator
 */
class GoogleMapsScraper {
    constructor(runtimeOptions = {}) {
        this.browser = null;
        this.page = null;
        this.companies = [];
        this.currentLocation = null;
        this.runtimeOptions = runtimeOptions;
    }

    parseCsvLine(line) {
        const values = [];
        let current = "";
        let inQuotes = false;

        for (let index = 0; index < line.length; index++) {
            const char = line[index];
            const nextChar = line[index + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    current += '"';
                    index++;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }

            if (char === "," && !inQuotes) {
                values.push(current);
                current = "";
                continue;
            }

            current += char;
        }

        values.push(current);
        return values;
    }

    loadExistingCompaniesFromCsv(csvPath) {
        const resolved = path.isAbsolute(csvPath)
            ? csvPath
            : path.join(process.cwd(), csvPath);

        if (!fs.existsSync(resolved)) {
            throw new Error(`Existing CSV not found: ${resolved}`);
        }

        const content = fs.readFileSync(resolved, "utf8");
        const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
        if (lines.length < 2) {
            console.warn(`⚠️ Existing CSV has no data rows: ${resolved}`);
            return;
        }

        const header = this.parseCsvLine(lines[0]).map((h) => h.trim());
        const headerIndex = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

        const idx = {
            name: headerIndex("Name"),
            address: headerIndex("Address"),
            rating: headerIndex("Rating"),
            website: headerIndex("Website"),
            searchTerm: headerIndex("Search Term"),
            city: headerIndex("City"),
            country: headerIndex("Country"),
            locationTier: headerIndex("Location Tier"),
            marketLane: headerIndex("Market Lane"),
            scrapedAt: headerIndex("Scraped At"),
        };

        const loaded = [];
        for (let i = 1; i < lines.length; i++) {
            const row = this.parseCsvLine(lines[i]);
            const name = idx.name >= 0 ? row[idx.name] : "";
            const address = idx.address >= 0 ? row[idx.address] : "";
            if (!name) {
                continue;
            }
            loaded.push({
                name,
                address,
                rating: idx.rating >= 0 ? row[idx.rating] : "",
                website: idx.website >= 0 ? row[idx.website] : "",
                searchTerm: idx.searchTerm >= 0 ? row[idx.searchTerm] : "",
                city: idx.city >= 0 ? row[idx.city] : "",
                country: idx.country >= 0 ? row[idx.country] : "",
                locationTier: idx.locationTier >= 0 ? row[idx.locationTier] : "",
                marketLane: idx.marketLane >= 0 ? row[idx.marketLane] : CONFIG.marketLane,
                scrapedAt: idx.scrapedAt >= 0 ? row[idx.scrapedAt] : new Date().toISOString(),
                url: "",
            });
        }

        this.companies = loaded;
        console.log(`📥 Loaded ${loaded.length} existing rows from ${resolved}`);
    }

    /**
     * Initialize the browser and page
     */
    async init() {
        console.log("🚀 Initializing browser...");
        this.browser = await puppeteer.launch({
            ...CONFIG.browser,
            executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            args: [...CONFIG.browser.args, "--disable-web-security", "--disable-features=VizDisplayCompositor"],
        });
        this.page = await this.browser.newPage();

        // Set cookies to bypass consent
        const cookies = [
            {
                name: "CONSENT",
                value: "YES+",
                domain: ".google.com",
            },
            {
                name: "NID",
                value: "511=abc123def456",
                domain: ".google.com",
            },
            {
                name: "SOCS",
                value: "CAESHAgBEhJnd3NfMjAyMzEyMTMtMF9SQzIaAmVuIAEaBgiA2fa5Bg",
                domain: ".google.com",
            },
        ];

        for (const cookie of cookies) {
            try {
                await this.page.setCookie(cookie);
            } catch (e) {
                // Ignore cookie setting errors
            }
        }

        // Set user agent to avoid detection
        await this.page.setUserAgent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        );

        console.log("✅ Browser initialized");
    }

    /**
     * Build Google Maps search URL
     */
    buildSearchUrl(query, locationObj) {
        const locationSuffix = `${locationObj.city}, ${locationObj.country}`;
        const searchQuery = encodeURIComponent(`${query} ${locationSuffix}`);
        const coords = locationObj.coords;
        const zoom = locationObj.zoom || 12;
        return `https://www.google.com/maps/search/${searchQuery}/@${coords},${zoom}z`;
    }

    /**
     * Extract company information from page
     */
    async extractCompanies() {
        console.log("📋 Extracting company data...");

        const companies = await this.page.evaluate(() => {
            const results = [];

            const toAbsoluteUrl = (value) => {
                if (!value) {
                    return "";
                }

                try {
                    return new URL(value, window.location.origin).toString();
                } catch {
                    return "";
                }
            };

            const extractWebsiteFromHref = (href) => {
                const absoluteHref = toAbsoluteUrl(href);
                if (!absoluteHref) {
                    return "";
                }

                try {
                    const parsed = new URL(absoluteHref);
                    const redirectTarget = parsed.searchParams.get("q") || parsed.searchParams.get("url");
                    const candidate = redirectTarget ? decodeURIComponent(redirectTarget) : absoluteHref;
                    const candidateUrl = new URL(candidate);

                    if (
                        candidateUrl.protocol.startsWith("http") &&
                        !candidateUrl.hostname.includes("google.") &&
                        !candidateUrl.hostname.includes("gstatic.")
                    ) {
                        return candidateUrl.toString();
                    }
                } catch {
                    return "";
                }

                return "";
            };

            const candidateSelectors = [
                "[data-item-id]",
                "[role='article']",
                ".section-result",
                ".Nv2PK",
                ".hfpxzc",
                ".VkpGBb",
                ".shs4wc",
                "[data-result-index]",
                ".place-result",
                ".local-result",
            ];

            const foundSelectors = candidateSelectors.map((selector) => {
                const count = document.querySelectorAll(selector).length;
                return { selector, count };
            });

            let elements = [];
            for (const selector of candidateSelectors) {
                const list = document.querySelectorAll(selector);
                if (list.length > 0) {
                    elements = Array.from(list);
                    break;
                }
            }

            if (!elements.length) {
                elements = Array.from(document.querySelectorAll("[role='article'], .Nv2PK, .hfpxzc, .VkpGBb, .section-result, .shs4wc"));
            }

            if (!elements.length) {
                elements = Array.from(document.querySelectorAll("div"));
            }

            console.log(`Candidate elements: ${elements.length}`);
            console.log(`Selector counts: ${JSON.stringify(foundSelectors.filter((s) => s.count > 0))}`);

            elements.forEach((element, index) => {
                try {
                    let name = "";
                    const nameSelectors = [
                        "h3 span",
                        "h3",
                        ".qBF1Pd",
                        ".qBF1Pd span",
                        ".V0h1Ob",
                        "[data-title]",
                    ];

                    for (const selector of nameSelectors) {
                        const el = element.querySelector(selector);
                        if (el && el.textContent?.trim()) {
                            name = el.textContent.trim();
                            break;
                        }
                    }

                    let address = "";
                    const addressSelectors = [
                        ".W4Efsd",
                        ".Io6YTe",
                        ".section-result-location",
                        "[data-address]",
                    ];
                    for (const selector of addressSelectors) {
                        const el = element.querySelector(selector);
                        if (el && el.textContent?.trim()) {
                            address = el.textContent.trim();
                            break;
                        }
                    }

                    let ratingText = "";
                    const ratingSelectors = [
                        "[aria-label*='star']",
                        ".MW4etd",
                        ".section-result-rating",
                    ];
                    for (const selector of ratingSelectors) {
                        const el = element.querySelector(selector);
                        if (el) {
                            ratingText = el.getAttribute("aria-label") || el.textContent || "";
                            if (ratingText.trim()) break;
                        }
                    }

                    let website = "";
                    const websiteCandidates = [
                        ...element.querySelectorAll("a[href]"),
                        ...element.querySelectorAll('[data-value="Website"]'),
                    ];

                    for (const candidate of websiteCandidates) {
                        website = extractWebsiteFromHref(candidate.getAttribute("href"));
                        if (website) {
                            break;
                        }
                    }

                    if (name) {
                        results.push({
                            name,
                            rating: ratingText.trim() || "No rating",
                            address: address || "Not provided",
                            website,
                            url: window.location.href,
                            scrapedAt: new Date().toISOString(),
                        });
                    }
                } catch (e) {
                    console.log(`Error parsing element ${index}:`, e.message);
                }
            });

            return {
                companies: results,
                debug: {
                    candidateCount: elements.length,
                    foundSelectors,
                    totalDivs: document.querySelectorAll("div").length,
                },
            };
        });

        console.log(`Extracted ${companies.companies.length} companies (from ${companies.debug.candidateCount} candidates)`);
        console.log(`Debug selectors: ${JSON.stringify(companies.debug.foundSelectors.filter((s) => s.count > 0))}`);

        return companies.companies;
    }

    /**
     * Try to click "Show more" buttons or similar
     */
    async tryClickShowMore() {
        try {
            const result = await this.page.evaluate(() => {
                const buttons = [
                    ...document.querySelectorAll("button"),
                    ...document.querySelectorAll('[role="button"]'),
                    ...document.querySelectorAll("a"),
                    ...document.querySelectorAll("[data-js-action]"),
                ];

                for (const button of buttons) {
                    const text = (button.textContent || button.innerText || "").toLowerCase();
                    const ariaLabel = button.getAttribute("aria-label") || "";
                    const dataValue = button.getAttribute("data-value") || "";

                    if (
                        text.includes("show more") ||
                        text.includes("load more") ||
                        text.includes("see more") ||
                        text.includes("more results") ||
                        text.includes("view more") ||
                        text.includes("next") ||
                        ariaLabel.toLowerCase().includes("more") ||
                        ariaLabel.toLowerCase().includes("next") ||
                        dataValue.toLowerCase().includes("more") ||
                        dataValue.toLowerCase().includes("next")
                    ) {
                        button.click();
                        return { clicked: true, text: text.trim(), ariaLabel, dataValue };
                    }
                }
                return { clicked: false };
            });

            if (result.clicked) {
                console.log(`🖱️  Clicked button: "${result.text}"`);
                await new Promise((resolve) => setTimeout(resolve, CONFIG.scraping.scrollDelay));
                return true;
            }
        } catch (e) {
            console.log(`⚠️  Error clicking show more button: ${e.message}`);
        }
        return false;
    }

    /**
     * Scroll and load more results
     */
    async loadMoreResults() {
        console.log("🔄 Attempting to load more results...");

        try {
            await this.page.evaluate(() => {
                const feedSelectors = [
                    '[role="feed"]',
                    '.cYbmhf',
                    '.m6QErb',
                    '.section-scrollbox',
                    '.Nv2PK',
                    '[role="region"]',
                    '.section-layout',
                ];

                let feedContainer = null;
                for (const sel of feedSelectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        feedContainer = el;
                        break;
                    }
                }

                const doIncrementalScroll = (container) => {
                    if (!container) return;

                    const originalHeight = container.scrollHeight;
                    for (let i = 0; i < 12; i++) {
                        container.scrollTop += Math.min(300, container.scrollHeight / 8);
                        container.dispatchEvent(new Event('scroll', { bubbles: true }));
                        container.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, bubbles: true }));
                    }

                    container.scrollTop = container.scrollHeight;
                    container.dispatchEvent(new Event('scroll', { bubbles: true }));
                    container.dispatchEvent(new WheelEvent('wheel', { deltaY: 2000, bubbles: true }));
                    container.dispatchEvent(new Event('wheel', { bubbles: true }));
                };

                if (feedContainer) {
                    doIncrementalScroll(feedContainer);

                    const innerFeed = feedContainer.querySelector('[role="feed"], .cYbmhf, .Nv2PK, .hfpxzc');
                    if (innerFeed && innerFeed !== feedContainer) {
                        doIncrementalScroll(innerFeed);
                    }
                }

                window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });

                const allResults = Array.from(document.querySelectorAll('[role="article"], .Nv2PK, .hfpxzc'));
                if (allResults.length > 6) {
                    const targetIdx = Math.max(0, allResults.length - 3);
                    if (allResults[targetIdx] && allResults[targetIdx].scrollIntoView) {
                        allResults[targetIdx].scrollIntoView({ behavior: 'auto', block: 'center' });
                    }
                }
            });
        } catch (err) {
            console.warn("⚠️ loadMoreResults evaluate failed:", err.message);
        }

        await new Promise((resolve) => setTimeout(resolve, 800));

        try {
            for (let i = 0; i < 6; i++) {
                await this.page.keyboard.press("PageDown");
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
        } catch (e) {
            // Ignore keyboard errors
        }

        await this.tryClickShowMore();

        await new Promise((resolve) => setTimeout(resolve, 1500));
    }


    /**
     * Search for companies with a specific query
     */
    async searchAndScrape(searchQuery, locationObj) {
        console.log(`\n🔍 Searching for: "${searchQuery}" in ${locationObj.city}, ${locationObj.country}`);

        const locationAnchor = `https://www.google.com/maps/place/${encodeURIComponent(locationObj.city + ", " + locationObj.country)}/@${locationObj.coords},${locationObj.zoom || 12}z`;
        await this.page.goto(locationAnchor, { waitUntil: "networkidle2" });
        await new Promise((resolve) => setTimeout(resolve, 1500));

        const url = this.buildSearchUrl(searchQuery, locationObj);
        console.log(`URL: ${url}`);
        await this.page.goto(url, { waitUntil: "networkidle2" });
        // Handle Google consent page if it appears
        const currentUrl = await this.page.url();
        if (currentUrl.includes("consent.google.com")) {
            console.log("Detected consent page, waiting and retrying...");
            await new Promise((resolve) => setTimeout(resolve, 3000));

            // Try navigating again
            await this.page.goto(url, { waitUntil: "networkidle2" });
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        // Wait for results to load
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Take a screenshot for debugging (optional)
        // await this.page.screenshot({ path: `debug-${searchQuery.replace(/\s+/g, '-')}.png`, fullPage: true });
        // Check if page loaded correctly
        const title = await this.page.title();
        console.log(`Page title: "${title}"`);

        const finalUrl = await this.page.url();
        console.log(`Current URL: ${finalUrl}`);
        // Try to load more results by scrolling
        let previousCount = 0;
        let noChangeCount = 0;
        let totalScrollAttempts = 0;

        console.log("🔄 Starting to scroll for more results...");

        // First, try clicking any "Show more" buttons
        await this.tryClickShowMore();

        const uniqueCompanies = [];

        // Extract initial results before scrolling
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const initialCompanies = await this.extractCompanies();
        initialCompanies.forEach((company) => {
            if (!uniqueCompanies.some((c) => c.name === company.name)) {
                uniqueCompanies.push(company);
            }
        });
        previousCount = uniqueCompanies.length;
        console.log(`  Initial companies captured: ${previousCount}`);

        // Try scrolling multiple times to load all results
        for (let i = 0; i < CONFIG.scraping.maxScrollAttempts; i++) {
            totalScrollAttempts++;
            console.log(`📜 Scroll attempt ${totalScrollAttempts}/${CONFIG.scraping.maxScrollAttempts}`);

            await this.loadMoreResults();
            await new Promise((resolve) => setTimeout(resolve, 2000));

            const companies = await this.extractCompanies();
            let newlyAdded = 0;

            companies.forEach((company) => {
                if (!uniqueCompanies.some((c) => c.name === company.name && c.address === company.address)) {
                    uniqueCompanies.push(company);
                    newlyAdded++;
                }
            });

            const currentCount = uniqueCompanies.length;
            console.log(`  Found: ${currentCount} unique results after scrolling (new: ${newlyAdded})`);

            if (newlyAdded > 0) {
                noChangeCount = 0;
                previousCount = currentCount;
            } else {
                noChangeCount++;
                console.log(`  ⚠️  No unique results (consecutive no-adds ${noChangeCount})`);
                if (noChangeCount >= 2) {
                    console.log("  🛑 Stopping scroll due to repeated no additional changes (2 retries)");
                    break;
                }
            }

            if (totalScrollAttempts >= CONFIG.scraping.maxScrollAttempts) {
                console.log("  🛑 Reached maximum scroll attempts");
                break;
            }
        }

        console.log(`📊 Final result: ${uniqueCompanies.length} unique companies found for query`);
        return uniqueCompanies;
    }

    /**
     * Run full scraping process
     */
    async scrape() {
        try {
            if (this.runtimeOptions.existingCsv) {
                this.loadExistingCompaniesFromCsv(this.runtimeOptions.existingCsv);
            }

            await this.init();

            let locationsToRun = CONFIG.locations;
            if (this.runtimeOptions.city) {
                if (!this.runtimeOptions.country || !this.runtimeOptions.coords) {
                    throw new Error("Single-city mode requires --country and --coords when --city is provided");
                }

                locationsToRun = [
                    {
                        city: this.runtimeOptions.city,
                        country: this.runtimeOptions.country,
                        coords: this.runtimeOptions.coords,
                        zoom: this.runtimeOptions.zoom || 12,
                        tier: this.runtimeOptions.tier || "Tier1",
                    },
                ];
                console.log(
                    `🎯 Single-city mode: ${this.runtimeOptions.city}, ${this.runtimeOptions.country} (${locationsToRun[0].tier})`,
                );
            } else if (this.runtimeOptions.startCity) {
                const startIndex = CONFIG.locations.findIndex(
                    (loc) => loc.city.toLowerCase() === this.runtimeOptions.startCity.toLowerCase(),
                );
                if (startIndex === -1) {
                    throw new Error(`Start city not found in config: ${this.runtimeOptions.startCity}`);
                }
                locationsToRun = CONFIG.locations.slice(startIndex);
                console.log(`⏭️ Resume mode: starting from ${this.runtimeOptions.startCity} (${locationsToRun.length} cities left)`);
            }

            console.log("\n" + "=".repeat(60));
            console.log(`📍 Scraping accounting companies in EU locations (${locationsToRun.length} cities)`);
            console.log("=".repeat(60));

            for (const locationObj of locationsToRun) {
                this.currentLocation = locationObj;
                console.log(`\n🌍 Location: ${locationObj.city}, ${locationObj.country} (${locationObj.tier})`);

                // Search for each term in this location
                for (const searchTerm of CONFIG.searchTerms) {
                    try {
                        const results = await this.searchAndScrape(searchTerm, locationObj);

                        // Add to companies list (avoid duplicates by name + address + country)
                        results.forEach((company) => {
                            if (
                                !this.companies.find(
                                    (c) =>
                                        c.name === company.name &&
                                        c.address === company.address &&
                                        c.country === locationObj.country,
                                )
                            ) {
                                this.companies.push({
                                    ...company,
                                    searchTerm,
                                    city: locationObj.city,
                                    country: locationObj.country,
                                    locationTier: locationObj.tier,
                                    marketLane: CONFIG.marketLane,
                                });
                            }
                        });
                    } catch (error) {
                        console.error(
                            `❌ Error searching for "${searchTerm}" in ${locationObj.city}, ${locationObj.country}:`,
                            error.message,
                        );
                    }
                }
            }

            // Log results
            await this.logResults();
        } catch (error) {
            console.error("Fatal error:", error);
        } finally {
            if (this.browser) {
                await this.browser.close();
            }
        }
    }

    /**
     * Log results to console and file
     */
    async logResults() {
        console.log("\n" + "=".repeat(60));
        console.log(`✅ SCRAPING COMPLETE`);
        console.log("=".repeat(60));
        console.log(`Total companies found: ${this.companies.length}\n`);

        // Export data to files
        console.log(`📤 Starting export with format: ${CONFIG.output.format}`);
        const exporter = new DataExporter();
        
        if (CONFIG.output.format === "json" || CONFIG.output.format === "both") {
            console.log("Exporting to JSON...");
            exporter.exportToJSON(this.companies);
        }

        let csvPath = null;
        if (CONFIG.output.format === "csv" || CONFIG.output.format === "both") {
            console.log("Exporting to CSV...");
            csvPath = exporter.exportToCSV(this.companies);
        }

        console.log("✅ Export complete\n");

        if (csvPath) {
            await this.runPostProcessing(csvPath);
        }
    }

    async runPostProcessing(csvPath) {
        if (!csvPath) {
            return;
        }

        const dedupedPath = csvPath.replace(/\.csv$/i, "_deduplicated.csv");
        console.log(`🔧 Deduplicating CSV: ${path.basename(csvPath)} -> ${path.basename(dedupedPath)}`);
        await runNodeScript("../deduplicate-csv.js", [csvPath, dedupedPath]);

        console.log(`📧 Running email enrichment on deduplicated file...`);
        await runNodeScript("../email-enricher.js", [dedupedPath]);
    }
}

// Run scraper
const runtimeOptions = parseArgs(process.argv.slice(2));
const scraper = new GoogleMapsScraper(runtimeOptions);
await scraper.scrape();
