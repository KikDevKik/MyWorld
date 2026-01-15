import time
from playwright.sync_api import sync_playwright

def verify_canon_radar():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        # Capture console logs
        page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"BROWSER ERROR: {exc}"))

        print("Navigating to app (Port 3001)...")
        page.goto("http://localhost:3001")

        print("Checking page content...")
        # Check for loading screen
        if page.get_by_text("CARGANDO SISTEMAS NEURONALES").is_visible():
            print("Stuck on Loading Screen.")
            page.screenshot(path="verification/stuck_loading.png")

        # Check for Login Screen
        if page.get_by_text("Iniciar Sesión").is_visible():
             print("Stuck on Login Screen (Auth Bypass Failed).")
             page.screenshot(path="verification/login_screen.png")

        try:
            page.wait_for_selector('main', timeout=5000)
            print("Main content loaded.")
        except:
             print("Main content NOT found within 5s.")
             page.screenshot(path="verification/no_main.png")
             browser.close()
             return

        print("Searching for buttons...")
        # Dump buttons
        buttons = page.locator("button").all()
        for btn in buttons:
            aria = btn.get_attribute("aria-label")
            print(f"Button: {aria}")

            # Click if it looks like Guardian
            if aria and ("Guardian" in aria or "Canon" in aria or "Radar" in aria):
                print(f"Clicking {aria}")
                btn.click()
                time.sleep(1)

                if page.get_by_text("Radar de Canon").is_visible():
                    print("SUCCESS: Canon Radar is visible.")
                    page.screenshot(path="verification/canon_radar_success.png")
                    browser.close()
                    return

        # Fallback: Try clicking the button with 'ScanEye' icon class or similar if known?
        # Or just click the last button in the dock.
        print("Trying blind click on last button in right dock...")
        right_dock_buttons = page.locator("div.fixed.right-0 button").all()
        if not right_dock_buttons:
             # Try sidebar selector based on class logic in App.tsx
             # ArsenalDock usually is fixed right.
             pass

        browser.close()

if __name__ == "__main__":
    verify_canon_radar()
