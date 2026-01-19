
from playwright.sync_api import sync_playwright

def verify_ux_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Go to the app
        page.goto("http://localhost:3000/")

        # Wait for the ArsenalDock to load (it's always visible)
        page.wait_for_selector('button[aria-label="Director"]')

        # Verify ArsenalDock changes
        # Check if "Simulate Drift" button exists and has aria-label
        # Note: onSimulateDrift is optional and might not be rendered in production/default state
        # But we added aria-label to it in the code.

        # Verify DirectorPanel changes
        # Open Director
        page.click('button[aria-label="Director"]')

        # Wait for DirectorPanel to open
        page.wait_for_selector('button[aria-label="Close Director"]')

        # Check for "Archivos de Sesión" aria-label
        archive_btn = page.locator('button[aria-label="Toggle Session Manager"]')
        print(f"Archive button found: {archive_btn.count() > 0}")

        # Check for "Modo Estratega" aria-label
        strategist_btn = page.locator('button[aria-label="Toggle Strategist Mode"]')
        print(f"Strategist button found: {strategist_btn.count() > 0}")

        # Check for "Send" button aria-label
        send_btn = page.locator('button[aria-label="Send message"]')
        print(f"Send button found: {send_btn.count() > 0}")

        # Take a screenshot of the Director Panel
        page.screenshot(path="verification/director_panel.png")

        browser.close()

if __name__ == "__main__":
    verify_ux_changes()
