import time
from playwright.sync_api import sync_playwright

def verify_sidebar(page):
    print("Page Title:", page.title())
    page.screenshot(path="verification/debug_state.png")

    # Try to find any text to see what is happening
    content = page.content()
    print("Page Content Snippet:", content[:500])

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()
        try:
            page.goto("http://localhost:3001")
            time.sleep(5)
            verify_sidebar(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
