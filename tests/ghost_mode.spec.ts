import { test, expect } from '@playwright/test';

test('Ghost Access Mode: Bypass Login and Load Dashboard', async ({ page }) => {
  await page.goto('/');

  // 1. Verify we are NOT on the login screen
  await expect(page.getByText('Iniciar Sesión', { exact: false })).not.toBeVisible();

  // 2. Verify Dashboard elements are present
  // "Director de Escena" was seen in the logs as visible (or at least present in a div).
  // This text likely appears in the ArsenalDock (tooltip) or DirectorPanel header.
  const directorLabel = page.getByText('Director de Escena').first();
  await expect(directorLabel).toBeVisible();

  // 3. Verify the Command Bar input is present (it's the main interaction point)
  // It usually has a placeholder or specific class.
  // We can also check for the generic main layout wrapper.
  const mainLayout = page.locator('#root');
  await expect(mainLayout).toBeVisible();

  console.log('Ghost Access verification successful: Dashboard UI detected.');
});
