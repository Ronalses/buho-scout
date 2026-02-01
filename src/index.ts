import { chromium, Page } from 'playwright';
import * as fs from 'fs';

// Configuration
const LOCATIONS = ["Santiago", "Til Til", "Buin"];
const DUMMY_USER = {
    email: "test@buho.cl",
    firstName: "Scraper",
    lastName: "Bot",
    address: "Calle Falsa 123",
    zip: "9999999",
    phone: "999999999"
};

async function main() {
    // 1. Read URL from args
    const url = process.argv[2];
    if (!url) {
        console.error("Usage: npx tsx src/index.ts <SHOPIFY_STORE_URL>");
        process.exit(1);
    }

    console.log(`Starting scraper for: ${url}`);

    const browser = await chromium.launch({
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        locale: 'es-CL',
        timezoneId: 'America/Santiago'
    });
    const page = await context.newPage();

    // Stealth: Hide webdriver property
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });
    });

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

    // Wait for a key checkout element to confirm we are there AND loaded
    try {
        console.log("Waiting for checkout form to load...");
        // Relaxed selector: Wait for ANY text input or the specific address ID
        // Also try waiting for the "Teléfono" label since we know it exists
        await Promise.race([
            page.waitForSelector('#checkout_shipping_address_address1', { timeout: 60000 }),
            page.waitForSelector('input[name*="address1"]', { timeout: 60000 }),
            page.getByLabel('Dirección').first().waitFor({ timeout: 60000 })
        ]);
        console.log("Checkout form loaded.");
    } catch (e) {
        console.log("Timeout waiting for form selector.");
    }

    // 5. Fill Checkout Form
    console.log("Filling checkout form...");
    await fillField(page, 'email', '#checkout_email', DUMMY_USER.email); // Use DUMMY_USER.email
    await fillField(page, 'lastName', '#checkout_shipping_address_last_name', DUMMY_USER.lastName); // Use DUMMY_USER.lastName
    await fillField(page, 'address1', '#checkout_shipping_address_address1', DUMMY_USER.address); // Use DUMMY_USER.address

    // Fill Phone - Critical Fix with Robust Selectors
    console.log("Filling Phone field...");
    const phoneSelectors = [
        'input[type="tel"]',
        'input[name*="phone"]',
        '#checkout_shipping_address_phone',
        '[autocomplete="tel"]'
    ];
    let phoneFilled = false;
    for (const selector of phoneSelectors) {
        if (await page.locator(selector).count() > 0) {
            console.log(`Found phone field with selector: ${selector}`);
            await page.fill(selector, DUMMY_USER.phone);
            phoneFilled = true;
            break;
        }
    }
    if (!phoneFilled) {
        console.log("Could not find phone field with standard selectors. Trying approximate label...");
        try {
            await page.getByLabel('Teléfono').fill(DUMMY_USER.phone);
        } catch (e) {
            console.log("Failed to fill phone field.");
        }
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

    // Fill Phone (ensure it's filled in the loop too with robust selector)
    const phoneSelectors = ['input[type="tel"]', 'input[name*="phone"]', '#checkout_shipping_address_phone', '[autocomplete="tel"]'];
    for (const s of phoneSelectors) {
        if (await page.locator(s).count() > 0) {
            await page.fill(s, DUMMY_USER.phone);
            break;
        }
    }

    // Fill City / Region (The tricky part)
    // ... (unchanged) ...
    // City
    const citySelector = `input[name="checkout[shipping_address][city]"], input[name="city"], #checkout_shipping_address_city`;
    if (await page.isVisible(citySelector)) {
        await page.fill(citySelector, location);
        await page.press(citySelector, "Enter");
        await page.waitForTimeout(500);
    }

    // Zone/Region/Province
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
                try {
                    await page.selectOption(provinceSelector, { label: "Santiago" });
                } catch (e2) { }
            }
        }
    }

    // 3. Wait for Rates to Load (Dynamic update or Next Step)
    console.log("Waiting for shipping rates to appear (dynamic update)...");
    // The user indicated that rates appear after filling the commune.
    // Use the specific ID provided in the HTML snippet.
    const shippingMethodsSelector = "fieldset#shipping_methods";

    // 4. Wait for Rates to Load
    console.log("Waiting for shipping rates (looking for 'Métodos de envío')...");

    try {
        // Wait for the section header that the user confirmed exists
        await page.getByText("Métodos de envío").waitFor({ timeout: 15000 });
        console.log("Shipping section found!");

        // Wait a bit more for the specific options to render
        await page.waitForTimeout(2000);

    } catch (e) {
        console.log("Timeout waiting for 'Métodos de envío'. This might be expected for some locations (e.g., Til Til).");
        // Determine if it's an error or just no rates
        const bodyText = await page.innerText('body');
        if (bodyText.includes("No hay opciones de envío") || bodyText.includes("No shipping")) {
            console.log("Confirmed: No shipping options available.");
            return; // Empty rates
        }
    }

    // 5. Extract Rates using exact HTML structure provided by user
    // HTML Structure:
    // <input type="radio" id="ID" name="shipping_methods">
    // <label for="ID"> <p>NAME</p> </label>
    // <div id="ID-secondary"> <strong>PRICE</strong> </div>

    console.log("Extracting rates with precise selectors...");
    const rates = [];

    // Find all shipping method radios
    const radios = await page.locator('input[name="shipping_methods"]').all();

    if (radios.length === 0) {
        console.log(`No shipping rates found for ${location} (Radios count: 0).`);
        // Check for error messages
        const errorMsg = await page.locator('.field__message--error, .notice--error').allInnerTexts();
        if (errorMsg.length > 0) console.log("Errors found:", errorMsg);
    }

    for (const radio of radios) {
        const radioId = await radio.getAttribute('id');
        if (!radioId) continue;

        // Extract Name: Label matching the ID
        let serviceName = "Unknown Service";
        // Selector: label[for="ID"]
        // The user HTML has a <p> inside the label, but innerText on label should catch it.
        const labelLocator = page.locator(`label[for="${radioId}"]`);
        if (await labelLocator.count() > 0) {
            serviceName = (await labelLocator.innerText()).replace(/\n/g, ' ').trim();
        }

        // Extract Price: Container with ID = radioId + "-secondary"
        let servicePrice = "Unknown Price";
        const priceId = `${radioId}-secondary`;
        const priceLocator = page.locator(`#${priceId}`);

        if (await priceLocator.count() > 0) {
            servicePrice = (await priceLocator.innerText()).replace(/\n/g, ' ').trim();
        }

        rates.push({ service: serviceName, price: servicePrice });
    }

    // Clean up rates
    const cleanedRates = rates.filter(r => r.service !== "Unknown Service");

    console.log(`Found ${cleanedRates.length} rates for ${location}:`);
    console.table(cleanedRates);
}

async function fillField(page: Page, robustName: string, idSelector: string, value: string) {
    const nameSelector = `input[name="${robustName}"], input[name*="[${robustName}]"]`;
    if (await page.locator(nameSelector).count() > 0) {
        await page.fill(nameSelector, value);
    } else {
        await page.fill(idSelector, value).catch(() => { });
    }
}

main();
