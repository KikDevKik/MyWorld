from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()
    try:
        page.goto("http://localhost:3000")
        page.wait_for_timeout(3000) # Wait for load
        page.screenshot(path="verification/initial_load.png")
        print("Initial screenshot taken")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
