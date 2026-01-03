
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        # Navigate to the test harness (Need to serve it)
        try:
            # We assume Vite will serve test_index.html if we request it, or we need to configure vite.
            # Usually Vite serves index.html by default.
            # We can request http://localhost:3000/test_index.html

            page.goto("http://localhost:3000/test_index.html", timeout=10000)

            # Wait for content
            page.wait_for_selector("text=Configuración del Proyecto", timeout=5000)

            # Screenshot
            page.screenshot(path="verification/project_settings_ui.png")
            print("Screenshot saved to verification/project_settings_ui.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error_state.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
