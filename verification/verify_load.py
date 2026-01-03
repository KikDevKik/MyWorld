
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        # Navigate to the app (assuming Vite runs on 5173 by default)
        try:
            page.goto("http://localhost:5173", timeout=10000)

            # Wait for content to load (Login screen or Main UI)
            page.wait_for_timeout(3000)

            # Screenshot the initial state
            page.screenshot(path="verification/initial_load.png")
            print("Screenshot saved to verification/initial_load.png")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
