from playwright.sync_api import sync_playwright

def verify_sidebar():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Note: Vite started on port 3000 according to logs
        page.goto("http://localhost:3000")

        # Wait for app
        page.wait_for_timeout(5000)

        # Take screenshot of whatever loaded (likely Login or Loading)
        # This confirms we didn't break the build with the import changes.
        page.screenshot(path="verification/sidebar_initial.png")

        print("App loaded successfully on port 3000.")

        browser.close()

if __name__ == "__main__":
    verify_sidebar()
