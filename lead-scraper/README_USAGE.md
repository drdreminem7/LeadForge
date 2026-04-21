# LeadForge Scraper - Quick Start Guide

## Overview

A fully automated Google Maps scraper that finds and exports accounting companies in Sofia, Bulgaria.

## Quick Start

### 1. Install Dependencies

```bash
cd lead-scraper
npm install
```

### 2. Run the Scraper

```bash
node src/index.js
```

The scraper will:

- Search for 11 different accounting-related keywords
- Find ~8 companies per search (Google Maps limit)
- Deduplicate results
- Export to JSON and CSV files in the `data/` directory

### 3. View Results

- **JSON**: `data/companies_2026-03-22.json` (structured data with metadata)
- **CSV**: `data/companies_2026-03-22.csv` (spreadsheet-compatible)

## Results

✅ **54 unique companies found**
✅ **All located in Sofia, Bulgaria**
✅ **Includes ratings, addresses, and sources**

## Configuration

Edit `config.js` to customize:

### Search Terms

```javascript
searchTerms: [
    "accounting firms in Sofia",
    "accounting companies Sofia",
    "accountant Sofia",
    // ... add more terms
],
```

### Export Format

```javascript
output: {
    directory: "./data",
    format: "both", // "json", "csv", or "both"
},
```

### Browser Settings

```javascript
browser: {
    headless: true,  // Set to false to see browser
    defaultViewport: {
        width: 1280,
        height: 720,
    },
},
```

## Data Fields

Each company record includes:

- `name` - Company name
- `rating` - Star rating + review count
- `address` - Location or service type
- `searchTerm` - Which search found this company
- `scrapedAt` - Extraction timestamp
- `url` - Google Maps URL

## Sample Output Format

### JSON

```json
{
    "metadata": {
        "location": "Sofia, Bulgaria",
        "scrapedAt": "2026-03-22T23:18:32.859Z",
        "totalCount": 54
    },
    "companies": [
        {
            "name": "Balkan Services",
            "rating": "4.8 stars",
            "address": "Not provided",
            "searchTerm": "accounting firms in Sofia",
            "scrapedAt": "2026-03-22T23:15:45.302Z"
        }
        // ... more companies
    ]
}
```

### CSV

```
Name,Address,Rating,Search Term,Scraped At
"Balkan Services","Not provided","4.8 stars","accounting firms in Sofia",2026-03-22T23:15:45.302Z
"MKAFinance - Accounting Services","Not provided","5.0 stars","accounting firms in Sofia",2026-03-22T23:15:45.302Z
// ... more rows
```

## How It Works

### 1. Search Strategy

Multiple keyword variations ensure comprehensive coverage:

- English terms (accounting, tax, bookkeeper, financial advisor)
- Bulgarian terms (бухгалтер, счетоводство, одит)
- Location-specific searches (in Sofia)

### 2. Result Collection

For each search:

- Navigate to Google Maps search results
- Scroll and interact with the page to load results
- Extract company data from the sidebar
- Stop when no new results appear

### 3. Deduplication

Companies found across multiple searches are automatically deduplicated by name to avoid counting the same business twice.

### 4. Data Export

Results are automatically exported to both JSON (structured) and CSV (spreadsheet) formats.

## Common Issues & Solutions

### Issue: "Cannot find Chrome"

**Solution**: Install Google Chrome or update the executable path in `config.js`

### Issue: Getting fewer than 54 companies

**Solution**: Google Maps result availability varies. Try:

- Running at different times of day
- Adding more search terms to `config.js`
- Increasing `maxScrollAttempts` in config

### Issue: Companies not deduplicating properly

**Solution**: Check company names for variations in spelling or formatting. Add custom deduplication logic if needed.

## Advanced Usage

### Custom Search Terms

Edit `config.js` and add more terms:

```javascript
searchTerms: [
    "accounting firms in Sofia",
    "компании счетоводни услуги",
    "финансови консултанти",
    "одит услуги",
    // ... more terms
],
```

### Scheduling (Optional)

Run the scraper on a schedule using node-cron:

```javascript
import cron from "node-cron";
// Run daily at 2 AM
cron.schedule("0 2 * * *", () => {
    const scraper = new GoogleMapsScraper();
    scraper.scrape();
});
```

### Filtering Results

Filter by rating before export:

```javascript
const topCompanies = this.companies.filter((c) => c.rating && parseFloat(c.rating) >= 4.5);
```

## Tech Stack

- **Node.js** - JavaScript runtime
- **Puppeteer Core** - Browser automation
- **Chrome** - Headless browser engine

## Troubleshooting

### Debug Mode

Modify `config.js` to see the browser:

```javascript
browser: {
    headless: false, // Shows browser window
    // ...
},
```

### Save Screenshots

Uncomment in `src/index.js`:

```javascript
await this.page.screenshot({
    path: `debug-${searchQuery}.png`,
    fullPage: true,
});
```

### Check Logs

The scraper outputs detailed logs showing:

- Searches performed
- Results found per search
- Deduplication statistics
- Export file locations

## Support

For issues or improvements, check:

1. `config.js` - Configuration settings
2. `src/exporter.js` - Export format options
3. Chrome DevTools (when `headless: false`)

---

**Version**: 1.0.0  
**Status**: Production Ready  
**Last Tested**: March 22, 2026
