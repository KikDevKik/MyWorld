import time
from playwright.sync_api import sync_playwright

def verify_canon_radar():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))

        print("Navigating to app (Port 3001)...")
        page.goto("http://localhost:3001")

        try:
            page.wait_for_selector('main', timeout=10000)
            print("Main content loaded.")
        except:
             print("Main content NOT found within 10s.")
             # Check if loading text persists
             if page.get_by_text("CARGANDO SISTEMAS NEURONALES").is_visible():
                 print("Still loading. Screenshot taken.")
             page.screenshot(path="verification/stuck_loading.png")
             browser.close()
             return

        print("Searching for Guardian button (by guessing position)...")
        # ArsenalDock is fixed right.
        # It contains multiple buttons.
        # Let's iterate and click each, checking for 'Radar de Canon' text.

        # Select buttons in the dock container
        # Since I don't know the exact class, I'll search for buttons on the right side of the screen
        buttons = page.locator("button").all()

        found_guardian = False
        for i, btn in enumerate(buttons):
            # Check bounding box to see if it's on the right
            box = btn.bounding_box()
            if box and box['x'] > 1800: # Assuming 1920 width, dock is on right
                print(f"Clicking Right-Side Button {i}...")
                btn.click()
                time.sleep(1)

                if page.get_by_text("Radar de Canon").is_visible():
                    print(f"SUCCESS: Guardian activated by Button {i}")
                    found_guardian = True
                    break
                else:
                    # Close panel if opened something else (optional, but clicking another button usually switches)
                    pass

        if found_guardian:
            # Verify Full Width
            radar_el = page.get_by_text("Radar de Canon").locator("xpath=../../..") # Go up to container
            # Check box
            box = radar_el.bounding_box()
            print(f"Radar Geometry: {box}")
            # Should be roughly width - sidebar(64*4=256) - dock(16*4=64) ~= 1600

            page.screenshot(path="verification/canon_radar_success.png")
        else:
            print("Failed to activate Canon Radar.")
            page.screenshot(path="verification/canon_radar_failed.png")

        browser.close()

if __name__ == "__main__":
    verify_canon_radar()
