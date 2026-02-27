import { chromium } from 'playwright';

async function verify() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Wait for server to start
  await new Promise(r => setTimeout(r, 5000));

  try {
    await page.goto('http://localhost:3000');

    // Bypass auth if possible or wait for load
    await page.waitForTimeout(5000);

    // Screenshot
    await page.screenshot({ path: 'verify/verification.png', fullPage: true });

  } catch (e) {
    console.error(e);
  } finally {
    await browser.close();
  }
}

verify();
