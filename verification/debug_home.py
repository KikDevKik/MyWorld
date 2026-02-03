from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:3000")
    page.wait_for_timeout(5000)
    page.screenshot(path="verification/debug_home.png")
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
