import { test, expect } from '@playwright/test';

test.describe('Ghost Protocol Phase 2: User Disappointment Prevention', () => {

  test.beforeEach(async ({ page }) => {
    // 🟢 CAPTURE CONSOLE LOGS
    page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));
    page.on('pageerror', exception => console.log(`BROWSER EXCEPTION: ${exception}`));

    // 1. Activate Ghost Mode
    console.log("Navigating to app...");
    await page.goto('http://localhost:3000/?ghost=true');

    // 2. Inject Auth Mock
    await page.evaluate(() => {
        localStorage.setItem('google_drive_token', 'mock-ghost-token');
    });

    console.log("Waiting for app to load...");

    // Wait for Dashboard
    await expect(page.getByText('PROYECTO')).toBeVisible({ timeout: 20000 });
  });

  test('Nexus: Should filter out trash entities (Tiers, Tags) and handle duplicates', async ({ page }) => {
    await page.route('**/analyzeNexusFile', async route => {
        const json = {
            data: {
                candidates: [
                    { id: 'c1', name: 'Valid Hero', confidence: 95, reasoning: 'Clear mention', foundInFiles: [], type: 'character' },
                    { id: 'c2', name: 'Faction', confidence: 80, reasoning: 'Bad AI extraction', foundInFiles: [], type: 'group' }, // 🚫 TRASH
                    { id: 'c3', name: 'Tier', confidence: 80, reasoning: 'Bad AI extraction', foundInFiles: [], type: 'concept' },    // 🚫 TRASH
                    { id: 'c4', name: 'Subtype', confidence: 80, reasoning: 'Bad AI extraction', foundInFiles: [], type: 'concept' }, // 🚫 TRASH
                    { id: 'c5', name: 'Valid Hero', confidence: 60, reasoning: 'Duplicate mention', foundInFiles: [], type: 'character' } // ⚠️ DUPLICATE
                ]
            }
        };
        await route.fulfill({ json });
    });

    // 1. Navigate to World Engine -> Nexus
    await page.getByRole('button', { name: /Motor de Mundos|World Engine/i }).click();

    // Wait for Nexus/World Engine to load
    await expect(page.getByText(/NEXUS|Motor de Mundos/i)).toBeVisible({ timeout: 10000 });

    // 2. Trigger Scan
    const scanBtn = page.getByRole('button', { name: /Analizar|Scan|Iniciar Escaneo/i });
    if (await scanBtn.isVisible()) {
        await scanBtn.click();
    } else {
        console.log("⚠️ Scan button not found immediately. Attempting to locate...");
        await page.getByRole('button', { name: /Analizar/i }).click();
    }

    // 3. Verify Filtering
    // "Valid Hero" should appear
    await expect(page.getByText('Valid Hero').first()).toBeVisible({ timeout: 10000 });

    // "Faction", "Tier", "Subtype" should NOT appear
    await expect(page.getByText('Faction', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Tier', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Subtype', { exact: true })).not.toBeVisible();
  });

  test('Builder: Smart Inbox Sort', async ({ page }) => {
    await page.route('**/builderStream', async route => {
        // Stream a ghost node
        const chunks = [
            JSON.stringify({ type: 'text', content: 'Forging...' }) + '\n',
            JSON.stringify({
                type: 'data',
                payload: {
                    nodes: [{ id: 'g1', name: 'SmartCharacter', type: 'character', description: 'A test char' }],
                    edges: []
                }
            }) + '\n'
        ];

        await route.fulfill({
            status: 200,
            contentType: 'text/event-stream',
            body: chunks.join('')
        });
    });

    await page.route('**/crystallizeGraph', async route => {
        await route.fulfill({
            json: { data: { success: true, created: 1, failed: 0 } }
        });
    });

    // 1. Open Builder (via Spark)
    await page.getByLabel(/¿Tienes una Chispa?|Got a Spark?/i).click();

    // 2. Genesis Modal
    await expect(page.getByText(/Protocolo Génesis|Genesis Protocol/i)).toBeVisible();
    await page.getByPlaceholder(/Responde al Arquitecto|Answer the Architect/i).fill('Create a character named SmartCharacter');
    await page.getByRole('button', { name: /Materializar|Materialize/i }).click();

    // 3. Builder
    await expect(page.getByText('THE BUILDER')).toBeVisible({ timeout: 15000 });

    // Wait for Ghost Node
    await expect(page.getByText('SmartCharacter')).toBeVisible({ timeout: 10000 });

    // 4. Materialize -> Inbox
    await page.getByRole('button', { name: /MATERIALIZE/i }).click();

    // Select "Inbox" or "Principal"
    // We try to find the button or folder item
    await page.locator('button').filter({ hasText: /Inbox|Principal/i }).first().click();

    // 5. Verify Toast/Message about Smart Sort
    await expect(page.getByText(/Auto-archivado en|Auto-filed into/i)).toBeVisible({ timeout: 10000 });
  });

});
