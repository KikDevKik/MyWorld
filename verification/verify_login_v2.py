from playwright.sync_api import sync_playwright
import time

def verify_login_page():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            print("Navigating to http://localhost:3000/ ...")
            page.goto("http://localhost:3000/")

            # Wait a bit for React to mount
            page.wait_for_timeout(5000)

            print("Page title:", page.title())

            # Check for selectors
            if page.is_visible("text=MyWorld"):
                print("Found 'MyWorld'")
            else:
                print("Could not find 'MyWorld'")

            if page.is_visible("text=Creative IDE"):
                print("Found 'Creative IDE'")

            # Check for footer removal
            if page.is_visible("text=SYSTEM STATUS: ONLINE | PROJECT TITANIUM"):
                print("FAILED: Found Footer Text 'SYSTEM STATUS: ONLINE | PROJECT TITANIUM'")
            else:
                print("SUCCESS: Footer text removed.")

            # Check for Logo Image
            # We look for an img tag with src="/logo.png"
            if page.is_visible('img[src="/logo.png"]'):
                print("SUCCESS: Found Logo Image")
            else:
                print("FAILED: Logo Image not found")


            # Take a screenshot regardless
            page.screenshot(path="verification/login_screen_v2.png")
            print("Screenshot saved to verification/login_screen_v2.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/login_screen_error_v2.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_login_page()
