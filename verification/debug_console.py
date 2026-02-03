from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))
    page.on("pageerror", lambda exc: print(f"BROWSER ERROR: {exc}"))

    page.goto("http://localhost:3000")
    page.wait_for_timeout(5000)

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
