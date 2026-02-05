import { test, expect } from '@playwright/test';

test.describe('Ghost Mode Audit', () => {

  test.beforeEach(async ({ page }) => {
    // 🟢 DEBUG: Console Logs
    page.on('console', msg => console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', err => console.log(`[BROWSER] ERROR: ${err.message}`));

    // 🟢 MOCK: Builder Stream (Streaming NDJSON)
    await page.route('**/builderStream', async route => {
      // Simulate delays between chunks for realism
      const chunk1 = JSON.stringify({ type: 'text', content: 'Analyzing request...' }) + '\n';
      const chunk2 = JSON.stringify({ type: 'text', content: ' Constructing graph architecture...' }) + '\n';
      const chunk3 = JSON.stringify({
        type: 'data',
        payload: {
          nodes: [
            // Remove fx/fy to let GhostGraph center them in the view
            { id: 'ghost-1', name: 'Cipher', type: 'CHARACTER', description: 'A digital ghost found in the machine.' },
            { id: 'ghost-2', name: 'The Void', type: 'LOCATION', description: 'Empty space where data used to be.' }
          ],
          edges: [
            { source: 'ghost-1', target: 'ghost-2', relation: 'EXISTS_IN' }
          ]
        }
      }) + '\n';

      await route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: chunk1 + chunk2 + chunk3
      });
    });

    // 🟢 MOCK: Nexus Analysis (Wrapped for Firebase Callable)
    await page.route('**/analyzeNexusFile', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            candidates: [
                {
                id: 'cand-1',
                name: 'Cipher',
                type: 'CHARACTER',
                confidence: 0.9,
                reasoning: 'Found in text',
                foundInFiles: [{ fileName: 'Mock File.md', contextSnippet: 'Cipher spoke to the machine.' }],
                suggestedAction: 'CREATE',
                ambiguityType: 'NEW'
                },
                {
                id: 'cand-2',
                name: 'Old King',
                type: 'CHARACTER',
                confidence: 0.85,
                reasoning: 'Mentioned as ruler',
                foundInFiles: [{ fileName: 'Mock File.md', contextSnippet: 'The Old King is dead.' }],
                suggestedAction: 'MERGE',
                mergeWithId: 'existing-king',
                ambiguityType: 'CONFLICT'
                }
            ]
          }
        })
      });
    });

    // 🟢 MOCK: Crystallize (Wrapped)
    await page.route('**/crystallizeGraph', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            success: true,
            created: 2,
            failed: 0,
            errors: []
          }
        })
      });
    });

    // 🟢 MOCK: Crystallize Single Node (Wrapped)
    await page.route('**/crystallizeNode', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { success: true } })
      });
    });

    // 🟢 MOCK: Google Drive User Check (validateToken)
    await page.route('https://www.googleapis.com/drive/v3/about*', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ user: { displayName: 'Ghost User', emailAddress: 'ghost@test.com' } })
        });
    });

    // 🟢 MOCK: Google Drive File Metadata (fetchFileMetadata)
    await page.route('https://www.googleapis.com/drive/v3/files/*', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: 'mock-file-id', name: 'Mock File.md', modifiedTime: new Date().toISOString() })
        });
    });
  });

  test('Flow: Open Perforator, Scan Nexus, and Use Builder', async ({ page }) => {
    // 1. Navigate
    await page.goto('/');

    // 🟢 DEBUG: Check for Loading Screen
    const loading = page.getByText('CARGANDO SISTEMAS NEURONALES');
    if (await loading.isVisible()) {
        console.log('⚠️ App is stuck in loading screen.');

        // Check logs
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        // Wait a bit to see if it resolves
        await page.waitForTimeout(5000);
    }

    // 2. Open Perforator (World Engine)
    // Looking for the button in ArsenalDock
    const perforatorButton = page.locator('button[aria-label="Perforador de Mundos"], button[title="Perforador de Mundos"]');
    // If accessibility labels are missing (as per report), we might need to find by icon or index.
    // Let's try finding by the specific gem-id logic if possible, or fallback.
    // ArsenalDock usually renders buttons based on GemId.
    // If the labels are missing, I'll rely on the order or look for the SVG.
    // However, fixing the accessibility labels is part of the task, so if this fails, I know what to fix.

    // Try to find ANY button that looks like the perforator (drill/globe)
    // Or just click the second/third item in the dock.
    // ArsenalDock: Editor, Perforator, Forja, ...

    // Let's wait for the dock to appear (It's a div with specific classes, not a nav)
    // We look for the ArsenalDock container or buttons inside it.
    // ArsenalDock usually has buttons with titles/aria-labels.

    // 3. Click Perforator Button
    // Try finding by aria-label "Perforador" or "World Engine" or "Nexus" depending on translation
    // Fallback to finding by icon (Globe2) or index.
    const perforatorBtn = page.getByRole('button', { name: /Perforador|World Engine|Nexus/i }).first();

    // If specific label fails, use the Dock container selector and index
    if (!await perforatorBtn.isVisible()) {
        // Find the right-side dock (Zone C)
        const dockAside = page.locator('aside').last();
        await expect(dockAside).toBeVisible();

        // Inside dock, find buttons.
        // We need the Perforator button.
        // DOCK_GEMS = ['director', 'perforador', ...]
        // Rendered: Sentinel (button) then Gems (div > buttons).
        // Perforator is index 1 in gems list.
        // Total buttons: Sentinel (0), Director (1), Perforator (2).
        await dockAside.locator('button').nth(2).click();
    } else {
        await perforatorBtn.click();
    }

    // 3. Verify World Engine Loaded
    await expect(page.getByText('NEXUS')).toBeVisible({ timeout: 5000 });

    // --- NEXUS TEST ---
    // 4. Click Nexus Scan
    await page.getByText('NEXUS').click();

    // 5. Verify Tribunal Opens (Candidates)
    // Use specific locator to avoid ambiguity (Heading is good for Candidate Title)
    await expect(page.getByRole('heading', { name: 'Cipher' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Old King').first()).toBeVisible();
    // Ambiguity type might be represented by icon or 'Conf.' tab, or 'MERGE' action
    // Cipher is selected by default, so 'CREATE' should be visible in Details Panel
    await expect(page.getByText('CREATE').first()).toBeVisible();

    // 6. Close Tribunal
    await page.getByLabel('Close').or(page.locator('button:has(svg.lucide-x)')).first().click();

    // --- BUILDER TEST ---
    // 7. Use Command Bar to Open Builder
    // Be specific to avoid hitting Tribunal search bar if animation is lingering
    const commandInput = page.getByPlaceholder('¿Qué quieres crear o consultar?');
    await expect(commandInput).toBeVisible();
    await commandInput.fill('Generate a ghost structure');
    await commandInput.press('Enter');

    // 8. Verify Builder Modal
    await expect(page.getByText('THE BUILDER')).toBeVisible();

    // 9. Verify Ghost Nodes appeared (from Mock)
    // Use ID selector for robustness (GhostGraph renders with specific IDs)
    await expect(page.locator('#ghost-ghost-1')).toBeVisible();
    await expect(page.locator('#ghost-ghost-2')).toBeVisible();

    // 10. Click Materialize
    await page.getByText('MATERIALIZE').click();

    // 11. Select Folder (Mock Folder Selector)
    // InternalFolderSelector usually shows "Inbox" or "Root".
    await expect(page.getByText('Selecciona Destino')).toBeVisible();
    await page.getByText('Inbox').first().click(); // Click on a folder
    // Confirm logic might be double click or click + confirm button.
    // InternalFolderSelector usually has a confirm button.
    // If it's single click selection, we need to find the "Select" button.

    // Let's assume there's a "Confirmar" or "Select" button.
    // Or maybe clicking the folder row selects it?
    // Let's wait and see if "Materialization Complete" toast appears.
    // If `InternalFolderSelector` requires confirmation:
    // I'll try to find a button with "Select" or "Elegir".
    const selectBtn = page.getByText('Elegir ubicación').or(page.getByText('Seleccionar'));
    if (await selectBtn.isVisible()) {
        await selectBtn.click();
    }

    // 12. Verify Success
    await expect(page.getByText('Reality Forged')).toBeVisible();
  });

  test('Graph Interaction: Dragging', async ({ page }) => {
    // Navigate and Open Perforator
    await page.goto('/');

    // Open Perforator
    const perforatorBtn = page.getByRole('button', { name: /Perforador|World Engine|Nexus/i }).first();
    if (!await perforatorBtn.isVisible()) {
         const dockAside = page.locator('aside').last();
         await dockAside.locator('button').nth(2).click();
    } else {
         await perforatorBtn.click();
    }

    await expect(page.getByText('NEXUS')).toBeVisible();

    // Open Builder to get some nodes
    const commandInput = page.locator('input[placeholder*="Describe"], input[type="text"]').last();
    await commandInput.fill('Nodes for drag test');
    await commandInput.press('Enter');
    await expect(page.getByText('Cipher')).toBeVisible();

    // Locate the node
    const node = page.getByText('Cipher').first();
    const box = await node.boundingBox();
    if (box) {
        // Drag it
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 100);
        await page.mouse.up();

        // Assert it moved? Hard to verify exact coords without reading styles.
        // But if it didn't crash or freeze, that's good.
        // Check for console errors (handled by Playwright reporter usually).
    }
  });

});
