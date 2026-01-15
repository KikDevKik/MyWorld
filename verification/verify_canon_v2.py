import time
from playwright.sync_api import sync_playwright

def verify_canon_radar():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # We need to simulate a larger screen or maximize to see full layout
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        print("Navigating to app (Port 3001)...")
        # Port is 3001 because 3000 was in use
        page.goto("http://localhost:3001")

        try:
            page.wait_for_selector('main', timeout=15000)
        except:
             print("Main content not found.")
             page.screenshot(path="verification/error_state.png")
             browser.close()
             return

        print("App loaded. Searching for Guardian button in ArsenalDock...")

        # ArsenalDock is usually on the right.
        # Find buttons in <aside> or specific div.
        # The structure is Main <main> ... </main> and ArsenalDock <aside ...> ?
        # Let's assume there is a button with 'Canon Radar' label.

        # Taking a screenshot of the main view
        page.screenshot(path="verification/app_loaded.png")

        # Try to find the button
        # Based on previous attempts, it might not have aria-label set correctly or accessible.
        # Let's try to click the button that looks like a Shield or Eye.
        # Or just click all buttons in the right dock until 'Radar de Canon' appears.

        buttons = page.locator("div.fixed.right-0 button").all() # Assuming ArsenalDock is fixed right-0
        if not buttons:
             buttons = page.locator("aside button").all()

        print(f"Found {len(buttons)} buttons in dock area.")

        found = False
        for btn in buttons:
             # Hover to see tooltip?
             # Just click and check for 'Radar de Canon'
             btn.click()
             time.sleep(1)
             if page.get_by_text("Radar de Canon").is_visible():
                 print("Found Guardian Button!")
                 found = True
                 break

        if found:
            print("Canon Radar visible.")
            # Check if it covers the main area
            # We can inspect the element classes or geometry
            radar = page.locator("text=Radar de Canon").locator("..").locator("..") # Go up to container
            # Expected: w-full h-full inside main

            # Screenshot of the radar active
            page.screenshot(path="verification/canon_radar_active.png")
            print("Screenshot saved to verification/canon_radar_active.png")
        else:
            print("Canon Radar NOT visible after clicking buttons.")
            page.screenshot(path="verification/canon_radar_failed.png")

        browser.close()

if __name__ == "__main__":
    verify_canon_radar()
