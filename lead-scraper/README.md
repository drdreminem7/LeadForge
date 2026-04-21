# Google Maps Accounting Companies Scraper

A robust Node.js scraper for collecting accounting company information from Google Maps for Sofia, Bulgaria.

## Features

- 🔍 Searches multiple accounting-related terms (accounting firms, tax consultants, bookkeeping services, etc.)
- 📍 Focused on Sofia, Bulgaria
- 🤖 Uses Puppeteer for reliable browser automation
- 📋 Extracts company name, address, rating, and review information
- 🎯 Automatic deduplication of results
- 📊 Console logging with detailed output
- 🚀 Easy to extend for additional locations

## Technology Stack

- **Node.js** - JavaScript runtime
- **Puppeteer Core** - Headless Chrome/Chromium automation (uses system Chrome)
- **JavaScript (ES6 Modules)** - Modern async/await patterns

## Prerequisites

- Node.js 18+ installed
- Google Chrome installed (system browser)
- Internet connection

## Installation

```bash
# Clone or navigate to the project directory
cd lead-scraper

# Install dependencies
npm install
```

This will install:

- `puppeteer-core` - Browser automation library (uses system Chrome)
- `dotenv` - Environment variable management

## Usage

### Basic Scraping

```bash
npm start
```

This runs the scraper for Sofia, Bulgaria and logs all accounting companies found.

### Output Example

```
============================================================
📍 Scraping accounting companies in Sofia, Bulgaria
============================================================

🔍 Searching for: "accounting firms"
Page title: "accounting firms in Sofia, Bulgaria - Google Maps"
Current URL: https://www.google.com/maps/search/...
📋 Extracting company data...
Extracted 8 companies
  Found: 8 results

[... searches all terms ...]

============================================================
✅ SCRAPING COMPLETE
============================================================
Total companies found: 29

1. Zara Consult
   Location: Sofia, Bulgaria
   Address: Personalized Approach and Competitive Prices...
   Rating: 4.5 stars
   Found via: accounting firms

2. B&Si Service - Accounting Services
   Location: Sofia, Bulgaria
   Address: Nine offices in the country and over 30 years...
   Rating: 4.8 stars
   Found via: accounting firms

[... more results ...]
```

## What Gets Collected

For each accounting company found, the scraper extracts:

- **Business Name**: The company or service name
- **Address**: Physical location in Sofia, Bulgaria
- **Rating**: Star rating (1-5 stars) with review count when available
- **Search Term**: Which search query found this company
- **Timestamp**: When the data was scraped

### Sample Output

```
1. Zara Consult
   Location: Sofia, Bulgaria
   Address: Personalized Approach and Competitive Prices
   Rating: 4.5 stars
   Found via: accounting firms

2. B&Si Service - Accounting Services
   Location: Sofia, Bulgaria
   Address: Nine offices in the country and over 30 years experience
   Rating: 4.8 stars
   Found via: accounting firms
```

### Debug Mode

```bash
npm run scrape:debug
```

Starts the scraper with Node.js inspector enabled for debugging.

## Configuration

Edit `config.js` to customize:

- **Location**: Change `CONFIG.location` to target different cities
- **Search Terms**: Add or remove search terms in `CONFIG.searchTerms`
- **Browser Settings**: Adjust headless mode, viewport, and arguments
- **Scraping Settings**: Modify delays, retries, and result pagination
- **Output**: Change output format and directory

### Example: Scrape Multiple Locations

Edit `config.js` and modify the location:

```javascript
location: "Plovdiv, Bulgaria",  // Changed from "Sofia, Bulgaria"
```

## Output

The scraper logs results to the console in a formatted table:

```
============================================================
✅ SCRAPING COMPLETE
============================================================
Total companies found: 45

1. ABC Accounting Ltd.
   Location: Sofia, Bulgaria
   Address: ul. Geo Milev 56, Sofia
   Rating: 4.8 stars (125 reviews)
   Found via: accounting firms
   Scraped: 2026-03-22T10:30:45.123Z

2. XYZ Tax Services
   ...
```

## How It Works

1. **Initialization**: Launches a headless Chrome browser
2. **Search**: Iterates through each search term in the config
3. **Scraping**: Navigates to Google Maps search results for each query
4. **Extraction**: Parses HTML to extract company information
5. **Deduplication**: Removes duplicate companies by name
6. **Logging**: Displays results in console with formatting

## Technical Details

### Search Terms Included

- Accounting firms
- Accounting companies
- Accountants
- Tax consultants
- Bookkeeping services
- Auditors
- Chartered accountants
- Financial advisors
- Accounting services
- Tax advisors

### Data Extracted

Per company:

- Business name
- Rating and review count
- Address
- Search term used
- Timestamp of scrape

## Best Practices

- ✅ Respects Google's robots.txt and terms of service by using normal browser interactions
- ✅ Uses reasonable delays between requests
- ✅ Implements user-agent rotation
- ✅ Includes error handling and retry logic
- ✅ Avoids aggressive scraping patterns

## Limitations

- Google Maps interface may change, requiring selector updates
- Results depend on Google's indexing and ranking
- Some businesses may not be listed on Google Maps
- Geographic boundaries may not be perfectly accurate

## Future Enhancements

- [ ] JSON file export for data persistence
- [ ] CSV export functionality
- [ ] Database storage (MongoDB/PostgreSQL)
- [ ] Advanced filtering and sorting
- [ ] Email/phone number extraction
- [ ] Website URL capture
- [ ] Business hours extraction
- [ ] Review sentiment analysis
- [ ] Proxy rotation for large-scale scraping
- [ ] Schedule-based scraping with cron

## Troubleshooting

### No results found

- Check network connection
- Verify Google Maps is accessible in your region
- Try adding more search terms to `config.js`

### Timeout errors

- Increase `CONFIG.scraping.timeout` in `config.js`
- Check your internet speed
- Verify Google Maps hasn't changed its selectors

### Memory errors

- Increase Node.js memory: `node --max-old-space-size=4096 src/index.js`
- Close other applications

## Legal Notice

This tool is for research and data collection purposes only. Ensure you comply with:

- Google's Terms of Service
- Local data protection laws (GDPR, etc.)
- Website terms and conditions
- Robots.txt directives

Use responsibly and respect website rate limits.

## License

MIT

## Author

LeadForge Team
