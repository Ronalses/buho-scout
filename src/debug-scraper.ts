import { BrowserFactory } from "./infrastructure/scraper/BrowserFactory";
import { PlaywrightScraper } from "./infrastructure/scraper/PlaywrightScraper";

async function run() {
    const url = process.argv[2] || "https://hard-coded-test-store.myshopify.com";
    console.log(`Testing Scraper against: ${url}`);

    const factory = BrowserFactory.getInstance();
    const scraper = new PlaywrightScraper(factory);

    try {
        // NOTE: This uses a mock return in the current implementation of extractRatesForLocation
        // so it won't actually fail on real sites, but it will test the navigation flow commands.
        // For a real test, provide a valid Shopify product URL.
        const rates = await scraper.scrapeStore(url, ["Santiago", "Buin"]);
        console.log("Scraping Result:");
        console.log(JSON.stringify(rates, null, 2));
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await factory.close();
    }
}

run();
