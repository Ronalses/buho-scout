import { chromium, Page } from 'playwright';

// Configuration
const LOCATIONS = ["Santiago", "Til Til", "Buin"];
const DUMMY_USER = {
    email: "test@buho.cl",
    firstName: "Scraper",
    lastName: "Bot",
    address: "Calle Falsa 123",
    zip: "9999999"
};

async function main() {
    // 1. Read URL from args
    const url = process.argv[2];
    if (!url) {
        console.error("Usage: npx tsx src/index.ts <SHOPIFY_STORE_URL>");
        process.exit(1);
    }

    console.log(`Starting scraper for: ${url}`);

    const browser = await chromium.launch({ headless: false }); // Headless false to see execution
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // 2. Navigate to URL
        console.log(`[1/6] Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // 3. Find and navigate to a product
        console.log(`[2/6] Finding a product...`);
        await findAndGoToProduct(page);

        // 4. Add to Cart
        console.log(`[3/6] Adding to cart...`);
        await addToCart(page);

        // 5. Navigate to Checkout
        console.log(`[4/6] Navigating to Checkout...`);
        await proceedToCheckout(page);

        // 6. Loop communes and extract rates
        console.log(`[5/6] Extracting rates for locations: ${LOCATIONS.join(", ")}`);

        for (const location of LOCATIONS) {
            console.log(`\n--- Processing Location: ${location} ---`);
            try {
                await extractRatesForLocation(page, location);
            } catch (error) {
                console.error(`Failed to extract rates for ${location}:`, error);
            }
        }

        console.log("\n[6/6] Process Completed.");

    } catch (error) {
        console.error("Critical Error:", error);
    } finally {
        await browser.close();
    }
}

// --- Helper Functions (Adapted from previous robust implementation) ---

async function findAndGoToProduct(page: Page) {
    // Heuristic: Check homepage for product links
    // Often /products/handle

    // Fallback: Collections page if homepage has no clear products
    let productUrl = await findProductLink(page);

    if (!productUrl) {
        console.log("No products found on homepage, trying /collections/all...");
        await page.goto(new URL('/collections/all', page.url()).toString(), { waitUntil: 'domcontentloaded' });
        productUrl = await findProductLink(page);
    }

    if (productUrl) {
        console.log(`Navigating to product: ${productUrl}`);
        await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
    } else {
        throw new Error("Could not find any product to add to cart.");
    }
}

async function findProductLink(page: Page): Promise<string | null> {
    const links = await page.$$("a[href*='/products/']");
    for (const link of links) {
        const href = await link.getAttribute('href');
        const isVisible = await link.isVisible();
        if (href && isVisible && href.length > 5) { // Basic validation
            // Return full URL
            return href.startsWith('http') ? href : new URL(href, page.url()).toString();
        }
    }
    return null;
}

async function addToCart(page: Page) {
    const selectors = [
        "form[action*='/cart/add'] [type='submit']",
        "button[name='add']",
        "button[id*='AddToCart']",
        "#AddToCart",
        "button[type='submit']:has-text('Agregar')",
        "button[type='submit']:has-text('Add to cart')",
        "button:has-text('Agregar al carrito')"
    ];

    let clicked = false;
    for (const selector of selectors) {
        if (await page.isVisible(selector)) {
            console.log(`Clicking 'Add to Cart' using selector: ${selector}`);

            // Sometimes there are multiple buttons (e.g. sticky footer), pick the first visible one
            await page.click(selector);
            clicked = true;
            // Wait for potential cart drawer/notification or simple timeout
            await page.waitForTimeout(3000);
            break;
        }
    }

    if (!clicked) {
        throw new Error("Add to Cart button not found.");
    }
}

async function proceedToCheckout(page: Page) {
    // Force navigate to /checkout to bypass cart drawer interactions
    const checkoutUrl = new URL('/checkout', page.url()).toString();
    console.log(`Force navigating to: ${checkoutUrl}`);
    await page.goto(checkoutUrl, { waitUntil: 'domcontentloaded' });

    // Wait for a key checkout element to confirm we are there
    try {
        await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (e) {
        // ignore timeout, proceed
    }
}

async function extractRatesForLocation(page: Page, location: string) {
    // 1. Return to Contact Information step if needed
    // Look for breadcrumbs or "return to information" link if we are in shipping step
    // Or just force URL to step=contact_information

    const currentUrl = new URL(page.url());

    // If we are technically past the contact step, we need to go back.
    // However, Shopify URLs change (checkouts/c/.../information).
    // Safest way: if we see shipping methods, verify if address matches. If not, go back.
    // For simplicity in this scraper: Always go to "information" step to change address.

    if (await page.isVisible(".section--shipping-method") || await page.isVisible(".section--payment-method")) {
        console.log("Not in Information step, navigating back...");
        // Usually there is a "Change" link or breadcrumb. 
        // Or we can append ?step=contact_information
        const infoUrl = new URL(page.url());
        infoUrl.searchParams.set("step", "contact_information");
        await page.goto(infoUrl.toString(), { waitUntil: 'domcontentloaded' });
    }

    // 2. Fill Form
    // Wait for email field
    try {
        await page.waitForSelector("#checkout_email_or_phone, #checkout_email", { timeout: 10000 });
    } catch (e) {
        console.log("Could not find email field, we might already be logged in or in a weird state.");
    }

    // Fill Email
    if (await page.isVisible("#checkout_email_or_phone")) await page.fill("#checkout_email_or_phone", DUMMY_USER.email);
    else if (await page.isVisible("#checkout_email")) await page.fill("#checkout_email", DUMMY_USER.email);

    // Fill Name
    await fillField(page, "lastName", "#checkout_shipping_address_last_name", DUMMY_USER.lastName);
    await fillField(page, "firstName", "#checkout_shipping_address_first_name", DUMMY_USER.firstName);
    await fillField(page, "address1", "#checkout_shipping_address_address1", DUMMY_USER.address);
    await fillField(page, "postalCode", "#checkout_shipping_address_zip", DUMMY_USER.zip);

    // Fill City / Region (The tricky part)
    // Logic: Enter City -> Wait -> Select Region if dropdown exists

    // City
    const citySelector = `input[name="checkout[shipping_address][city]"], input[name="city"], #checkout_shipping_address_city`;
    if (await page.isVisible(citySelector)) {
        await page.fill(citySelector, location);
        await page.press(citySelector, "Enter");
        await page.waitForTimeout(500);
    }

    // Zone/Region/Province
    // Auto-select "Región Metropolitana" for our test cases if possible
    let region = "";
    if (["Santiago", "Til Til", "Buin"].some(l => location.toLowerCase().includes(l.toLowerCase()))) {
        region = "Región Metropolitana";
    }

    if (region) {
        const provinceSelector = `select[name="checkout[shipping_address][province]"], select[name="zone"], select[name="province"], #checkout_shipping_address_province`;
        if (await page.isVisible(provinceSelector)) {
            try {
                await page.selectOption(provinceSelector, { label: region });
            } catch (e) {
                // Sometimes it's "Santiago" instead of "Región Metropolitana" depending on the store
                try {
                    await page.selectOption(provinceSelector, { label: "Santiago" });
                } catch (e2) { }
            }
        }
    }

    // 3. Go to Shipping Step (Wait for rates)
    console.log("Submitting address...");
    const continueBtn = "#continue_button";
    await page.click(continueBtn);

    // 4. Wait for Rates to Load
    try {
        await page.waitForSelector(".section--shipping-method", { timeout: 15000 });
        console.log("Shipping section loaded.");
    } catch (e) {
        console.error("Timeout waiting for shipping methods. Address might be invalid or no rates.");
        return;
    }

    // 5. Extract Rates
    const rates = await page.$$eval(".content-box__row .radio-wrapper, .section--shipping-method .radio-wrapper", rows => {
        return rows.map(row => {
            const nameEl = row.querySelector(".radio__label__primary");
            const priceEl = row.querySelector(".radio__label__accessory .content-box__emphasis");
            return {
                service: nameEl ? (nameEl as HTMLElement).innerText.trim() : "",
                price: priceEl ? (priceEl as HTMLElement).innerText.trim() : ""
            };
        }).filter(r => r.service);
    });

    console.log(`Found ${rates.length} rates for ${location}:`);
    console.table(rates);
}

async function fillField(page: Page, robustName: string, idSelector: string, value: string) {
    const nameSelector = `input[name="${robustName}"], input[name*="[${robustName}]"]`;
    if (await page.count(nameSelector) > 0) {
        await page.fill(nameSelector, value);
    } else {
        await page.fill(idSelector, value).catch(() => { });
    }
}

main();
