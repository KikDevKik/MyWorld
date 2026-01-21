import { test, expect } from '@playwright/test';

test('NexusGraph 3D Verification', async ({ page }) => {
  // Use port 3003 as discovered in log
  await page.goto('http://localhost:3003');

  // Wait for 10 seconds to allow loading and initial render.
  await page.waitForTimeout(10000);

  // Take a screenshot of the graph area.
  await page.screenshot({ path: '/home/jules/verification/nexus_graph_3d.png' });
});
