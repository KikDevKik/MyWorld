from playwright.sync_api import sync_playwright

def test_app_loads():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            # Using port 4173 as per preview log
            page.goto("http://localhost:4173")

            # Wait for content to load (Login screen or Main App)
            page.wait_for_selector('body')

            # Take screenshot
            page.screenshot(path="verification/app_verification.png")
            print("Screenshot taken successfully")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    test_app_loads()
