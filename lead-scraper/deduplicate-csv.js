import fs from "fs";
import path from "path";

function parseCsvLine(line) {
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

function toCsvLine(values) {
    return values
        .map((value) => {
            const normalized = String(value ?? "");
            return `"${normalized.replace(/"/g, '""')}"`;
        })
        .join(",");
}

function normalizeKeyPart(value) {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function extractDomain(value) {
    const website = String(value ?? "").trim();
    if (!website) return "";
    try {
        const url = new URL(website);
        return url.hostname.replace(/^www\./, "").toLowerCase();
    } catch {
        return "";
    }
}

function confidenceScore(value) {
    const normalized = normalizeKeyPart(value);
    if (normalized === "high") return 3;
    if (normalized === "medium") return 2;
    if (normalized === "low") return 1;
    return 0;
}

function chooseBetterRow(existingRow, incomingRow, indexes) {
    const existingConfidence = confidenceScore(existingRow[indexes.confidenceIndex]);
    const incomingConfidence = confidenceScore(incomingRow[indexes.confidenceIndex]);
    if (incomingConfidence !== existingConfidence) {
        return incomingConfidence > existingConfidence ? incomingRow : existingRow;
    }

    const existingHasWebsite = normalizeKeyPart(existingRow[indexes.websiteIndex]).length > 0;
    const incomingHasWebsite = normalizeKeyPart(incomingRow[indexes.websiteIndex]).length > 0;
    if (existingHasWebsite !== incomingHasWebsite) {
        return incomingHasWebsite ? incomingRow : existingRow;
    }

    const existingHasAddress = normalizeKeyPart(existingRow[indexes.addressIndex]).length > 0;
    const incomingHasAddress = normalizeKeyPart(incomingRow[indexes.addressIndex]).length > 0;
    if (existingHasAddress !== incomingHasAddress) {
        return incomingHasAddress ? incomingRow : existingRow;
    }

    return existingRow;
}

function main() {
    const inputPath = process.argv[2];
    const outputPath = process.argv[3];

    if (!inputPath) {
        console.error("Usage: node deduplicate-csv.js <input.csv> [output.csv]");
        process.exit(1);
    }

    if (!fs.existsSync(inputPath)) {
        console.error(`Input file not found: ${inputPath}`);
        process.exit(1);
    }

    const resolvedInputPath = path.resolve(inputPath);
    const resolvedOutputPath = outputPath
        ? path.resolve(outputPath)
        : resolvedInputPath.replace(/\.csv$/i, "_deduplicated.csv");

    const content = fs.readFileSync(resolvedInputPath, "utf8");
    const lines = content.split(/\r?\n/).filter((line) => line.length > 0);

    if (lines.length < 2) {
        console.error("CSV does not contain data rows.");
        process.exit(1);
    }

    const header = parseCsvLine(lines[0]);
    const nameIndex = header.findIndex((column) => column.trim().toLowerCase() === "name");
    const addressIndex = header.findIndex((column) => column.trim().toLowerCase() === "address");
    const websiteIndex = header.findIndex((column) => column.trim().toLowerCase() === "website");
    const confidenceIndex = header.findIndex((column) => column.trim().toLowerCase() === "confidence");
    if (nameIndex === -1) {
        console.error("CSV must contain a Name column.");
        process.exit(1);
    }

    const seen = new Map();
    const duplicateRows = [];
    const uniqueRows = [header];
    const keyToRowPosition = new Map();

    const indexes = {
        addressIndex,
        websiteIndex,
        confidenceIndex,
    };

    for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
        const row = parseCsvLine(lines[lineIndex]);
        const name = normalizeKeyPart(row[nameIndex]);
        const address = addressIndex >= 0 ? row[addressIndex] ?? "" : "";
        const website = websiteIndex >= 0 ? row[websiteIndex] ?? "" : "";
        const domain = extractDomain(website);
        const key = `${name}::${domain || "no-domain"}`;

        if (!name) {
            continue;
        }

        if (seen.has(key)) {
            duplicateRows.push({
                rowNumber: lineIndex + 1,
                firstSeenRow: seen.get(key),
                name: row[nameIndex] ?? "",
                address: row[addressIndex] ?? "",
            });

            const rowPos = keyToRowPosition.get(key);
            const currentKept = uniqueRows[rowPos];
            uniqueRows[rowPos] = chooseBetterRow(currentKept, row, indexes);
            continue;
        }

        seen.set(key, lineIndex + 1);
        keyToRowPosition.set(key, uniqueRows.length);
        uniqueRows.push(row);
    }

    const output = uniqueRows.map((row) => toCsvLine(row)).join("\n") + "\n";
    fs.writeFileSync(resolvedOutputPath, output, "utf8");

    console.log(`Input rows: ${lines.length - 1}`);
    console.log(`Unique rows: ${uniqueRows.length - 1}`);
    console.log(`Duplicate rows: ${duplicateRows.length}`);
    console.log(`Output file: ${resolvedOutputPath}`);

    if (duplicateRows.length > 0) {
        console.log("First duplicates found:");
        duplicateRows.slice(0, 20).forEach((duplicate) => {
            console.log(
                `- row ${duplicate.rowNumber} duplicates row ${duplicate.firstSeenRow}: ${duplicate.name} | ${duplicate.address}`,
            );
        });
    }
}

main();