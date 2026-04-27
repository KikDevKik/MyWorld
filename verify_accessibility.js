import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    console.log("Navigating...");
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
    console.log("Taking screenshot...");
    await page.screenshot({ path: 'verification_login.png' });
    console.log('Screenshot taken: verification_login.png');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
    process.exit(0);
  }
})();
