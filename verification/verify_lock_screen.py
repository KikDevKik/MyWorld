
from playwright.sync_api import sync_playwright

def verify_lock_screen():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Listen to console logs
        page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"Browser Error: {exc}"))

        try:
            print("Navigating to app...")
            page.goto("http://localhost:3000")
            print("Waiting for load...")
            page.wait_for_timeout(5000) # Wait for initial load and potential error

            # Take screenshot of whatever is shown
            page.screenshot(path="verification/lock_screen_final.png")
            print("Screenshot taken.")

            # Check if text "Bloqueo de Perímetro" is visible
            is_visible = page.get_by_text("Bloqueo de Perímetro").is_visible()
            print(f"Lock screen visible: {is_visible}")

        except Exception as e:
            print(f"Script Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_lock_screen()
