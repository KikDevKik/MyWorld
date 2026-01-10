from playwright.sync_api import sync_playwright
import time

def verify_kinetic_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        try:
            # Port changed to 3000 based on logs
            page.goto("http://localhost:3000", timeout=10000)
            time.sleep(2)
            page.screenshot(path="verification/verification.png")
            print("Screenshot taken.")
        except Exception as e:
            print(f"Error: {e}")

        browser.close()

if __name__ == "__main__":
    verify_kinetic_ui()
