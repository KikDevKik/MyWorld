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

            # Debug: print body text
            # print("Body text:", page.inner_text("body"))

            # Check for selectors
            if page.is_visible("text=MyWorld"):
                print("Found 'MyWorld'")
            else:
                print("Could not find 'MyWorld'")

            if page.is_visible("text=Creative IDE"):
                print("Found 'Creative IDE'")

            # Take a screenshot regardless
            page.screenshot(path="verification/login_screen_debug.png")
            print("Screenshot saved to verification/login_screen_debug.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/login_screen_error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_login_page()
