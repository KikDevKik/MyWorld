from playwright.sync_api import sync_playwright, expect
import time

def verify_titanium_theme():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Retry logic for server start
        for i in range(10):
            try:
                page.goto("http://localhost:5173", timeout=5000)
                break
            except Exception as e:
                print(f"Attempt {i+1}: Server not ready yet...")
                time.sleep(2)

        # Allow hydration
        time.sleep(2)

        # Get computed styles
        body_handle = page.locator("body")
        bg_color = body_handle.evaluate("element => window.getComputedStyle(element).backgroundColor")
        text_color = body_handle.evaluate("element => window.getComputedStyle(element).color")

        print(f"Background Color: {bg_color}")
        print(f"Text Color: {text_color}")

        # Assertions
        # #1c1c1e is rgb(28, 28, 30)
        # #E0E0E0 is rgb(224, 224, 224)

        if bg_color != "rgb(28, 28, 30)":
             print("ERROR: Background color mismatch!")
        else:
             print("SUCCESS: Background color matches Titanium-900")

        if text_color != "rgb(224, 224, 224)":
             print("ERROR: Text color mismatch!")
        else:
             print("SUCCESS: Text color matches Text-Primary")

        page.screenshot(path="verification/titanium_theme.png")
        browser.close()

if __name__ == "__main__":
    verify_titanium_theme()
