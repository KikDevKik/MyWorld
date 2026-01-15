import time
from playwright.sync_api import sync_playwright

def verify_canon_radar():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # We need to simulate a larger screen or maximize to see full layout
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        print("Navigating to app...")
        page.goto("http://localhost:3000")

        # Wait for app to load.
        # Since auth is bypassed via VITE_JULES_MODE=true in App.tsx (checked in memory),
        # it should load the main UI directly if configured.
        # But wait, did I set VITE_JULES_MODE=true?
        # The user provided memory says: "The local development server runs on port 3000. Verification scripts and 'Ghost Access' (VITE_JULES_MODE='true') must target this port to bypass authentication."
        # I did not set the env var when running the server.
        # `pnpm run dev` just runs `vite`.
        # I should have run `VITE_JULES_MODE=true pnpm run dev`.

        # Checking if login screen is present
        try:
            page.wait_for_selector('text=Iniciar Sesión', timeout=5000)
            print("Login screen detected. Auth bypass failed.")
            page.screenshot(path="verification/login_screen.png")
            browser.close()
            return
        except:
            print("Login screen not found (good sign or timeout).")

        try:
            page.wait_for_selector('main', timeout=10000)
        except:
             print("Main content not found.")
             page.screenshot(path="verification/error_state.png")
             browser.close()
             return

        print("App loaded. Searching for Guardian button...")

        # In ArsenalDock, we look for the button.
        # Let's try to click the one that has the ScanEye icon or similar.
        # Assuming we can find it by some attribute.
        # Let's dump the button aria-labels.
        buttons = page.locator("aside button").all()
        for i, btn in enumerate(buttons):
             label = btn.get_attribute("aria-label")
             print(f"Button {i}: {label}")
             if label and ("Guardian" in label or "Canon" in label or "Radar" in label):
                 print(f"Clicking button: {label}")
                 btn.click()
                 break
        else:
             print("Guardian button not explicitly found by label. Clicking the last button in the dock (usually tools are there).")
             if buttons:
                 buttons[-1].click()

        time.sleep(2)

        # Verify CanonRadar is visible inside main
        # It should have text "Radar de Canon"
        if page.get_by_text("Radar de Canon").is_visible():
            print("Canon Radar visible.")
            # Check if it covers main
            # We can check CSS width/height via evaluate, or just trust the screenshot
            page.screenshot(path="verification/canon_radar_active.png")
        else:
            print("Canon Radar NOT visible.")
            page.screenshot(path="verification/canon_radar_failed.png")

        browser.close()

if __name__ == "__main__":
    verify_canon_radar()
