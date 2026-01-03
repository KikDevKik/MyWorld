
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        # Navigate to the app (Vite seems to be running on 3000 according to lsof, which is unusual for Vite default but possible if configured)
        try:
            page.goto("http://localhost:3000", timeout=10000)

            # Wait for content to load
            page.wait_for_timeout(5000)

            # Screenshot the initial state
            page.screenshot(path="verification/initial_load_3000.png")
            print("Screenshot saved to verification/initial_load_3000.png")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
