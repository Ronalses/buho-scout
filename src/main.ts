import { BrowserFactory } from "./infrastructure/scraper/BrowserFactory";
import { PlaywrightScraper } from "./infrastructure/scraper/PlaywrightScraper";
// import { PrismaStoreRepository } from "./infrastructure/database/PrismaStoreRepository";
import { InMemoryStoreRepository } from "./infrastructure/database/InMemoryStoreRepository";
import { ScrapeStoreUseCase } from "./application/use-cases/ScrapeStoreUseCase";
import { Store } from "./domain/entities/Store";
import crypto from "crypto";

async function main() {
    console.log("--- Starting Shipping Rate Scraper ---");

    // 1. Initialize Infrastructure
    const browserFactory = BrowserFactory.getInstance();
    const scraper = new PlaywrightScraper(browserFactory);
    // const storeRepo = new PrismaStoreRepository();
    const storeRepo = new InMemoryStoreRepository();

    // 2. Initialize Use Cases
    const scrapeUseCase = new ScrapeStoreUseCase(storeRepo, scraper);

    try {
        // 3. Seeding (Demo Only) - Ensure we have something to scrape
        const pending = await storeRepo.findPending();
        if (!pending) {
            console.log("No pending stores found. Seeding a test store...");
            const testStore = new Store(
                crypto.randomUUID(),
                "https://hard-coded-test-store.myshopify.com",
                "pending",
                null,
                new Date(),
                new Date()
            );
            await storeRepo.save(testStore);
            console.log(`Seeded store: ${testStore.url}`);
        }

        // 4. Execution Loop
        let keepRunning = true;
        while (keepRunning) {
            const nextStore = await storeRepo.findPending();
            if (!nextStore) {
                console.log("No more pending stores. Exiting.");
                keepRunning = false;
                break;
            }

            console.log(`Processing store: ${nextStore.url}`);
            // NOTE: In Phase 3 scraper, we mock rates, but here we run the full architectural flow
            await scrapeUseCase.execute(nextStore.id);

            // Verification: Check if it's strictly mocking or actually opening browser
            // BrowserFactory is configured to check HEADLESS_MODE env var.
        }

    } catch (error) {
        console.error("Fatal error in main loop:", error);
    } finally {
        // 5. Cleanup
        console.log("Cleaning up resources...");
        await browserFactory.close();
        await storeRepo.disconnect();
        console.log("--- Finished ---");
    }
}

main();
