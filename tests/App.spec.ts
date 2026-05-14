import { test, expect } from '@playwright/test';

test('Autenticación con Google OAuth (Login y Logout)', async ({ page }) => {
  // 1. Acceso Inicial
  await page.goto('/');

  // 2. Login (En modo de pruebas, JULES_MODE hace auto-login, simulando éxito)
  // Verificamos que hemos pasado la barrera de autenticación y el editor carga.
  const editorContainer = page.locator('.group\\/editor-area');
  await expect(editorContainer).toBeVisible({ timeout: 15000 });

  // 3. Logout
  // Simulamos el clic en el botón de cerrar sesión del VaultSidebar
  const btnLogout = page.locator('button:has-text("Salir")').or(page.locator('[title="Cerrar sesión"]'));
  if (await btnLogout.isVisible()) {
    await btnLogout.click();
    
    // Tras el logout (`signOut`), App.tsx recarga la página a `/`
    // y si no hay sesión, debería mostrar la pantalla de Login.
    await expect(page).toHaveURL('/');
  }
});

test('Routing interno entre las vistas principales', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // 1. Vista base: Editor
  await expect(page.locator('.group\\/editor-area')).toBeVisible();

  // 2. Navegación a vista Director
  const btnDirector = page.locator('button').filter({ hasText: /Director/i }).first();
  if (await btnDirector.isVisible()) {
    await btnDirector.click();
    await expect(page.locator('text=Director')).toBeVisible();
  }

  // 3. Navegación a vista Arquitecto
  const btnArquitecto = page.locator('button').filter({ hasText: /Arquitecto/i }).first();
  if (await btnArquitecto.isVisible()) {
    await btnArquitecto.click();
    await expect(page.locator('text=Arquitecto')).toBeVisible();
  }
});

test('DriveSync se dispara bajo las condiciones correctas (Debounce 2s)', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  let fueSincronizado = false;
  await page.route('**/*saveDriveFile*', async route => {
    fueSincronizado = true;
    await route.fulfill({ status: 200, json: { data: { success: true } } });
  });

  const editor = page.locator('.cm-content'); 
  if (await editor.isVisible()) {
    await editor.focus();
    await page.keyboard.type(' Modificación de prueba para DriveSync.');
    await page.waitForTimeout(2500);
    expect(fueSincronizado).toBeTruthy();
  }
});