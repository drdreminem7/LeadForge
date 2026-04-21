// Configuration for EU accounting company scraper

export const CONFIG = {
    marketLane: "EU",

    // Default location fallback for metadata compatibility
    location: "Berlin, Germany",

    // Active city for this run — swap in any city from ALL_CITIES below when needed
    locations: [
        { city: "Vienna", country: "Austria", coords: "48.2082,16.3738", zoom: 12, tier: "Tier1" },
    ],

    // ALL_CITIES — full EU Tier 1 list for future runs (paste into locations[] to activate):
    // { city: "Berlin",       country: "Germany",     coords: "52.5200,13.4050",  zoom: 12, tier: "Tier1" },
    // { city: "Munich",       country: "Germany",     coords: "48.1351,11.5820",  zoom: 12, tier: "Tier1" },
    // { city: "Frankfurt",    country: "Germany",     coords: "50.1109,8.6821",   zoom: 12, tier: "Tier1" },
    // { city: "Hamburg",      country: "Germany",     coords: "53.5511,9.9937",   zoom: 12, tier: "Tier1" },
    // { city: "Amsterdam",    country: "Netherlands", coords: "52.3676,4.9041",   zoom: 12, tier: "Tier1" },
    // { city: "Rotterdam",    country: "Netherlands", coords: "51.9244,4.4777",   zoom: 12, tier: "Tier1" },
    // { city: "Eindhoven",    country: "Netherlands", coords: "51.4416,5.4697",   zoom: 12, tier: "Tier1" },
    // { city: "Dublin",       country: "Ireland",     coords: "53.3498,-6.2603",  zoom: 12, tier: "Tier1" },
    // { city: "Cork",         country: "Ireland",     coords: "51.8985,-8.4756",  zoom: 12, tier: "Tier1" },
    // { city: "Vienna",       country: "Austria",     coords: "48.2082,16.3738",  zoom: 12, tier: "Tier1" },
    // { city: "Graz",         country: "Austria",     coords: "47.0707,15.4395",  zoom: 12, tier: "Tier1" },
    // { city: "Bucharest",    country: "Romania",     coords: "44.4268,26.1025",  zoom: 12, tier: "Tier1" },
    // { city: "Cluj-Napoca",  country: "Romania",     coords: "46.7712,23.6236",  zoom: 12, tier: "Tier1" },
    // { city: "Timisoara",    country: "Romania",     coords: "45.7489,21.2087",  zoom: 12, tier: "Tier1" },
    // { city: "Warsaw",       country: "Poland",      coords: "52.2297,21.0122",  zoom: 12, tier: "Tier1" },
    // { city: "Krakow",       country: "Poland",      coords: "50.0647,19.9450",  zoom: 12, tier: "Tier1" },
    // { city: "Wroclaw",      country: "Poland",      coords: "51.1079,17.0385",  zoom: 12, tier: "Tier1" },
    // { city: "Athens",       country: "Greece",      coords: "37.9838,23.7275",  zoom: 12, tier: "Tier1" },
    // { city: "Thessaloniki", country: "Greece",      coords: "40.6401,22.9444",  zoom: 12, tier: "Tier1" },
    // { city: "Lisbon",       country: "Portugal",    coords: "38.7223,-9.1393",  zoom: 12, tier: "Tier1" },
    // { city: "Porto",        country: "Portugal",    coords: "41.1579,-8.6291",  zoom: 12, tier: "Tier1" },
    // { city: "Prague",       country: "Czechia",     coords: "50.0755,14.4378",  zoom: 12, tier: "Tier1" },
    // { city: "Brno",         country: "Czechia",     coords: "49.1951,16.6068",  zoom: 12, tier: "Tier1" },
    // { city: "Madrid",       country: "Spain",       coords: "40.4168,-3.7038",  zoom: 12, tier: "Tier1" },
    // { city: "Barcelona",    country: "Spain",       coords: "41.3874,2.1686",   zoom: 12, tier: "Tier1" },
    // { city: "Valencia",     country: "Spain",       coords: "39.4699,-0.3763",  zoom: 12, tier: "Tier1" },

    // EU-focused terms for accounting, tax, payroll, audit and outsourcing
    searchTerms: [
        "accounting firms",
        "accounting services",
        "bookkeeping services",
        "tax advisory",
        "VAT consulting",
        "payroll services",
        "audit firm",
        "financial controller outsourcing",
        "accounting outsourcing",
        "steuerberater",
        "buchhaltung",
        "belastingadviseur",
        "boekhouder",
        "contabilitate",
        "consultanta fiscala",
        "ksiegowosc",
        "doradca podatkowy",
        "logistiko grafeio",
        "contabilidad",
        "asesoria fiscal",
        "contabilidade",
        "danovy poradce",
    ],

    // Browser settings
    browser: {
        headless: true,
        defaultViewport: {
            width: 1280,
            height: 720,
        },
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    },

    // Scraping settings
    scraping: {
        maxRetries: 3,
        timeout: 30000,
        scrollDelay: 1800,
        maxScrollAttempts: 30,
    },

    // Output settings
    output: {
        directory: "./data",
        format: "csv",
    },
};


