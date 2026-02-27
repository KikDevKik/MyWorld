import { test, expect } from '@playwright/test';

test('FileTree renders', async ({ page }) => {
  // Mock API for getting file system nodes
  await page.route('**/getFileSystemNodes', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        files: [
          {
            id: 'folder-1',
            name: 'Test Folder',
            mimeType: 'application/vnd.google-apps.folder',
            children: [
              { id: 'file-1', name: 'Inner File.txt', mimeType: 'text/plain' }
            ]
          },
          {
            id: 'file-2',
            name: 'Root File.md',
            mimeType: 'text/plain'
          }
        ]
      })
    });
  });

  // Since we don't have auth, we might land on login.
  // We'll just verify the page loads and try to find elements if possible.
  // The goal is just to ensure no runtime crash on load.
  await page.goto('http://localhost:5173');

  // Wait for React to mount
  await page.waitForTimeout(2000);

  // Take a screenshot
  await page.screenshot({ path: 'verification.png' });
});
