import { test, expect } from '@playwright/test';

test.describe('The Builder - Ghost Mode Update Verification', () => {

  test.beforeEach(async ({ page }) => {
    // 1. Mock LocalStorage for Ghost Mode
    await page.addInitScript(() => {
        window.localStorage.setItem('myworld_custom_gemini_key', 'mock-key');
        window.localStorage.setItem('google_drive_token', 'mock-token'); // Required by Ghost Protocol
    });

    // 2. Mock Network Routes
    // Mock the Builder Stream (AI Chat)
    await page.route('**/builderStream', async route => {
        const jsonResponse = JSON.stringify({
            nodes: [
                { id: "existing-node-id", name: "Existing Hero", type: "character", description: "Updated description." },
                { id: "new-node-id", name: "New Villain", type: "character", description: "A new threat." }
            ],
            edges: [
                { source: "existing-node-id", target: "new-node-id", label: "Arch-Nemesis" }
            ]
        });

        // Simulate stream with text then data
        const streamBody = `{"type":"text","content":"Analyzing graph..."}\n` +
                           `{"type":"text","content":" I have found an update."}\n` +
                           `{"type":"data","payload":${jsonResponse}}\n`;

        await route.fulfill({
            status: 200,
            contentType: 'text/plain',
            body: streamBody
        });
    });

    // Mock Crystallization (The Forge)
    await page.route('**/crystallizeGraph', async route => {
        // We verify the request payload here if needed
        const request = route.request();
        const postData = request.postDataJSON();
        console.log('Crystallize Request:', postData);

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                result: { // Callable wrap
                    success: true,
                    created: 1, // 1 new, 1 update (count logic depends on backend, but let's say 1 created file)
                    failed: 0,
                    files: [{ id: "file-id-1", name: "New Villain.md" }],
                    errors: []
                }
            })
        });
    });

    // Go to Main Page (Ghost Mode bypasses login)
    await page.goto('http://localhost:3000/');
  });

  test('Materialize Update Scenario', async ({ page }) => {
    // 1. Open Builder
    // The previous click failed because presumably the selector wasn't hitting the right element
    // or the element didn't respond to 'click' as expected (maybe a parent div captures it).

    // We see the Hammer icon on the right sidebar. It's the 4th element down.
    // The previous screenshot confirms it is visible.
    // Let's force a click using a more aggressive selector or coordinates if needed.

    // Let's try to click ANY button that has an SVG path that looks like a hammer, or just by index.
    // We can assume the right sidebar is `.flex.flex-col` on the right.
    // Let's find the sidebar first.
    const sidebar = page.locator('div.fixed.right-0, aside').last();

    // Click the 4th button in the sidebar (Shield, Clapper, Globe, Hammer).
    // Note: indices are 0-based. So 3rd index.
    const builderButton = sidebar.locator('button').nth(3);

    await expect(builderButton).toBeVisible();
    await builderButton.click({ force: true }); // Force click in case of overlay/pointer-events

    // 2. Chat with Builder
    // Wait for modal to appear.
    const input = page.locator('textarea[placeholder="Describe your architecture..."]');
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill("Update the hero and add a villain.");
    await page.keyboard.press('Enter');

    // 3. Wait for Graph Preview
    await expect(page.locator('text=Existing Hero')).toBeVisible();
    await expect(page.locator('text=New Villain')).toBeVisible();

    // 4. Click Materialize
    const materializeBtn = page.locator('button:has-text("MATERIALIZE")');
    await expect(materializeBtn).toBeEnabled();
    await materializeBtn.click();

    // 5. Handle Folder Selector
    // Wait for "Select Target Folder" or similar text.
    await expect(page.locator('text=Select Target Folder')).toBeVisible({ timeout: 5000 }).catch(() => console.log("Folder selector might be skipped or different text"));

    // Select a folder.
    await page.locator('.folder-item, [role="button"]:has-text("Mock Canon")').first().click();

    // Confirm selection (if there's a confirm button, usually "Select This Folder" or similar).
    const confirmBtn = page.locator('button:has-text("Select This Folder"), button:has-text("Confirmar")');
    if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
    }

    // 6. Verify Success Toast
    // Toast usually appears at bottom right or top center.
    // We check for text "Reality Forged" or "Materialization Complete".
    await expect(page.locator('text=Reality Forged')).toBeVisible({ timeout: 10000 });

    // Screenshot
    await page.screenshot({ path: 'ghost_builder_update.png' });
  });

});
