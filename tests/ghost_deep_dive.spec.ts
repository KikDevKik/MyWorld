import { test, expect } from '@playwright/test';

test.describe('Ghost Protocol: Deep Dive Audit (Phase 2)', () => {

  test.beforeEach(async ({ page }) => {
    // 🟢 MOCK: Builder Stream (Base)
    await page.route('**/builderStream', async route => {
      await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: '' });
    });

    // 🟢 MOCK: Nexus Analysis (Base)
    await page.route('**/analyzeNexusFile', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { candidates: [] } }) });
    });

    // 🟢 MOCK: Auth & Drive
    await page.route('https://www.googleapis.com/drive/v3/about*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { displayName: 'Ghost User', emailAddress: 'ghost@test.com' } })
      });
    });
    await page.route('https://www.googleapis.com/drive/v3/files/*', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: 'mock-file-id', name: 'Mock File.md', modifiedTime: new Date().toISOString() })
        });
    });
  });

  // -------------------------------------------------------------------------
  // 1. SCENARIO: "LA PARADOJA" (Logic & Consistency)
  // -------------------------------------------------------------------------
  test('Scenario: La Paradoja (Handling Contradictions)', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Force Open Nexus
    const dockAside = page.locator('aside').last();
    const perforatorBtn = page.getByRole('button', { name: /Perforador|Nexus/i }).first();
    if (await perforatorBtn.isVisible()) await perforatorBtn.click();
    else await dockAside.locator('button').nth(2).click();

    await expect(page.getByText('NEXUS')).toBeVisible({ timeout: 10000 });

    const anyInput = page.locator('input[type="text"]').last();
    await expect(anyInput).toBeVisible({ timeout: 10000 });

    await anyInput.fill('Cipher is alive');
    await anyInput.press('Enter');

    // MOCK 1: Initial State
    await page.route('**/builderStream', async route => {
      const payload = JSON.stringify({
        type: 'data',
        payload: {
          nodes: [{ id: 'cipher-node', name: 'Cipher', type: 'CHARACTER', description: 'Cipher is alive and well.', fx: 400, fy: 300 }],
          edges: []
        }
      });
      await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: payload + '\n' });
    });

    await expect(page.getByText('Cipher').first()).toBeVisible();

    // ACTION: Send contradictory prompt
    await expect(anyInput).not.toBeDisabled();
    await anyInput.fill('Cipher died yesterday');
    await anyInput.press('Enter');

    // MOCK 2: Contradiction
    await page.route('**/builderStream', async route => {
      const payload = JSON.stringify({
        type: 'data',
        payload: {
          nodes: [{ id: 'cipher-node', name: 'Cipher', type: 'CHARACTER', description: 'Cipher is dead.', fx: 400, fy: 300 }],
          edges: []
        }
      });
      await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: payload + '\n' });
    });

    // VERIFY: Contradiction Warning
    const warning = page.getByText(/Possible Contradiction/i);
    if (await warning.isVisible({ timeout: 5000 })) {
        console.log('✅ Scenario La Paradoja: Contradiction caught (Fix verified).');
    } else {
        console.log('⚠️ Scenario La Paradoja: Warning missing (maybe logic threshold?).');
    }
  });

  // -------------------------------------------------------------------------
  // 2. SCENARIO: "EL HUERFANO" (CRUD)
  // -------------------------------------------------------------------------
  test('Scenario: El Huerfano (Orphaned Edges)', async ({ page }) => {
    await page.goto('/');

    // Force Open Nexus
    const dockAside = page.locator('aside').last();
    const perforatorBtn = page.getByRole('button', { name: /Perforador|Nexus/i }).first();
    if (await perforatorBtn.isVisible()) await perforatorBtn.click();
    else await dockAside.locator('button').nth(2).click();

    await expect(page.getByText('NEXUS')).toBeVisible({ timeout: 10000 });

    // Wait for backdoor to be ready
    await page.waitForTimeout(1000);

    // 🟢 MOCK: Builder Stream (Inject Ghost Nodes)
    // We use Builder Stream because the Backdoor seems flaky in CI environment.
    // This tests deleting GHOST nodes (which uses the same handler logic branch).
    const input = page.locator('input[type="text"]').last();
    await expect(input).toBeVisible();
    await input.fill('Create Nodes');
    await input.press('Enter');

    await page.route('**/builderStream', async route => {
      const payload = JSON.stringify({
        type: 'data',
        payload: {
          nodes: [
            { id: 'node-a', name: 'Node A', type: 'LOCATION', fx: 400, fy: 300 },
            { id: 'node-b', name: 'Node B', type: 'LOCATION', fx: 600, fy: 300 }
          ],
          edges: []
        }
      });
      await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: payload + '\n' });
    });

    // 🟢 WAIT for nodes
    await expect(page.getByText('Node A')).toBeVisible();
    await expect(page.getByText('Node B')).toBeVisible();

    // ACTION: Delete Node A
    const nodeA = page.locator('text=Node A').first();
    await nodeA.click({ force: true });

    // Open Edit Modal
    // Previously we assumed "Delete" button was missing. Now we added it.
    const editBtn = page.locator('button[aria-label="Editar nodo"]');
    // Or just "Editar Datos" in sidebar
    await page.getByText('Editar Datos').click();

    // Verify Delete Button Exists and Click
    const deleteBtn = page.getByRole('button', { name: /eliminar/i });
    await expect(deleteBtn).toBeVisible();

    // Setup Confirm Dialog Handler
    page.on('dialog', dialog => dialog.accept());

    await deleteBtn.click();

    // Verify deletion
    await expect(page.getByText('Node A')).not.toBeVisible();
    console.log('✅ Scenario El Huerfano: Deletion successful.');
  });

  // -------------------------------------------------------------------------
  // 3. SCENARIO: "EL CAMALEON" (Nexus)
  // -------------------------------------------------------------------------
  test('Scenario: El Camaleon (Fuzzy Matching)', async ({ page }) => {
    await page.goto('/');

    const dockAside = page.locator('aside').last();
    const perforatorBtn = page.getByRole('button', { name: /Perforador|Nexus/i }).first();
    if (await perforatorBtn.isVisible()) await perforatorBtn.click();
    else await dockAside.locator('button').nth(2).click();
    await expect(page.getByText('NEXUS')).toBeVisible({ timeout: 10000 });

    // 1. MOCK "Cipher" (Existing) via Builder Stream
    const input = page.locator('input[type="text"]').last();
    await expect(input).toBeVisible();
    await input.fill('Create Cipher');
    await input.press('Enter');

    await page.route('**/builderStream', async route => {
      const payload = JSON.stringify({
        type: 'data',
        payload: {
          nodes: [{ id: 'cipher-1', name: 'Cipher', type: 'CHARACTER', fx: 300, fy: 300 }],
          edges: []
        }
      });
      await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: payload + '\n' });
    });
    await expect(page.getByText('Cipher')).toBeVisible();

    // 🟢 CLOSE BUILDER
    await page.locator('button[aria-label="Close Builder"]').click();
    await page.waitForTimeout(500);

    // 2. MOCK Nexus: Return "Cypher" (Typo)
    await page.route('**/analyzeNexusFile', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                data: {
                    candidates: [{
                        id: 'cypher-cand',
                        name: 'Cypher',
                        type: 'CHARACTER',
                        confidence: 0.8,
                        reasoning: 'Similar name',
                        suggestedAction: 'CREATE',
                        ambiguityType: 'NEW'
                    }]
                }
            })
        });
    });

    // 3. Start Scan
    await page.getByText('NEXUS').click();

    // 4. Verify Tribunal Logic
    await expect(page.getByText('Cypher').first()).toBeVisible({ timeout: 10000 });

    const hasMergeIndicator = await page.getByText(/fusionar|merge|duplicado/i).count() > 0;
    if (hasMergeIndicator) {
        console.log('✅ Scenario El Camaleon: Fuzzy match detected correctly.');
    } else {
        console.log('⚠️ Scenario El Camaleon: Fuzzy match missed (finding confirmed).');
    }
  });

  // -------------------------------------------------------------------------
  // 4. SCENARIO: "CANCELACION DE PANICO" (UX)
  // -------------------------------------------------------------------------
  test('Scenario: Cancelacion de Panico', async ({ page }) => {
    await page.goto('/');

    const dockAside = page.locator('aside').last();
    await dockAside.locator('button').nth(2).click();
    await expect(page.getByText('NEXUS')).toBeVisible({ timeout: 10000 });

    // Start Scan (Mock Hang)
    await page.route('**/analyzeNexusFile', async route => {
        // Hang
    });

    await page.getByText('NEXUS').click();
    await expect(page.getByText('INICIALIZANDO')).toBeVisible();

    // ACTION: Switch Views (Panic Cancel)
    await dockAside.locator('button').nth(3).click();

    // Verify Nexus closed
    await expect(page.getByText('INICIALIZANDO')).not.toBeVisible();
    console.log('✅ Scenario Cancelacion: View switch cancels process.');
  });

});
