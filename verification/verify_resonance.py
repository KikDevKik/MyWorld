from playwright.sync_api import sync_playwright, expect

def test_resonance_bar(page):
    # Listen to console logs
    page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}"))
    page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

    page.goto("http://localhost:3000")
    page.wait_for_timeout(5000)
    page.screenshot(path="verification/resonance_check.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_resonance_bar(page)
        finally:
            browser.close()
