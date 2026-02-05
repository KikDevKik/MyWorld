import { test, expect } from '@playwright/test';

test.describe('Ghost Protocol Phase 2: User Disappointment Prevention', () => {

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));

    await page.route('https://www.googleapis.com/drive/v3/about?fields=user', async route => {
        await route.fulfill({ status: 200, json: { user: { displayName: 'Mock User' } } });
    });

    await page.goto('http://localhost:3000/?ghost=true');
    await page.evaluate(() => {
        localStorage.setItem('google_drive_token', 'mock-ghost-token');
    });

    await expect(page.getByText(/PROYECTO|EXPLORADOR/i).first()).toBeVisible({ timeout: 20000 });
  });

  test('Nexus: Should filter trash but preserve valid relations', async ({ page }) => {
    await page.route('**/analyzeNexusFile', async route => {
        const json = {
            data: {
                candidates: [
                    { id: 'c1', name: 'Hero', confidence: 95, reasoning: 'Found', foundInFiles: [], type: 'character',
                      relations: [{ target: 'Villain', relation: 'ENEMY' }, { target: 'Faction', relation: 'MEMBER' }] },
                    { id: 'c2', name: 'Villain', confidence: 95, reasoning: 'Found', foundInFiles: [], type: 'enemy' },
                    { id: 'c3', name: 'Faction', confidence: 80, reasoning: 'Bad AI', foundInFiles: [], type: 'group' } // 🚫 TRASH
                ]
            }
        };
        await route.fulfill({ json });
    });

    await page.route('https://www.googleapis.com/drive/v3/files/*', async route => {
         await route.fulfill({ status: 200, json: { id: 'f1', name: 'File.md', modifiedTime: '2024-01-01T00:00:00Z' } });
    });

    await page.getByRole('button', { name: /Motor de Mundos|World Engine/i }).click();
    await expect(page.getByText(/NEXUS|Motor de Mundos/i)).toBeVisible();

    const scanBtn = page.getByRole('button', { name: /Analizar|Scan/i });
    if (await scanBtn.isVisible()) await scanBtn.click();
    else await page.getByRole('button', { name: /Analizar/i }).click();

    // 1. Verify Nodes
    await expect(page.getByText('Hero').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Villain').first()).toBeVisible();
    await expect(page.getByText('Faction', { exact: true })).not.toBeVisible();

    // 2. Verify Relations (Check DOM Attachment)
    // "ENEMY" should be present in the DOM (even if opacity is 0). This confirms the edge exists.
    await expect(page.getByText('ENEMY')).toBeAttached();

    // "MEMBER" should NOT be in the DOM (filtered out).
    await expect(page.getByText('MEMBER')).not.toBeAttached();
  });

});
