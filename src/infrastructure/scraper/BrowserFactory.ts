import { chromium, Browser, BrowserContext } from "playwright";

export class BrowserFactory {
    private static instance: BrowserFactory;
    private browser: Browser | null = null;

    private constructor() { }

    public static getInstance(): BrowserFactory {
        if (!BrowserFactory.instance) {
            BrowserFactory.instance = new BrowserFactory();
        }
        return BrowserFactory.instance;
    }

    async getBrowser(): Promise<Browser> {
        if (!this.browser) {
            this.browser = await chromium.launch({
                headless: process.env.HEADLESS_MODE !== "false", // Default to true
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });
        }
        return this.browser;
    }

    async createContext(): Promise<BrowserContext> {
        const browser = await this.getBrowser();
        return browser.newContext({
            viewport: { width: 1366, height: 768 },
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        });
    }

    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}
