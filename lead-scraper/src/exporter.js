import fs from "fs";
import path from "path";
import { CONFIG } from "../config.js";

/**
 * DataExporter - Handles data export to various formats
 */
export class DataExporter {
    constructor() {
        this.dataDir = CONFIG.output.directory;
        this.ensureDataDirectory();
    }

    /**
     * Ensure data directory exists
     */
    ensureDataDirectory() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    /**
     * Export companies to JSON format
     */
    exportToJSON(companies, filename = null) {
        const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
        filename = filename || `companies_raw_${runStamp}.json`;
        const filepath = path.join(this.dataDir, filename);

        const data = {
            metadata: {
                marketLane: CONFIG.marketLane,
                locationsConfigured: Array.isArray(CONFIG.locations) ? CONFIG.locations.length : 1,
                scrapedAt: new Date().toISOString(),
                totalCount: companies.length,
            },
            companies,
        };

        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`✅ Data exported to ${filepath}`);
        return filepath;
    }

    /**
     * Export companies to CSV format
     */
    exportToCSV(companies, filename = null) {
        const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
        filename = filename || `companies_raw_${runStamp}.csv`;
        const filepath = path.join(this.dataDir, filename);

        if (companies.length === 0) {
            console.warn("No companies to export");
            return null;
        }

        // CSV headers
        const headers = [
            "Name",
            "Address",
            "Rating",
            "Website",
            "Search Term",
            "City",
            "Country",
            "Location Tier",
            "Market Lane",
            "Scraped At",
        ];
        const rows = companies.map((company) => [
            `"${(company.name || "").replace(/"/g, '""')}"`,
            `"${(company.address || "").replace(/"/g, '""')}"`,
            `"${(company.rating || "N/A").replace(/"/g, '""')}"`,
            `"${(company.website || "").replace(/"/g, '""')}"`,
            `"${(company.searchTerm || "").replace(/"/g, '""')}"`,
            `"${(company.city || "").replace(/"/g, '""')}"`,
            `"${(company.country || "").replace(/"/g, '""')}"`,
            `"${(company.locationTier || "").replace(/"/g, '""')}"`,
            `"${(company.marketLane || CONFIG.marketLane || "").replace(/"/g, '""')}"`,
            company.scrapedAt || new Date().toISOString(),
        ]);

        const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

        fs.writeFileSync(filepath, csvContent);
        console.log(`✅ Data exported to ${filepath}`);
        return filepath;
    }

    /**
     * Export to both JSON and CSV
     */
    exportAll(companies) {
        this.exportToJSON(companies);
        this.exportToCSV(companies);
    }

    /**
     * Read previously exported data
     */
    readExportedData(filename) {
        const filepath = path.join(this.dataDir, filename);
        if (!fs.existsSync(filepath)) {
            throw new Error(`File not found: ${filepath}`);
        }

        const content = fs.readFileSync(filepath, "utf8");
        return JSON.parse(content);
    }

    /**
     * List all exported files
     */
    listExportedFiles() {
        if (!fs.existsSync(this.dataDir)) {
            return [];
        }
        return fs.readdirSync(this.dataDir);
    }
}
