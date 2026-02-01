from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()
    try:
        page.goto("http://localhost:3000")
        page.wait_for_timeout(3000)

        # Click the Director button
        print("Clicking Director button...")
        director_btn = page.get_by_label("Director")
        director_btn.wait_for(state="visible", timeout=5000)
        director_btn.click()

        page.wait_for_timeout(1000)

        # Now look for the attachment button inside the panel
        # The button has title="Adjuntar imagen o audio"
        print("Looking for attachment button...")
        attach_btn = page.get_by_title("Adjuntar imagen o audio")
        attach_btn.wait_for(state="visible", timeout=5000)

        page.screenshot(path="verification/director_open.png")
        print("Director open and input visible. Verification SUCCESS.")

    except Exception as e:
        print(f"Error: {e}")
        page.screenshot(path="verification/error_director.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
