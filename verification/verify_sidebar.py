import time
from playwright.sync_api import sync_playwright

def verify_sidebar(page):
    # Wait for app to load (checking for sidebar header)
    page.wait_for_selector("text=Manual de Campo")

    # Check that "Conectar Unidad" is NOT present
    # We use a try-except block to verify absence, or page.query_selector
    conectar_unidad_btn = page.query_selector("button:has-text('Conectar Unidad')")
    if conectar_unidad_btn:
        print("FAIL: 'Conectar Unidad' button found!")
    else:
        print("PASS: 'Conectar Unidad' button not found.")

    # Check for empty state logic
    # Since we are in ghost mode/dev mode, user might be mocked.
    # Let's see what is rendered.
    page.screenshot(path="verification/sidebar_check.png")
    print("Screenshot saved to verification/sidebar_check.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)
        # Context with viewport big enough
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()

        # Go to localhost
        try:
            page.goto("http://localhost:3001")
            # Wait a bit for initial render/auth simulation
            time.sleep(5)
            verify_sidebar(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
