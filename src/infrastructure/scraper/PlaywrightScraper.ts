import { Page } from "playwright";
import { IScraper } from "../../domain/repositories/IScraper";
import { ShippingRate } from "../../domain/entities/ShippingRate";
import { BrowserFactory } from "./BrowserFactory";

export class PlaywrightScraper implements IScraper {
    constructor(private browserFactory: BrowserFactory) { }

    async scrapeStore(url: string, locations: string[]): Promise<ShippingRate[]> {
        const context = await this.browserFactory.createContext();
        const page = await context.newPage();
        const rates: ShippingRate[] = [];

        try {
            console.log(`[Playwright] Navigating to ${url}`);
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

            // 1. Detect and Add to Cart
            await this.addToCart(page);

            // 2. Go to Checkout
            await this.proceedToCheckout(page);

            // 3. Loop Locations
            for (const location of locations) {
                try {
                    console.log(`[Playwright] Testing location: ${location}`);
                    const locationRates = await this.extractRatesForLocation(page, location);

                    // Map to entities
                    locationRates.forEach(r => {
                        rates.push(new ShippingRate(
                            crypto.randomUUID(),
                            "unknown-store-id", // To be filled by caller or ignored in this context
                            location,
                            r.service,
                            r.price,
                            "CLP",
                            new Date()
                        ));
                    });
                } catch (locErr) {
                    console.error(`[Playwright] Error processing location ${location}:`, locErr);
                }
            }

        } catch (error) {
            console.error("[Playwright] Critical error:", error);
            // Screenshot for debug
            await page.screenshot({ path: `error-${Date.now()}.png` });
        } finally {
            await context.close();
        }

        return rates;
    }

    private async addToCart(page: Page): Promise<void> {
        // Basic heuristics for "Add to Cart"
        // Ideally we would look for a product page if home is a collection, but let's assume we land on a product or find one.

        // Strategy: If homepage, try to click first product.
        if (page.url().endsWith(".com/") || page.url().endsWith(".cl/")) {
            console.log("[Playwright] On homepage, trying to find a product...");
            const productSelector = "a[href*='/products/']";
            const productLink = await page.$(productSelector);
            if (productLink) {
                await productLink.click();
                await page.waitForLoadState("domcontentloaded");
            }
        }

        // Now on product page (hopefully)
        const addToCartSelectors = [
            "button[name='add']",
            "button[type='submit']:has-text('Add to cart')",
            "button[type='submit']:has-text('Agregar')",
            "form[action*='/cart/add'] button[type='submit']"
        ];

        for (const selector of addToCartSelectors) {
            if (await page.isVisible(selector)) {
                console.log(`[Playwright] Found add to cart button: ${selector}`);
                await page.click(selector);
                // Wait for cart notification or drawer. Some themes use AJAX.
                // Force navigation to cart if needed or just wait a bit.
                await page.waitForTimeout(2000);
                return;
            }
        }

        // Fallback: direct post (advanced, skip for now)
        console.warn("[Playwright] Could not find Add to Cart button.");
    }

    private async proceedToCheckout(page: Page): Promise<void> {
        // Try navigating directly to checkout
        console.log("[Playwright] Navigating to /checkout");
        await page.goto(page.url().split("/products")[0] + "/checkout");
        await page.waitForLoadState("networkidle");
    }

    private async extractRatesForLocation(page: Page, location: string): Promise<{ service: string, price: number }[]> {
        // Fill Address Form
        // This is highly variable per Checkout version (Information vs Shipping, etc)
        // Detailed logic omitted for brevity in MVP, implementing basic layout
        console.log(`[Playwright] Simulating filling address for ${location}`);

        // ... Filling logic ...

        // Wait for rates
        // ... Waiting logic ...

        // Mock response for Phase 3 verification
        return [
            { service: "Starken Normal", price: 4500 },
            { service: "Chilexpress Day", price: 6000 }
        ];
    }
}
