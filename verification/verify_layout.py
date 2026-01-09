
from playwright.sync_api import sync_playwright

def verify_world_engine(page):
    # Navigate to app
    page.goto('http://localhost:5173')

    # Wait for loading
    page.wait_for_timeout(3000)

    # Check for Login Screen (expected blocker)
    if page.locator('text=Sign in with Google').is_visible():
        print('Login screen detected. Cannot verify World Engine Panel without auth.')
        page.screenshot(path='verification/login_screen.png')
    else:
        # If by miracle we are in, try to open World Engine
        # This part is speculative as I expect to be blocked
        page.screenshot(path='verification/app_state.png')

if __name__ == '__main__':
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_world_engine(page)
        except Exception as e:
            print(f'Error: {e}')
        finally:
            browser.close()
