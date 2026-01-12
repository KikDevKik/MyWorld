
import asyncio
from playwright.async_api import async_playwright

async def verify_chaos_slider():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        try:
            # Update port to 3002 as per log
            await page.goto("http://localhost:3002", timeout=30000)
            await page.wait_for_timeout(3000)

            # Take a screenshot of the login screen (proof of life)
            await page.screenshot(path="verification/verification.png")
            print("Screenshot taken at verification/verification.png")

        except Exception as e:
            print(f"Verification failed: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_chaos_slider())
