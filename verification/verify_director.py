from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            # Use port 3000 as seen in logs
            page.goto("http://localhost:3000", timeout=30000)

            # Wait for main UI to load
            page.wait_for_load_state("networkidle")

            # Take screenshot of initial state
            page.screenshot(path="verification/director_fix.png")
            print("Screenshot taken")

        except Exception as e:
            print(f"Error: {e}")
            try:
                page.screenshot(path="verification/error_state.png")
            except:
                pass

        browser.close()

if __name__ == "__main__":
    run()
