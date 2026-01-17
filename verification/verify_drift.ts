import { chromium } from 'playwright';

(async () => {
    // 1. LAUNCH BROWSER
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        // 2. NAVIGATE TO APP (Wait for Vite to be ready)
        // Vite is running on 3000 now.
        console.log("Navigating to http://localhost:3000...");
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

        // 3. BYPASS LOGIN (GHOST MODE)
        // The app is in dev mode with VITE_JULES_MODE=true, so it should auto-login or mock user.
        // Wait for dashboard or editor to appear.
        console.log("Waiting for HybridEditor...");
        // We look for a unique element from HybridEditor or CodeMirror.
        // .cm-content is the content editable area of CodeMirror.
        await page.waitForSelector('.cm-content', { timeout: 10000 });

        // 4. VERIFY HYBRID EDITOR PRESENCE
        const editor = page.locator('.cm-content');
        if (await editor.isVisible()) {
            console.log("✅ HybridEditor is visible.");
        } else {
            console.error("❌ HybridEditor not found.");
        }

        // 5. TRIGGER DRIFT SIMULATION
        console.log("Triggering Drift Simulation...");
        // Click the flask button in ArsenalDock
        await page.click('button[title="Simular Drift (DEV)"]');

        // Wait for visual update
        await page.waitForTimeout(1000);

        // 6. VERIFY DRIFT STYLES
        // Look for .cm-drift-high class
        const driftHigh = page.locator('.cm-drift-high');
        const count = await driftHigh.count();
        if (count > 0) {
            console.log(`✅ Found ${count} drift markers.`);
        } else {
            console.error("❌ No drift markers found after simulation.");
        }

        // 7. TAKE SCREENSHOT
        await page.screenshot({ path: 'verification/drift_simulation.png', fullPage: true });
        console.log("📸 Screenshot saved to verification/drift_simulation.png");

    } catch (error) {
        console.error("Test failed:", error);
    } finally {
        await browser.close();
    }
})();
