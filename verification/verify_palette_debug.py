
from playwright.sync_api import sync_playwright

def verify_ux_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Go to the app
        print("Navigating to app...")
        page.goto("http://localhost:3000/")

        # Take a screenshot of the initial state to see what's happening
        page.screenshot(path="verification/initial_state.png")
        print("Initial state screenshot taken.")

        # Try to find any button
        buttons = page.locator("button").all()
        print(f"Found {len(buttons)} buttons on page.")
        for btn in buttons:
            try:
                # Get aria-label or text content
                label = btn.get_attribute("aria-label") or btn.text_content()
                print(f"Button found: {label}")
            except:
                pass

        # Wait for the ArsenalDock to load (it's always visible)
        # Maybe the selector is wrong or it takes time to load (React hydration)
        print("Waiting for Director button...")
        try:
            page.wait_for_selector('button[aria-label="Director"]', timeout=5000)
            print("Director button found.")
        except:
            print("Director button NOT found.")
            # Maybe it uses a different label or class?
            # Let's inspect the page source via snapshot
            with open("verification/page_source.html", "w") as f:
                f.write(page.content())
            return

        # Verify DirectorPanel changes
        # Open Director
        print("Clicking Director button...")
        page.click('button[aria-label="Director"]')

        # Wait for DirectorPanel to open
        print("Waiting for Director panel to open...")
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
        print("Final screenshot taken.")

        browser.close()

if __name__ == "__main__":
    verify_ux_changes()
