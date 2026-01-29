from playwright.sync_api import Page, expect, sync_playwright
import time

def test_drift_button_visible(page: Page):
    # 1. Go to app (Ghost Mode automatically logs in)
    page.goto("http://localhost:3000")

    # 2. Wait for Director button
    expect(page.get_by_title("Director de Escena")).to_be_visible(timeout=15000)

    # 3. Assert Drift Button is visible
    drift_btn = page.get_by_title("Simular Drift (DEV)")
    expect(drift_btn).to_be_visible()

    # 4. Screenshot
    time.sleep(1) # Wait for animations
    page.screenshot(path="verification/drift_visible.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        test_drift_button_visible(page)
        browser.close()
