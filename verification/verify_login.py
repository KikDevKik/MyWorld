from playwright.sync_api import Page, expect, sync_playwright

def verify_login_screen_styles(page: Page):
    # Go to the local dev server
    page.goto("http://localhost:3000")

    # Wait for the login button to be visible
    login_button = page.get_by_role("button", name="Iniciar Sesión con Google")
    expect(login_button).to_be_visible()

    # Take a screenshot of the login screen
    # Although this screen wasn't modified with inputs, it confirms the app is running
    # and the base styles are applied.
    # Since I cannot bypass login without a real Google account, I cannot inspect the inner panels easily via Playwright in this environment.
    # However, I can verify that the app loads and styles are rendering.
    page.screenshot(path="verification/login_screen.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_login_screen_styles(page)
        finally:
            browser.close()
