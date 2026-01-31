import { IScraper } from "../../domain/repositories/IScraper";
import { IStoreRepository } from "../../domain/repositories/IStoreRepository";

export class ScrapeStoreUseCase {
    constructor(
        private storeRepository: IStoreRepository,
        private scraper: IScraper
    ) { }

    async execute(storeId: string): Promise<void> {
        const store = await this.storeRepository.findById(storeId);
        if (!store) {
            throw new Error(`Store with id ${storeId} not found`);
        }

        try {
            console.log(`[ScrapeStoreUseCase] Starting scrape for store: ${store.url}`);
            const rates = await this.scraper.scrapeStore(store.url, [
                "Santiago",
                "Til Til",
                "Buin",
            ]);

            if (rates.length > 0) {
                console.log(`[ScrapeStoreUseCase] Found ${rates.length} rates. Saving...`);
                await this.storeRepository.saveRates(rates);
            } else {
                console.log(`[ScrapeStoreUseCase] No rates found.`);
            }

            await this.storeRepository.updateStatus(store.id, "processed");
            console.log(`[ScrapeStoreUseCase] Store ${store.id} processed successfully.`);
        } catch (error: any) {
            console.error(`[ScrapeStoreUseCase] Error scraping store ${store.id}:`, error);
            await this.storeRepository.updateStatus(store.id, "error", error.message);
        }
    }
}
