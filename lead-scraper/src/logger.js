export class Logger {
    constructor(prefix = "Scraper") {
        this.prefix = prefix;
    }

    log(message) {
        console.log(`[${this.prefix}] ${message}`);
    }

    info(message) {
        console.log(`ℹ️  [${this.prefix}] ${message}`);
    }

    success(message) {
        console.log(`✅ [${this.prefix}] ${message}`);
    }

    warning(message) {
        console.warn(`⚠️  [${this.prefix}] ${message}`);
    }

    error(message, error = null) {
        console.error(`❌ [${this.prefix}] ${message}`);
        if (error) {
            console.error(`   Error: ${error.message}`);
        }
    }

    debug(message) {
        if (process.env.DEBUG) {
            console.log(`🐛 [${this.prefix}] ${message}`);
        }
    }

    section(title) {
        console.log("\n" + "=".repeat(60));
        console.log(`${title}`);
        console.log("=".repeat(60));
    }

    table(data) {
        console.table(data);
    }
}
