import time
from playwright.sync_api import sync_playwright

def verify_director_panel():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Force a large viewport to verify layout
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        print("Navigating to app...")
        # Assuming port 3000 based on grep output
        page.goto("http://localhost:3000/")

        # Wait for potential loading screens
        time.sleep(5)

        # Handle login if needed (Jules mode bypasses it, but we need to click "Entrar al Sistema" if it appears)
        # Based on LoginScreen.tsx, there might be a button.
        # But if VITE_JULES_MODE is true, it might auto-login?
        # Memory says: "The 'Ghost Access' mode ... bypasses the `ProjectConfigContext` ... rendering an empty state in `VaultSidebar` instead of a populated tree."
        # And App.tsx: "if import.meta.env.VITE_JULES_MODE === 'true' ... setUser(...)".
        # So we should be logged in.

        # However, we need to open the Director Panel.
        # ArsenalDock is visible. We need to click the Clapperboard icon (Director).
        # ArsenalDock.tsx: title="Director de Escena" aria-label="Director"

        print("Opening Director Panel...")
        try:
            director_btn = page.locator('button[aria-label="Director"]')
            director_btn.wait_for(state="visible", timeout=10000)
            director_btn.click()
            time.sleep(2) # Animation
        except Exception as e:
            print(f"Error opening Director: {e}")
            page.screenshot(path="verification/error_state.png")
            return

        # Screenshot the Director Panel
        print("Taking screenshot...")
        page.screenshot(path="verification/director_panel_verification.png")

        # Verify specific elements if possible
        # Check for Archive icon button in header
        archive_btn = page.locator('button[title="Archivos de Sesión"] svg.lucide-archive')
        if archive_btn.count() > 0:
            print("SUCCESS: Archive icon found.")
        else:
            print("FAILURE: Archive icon NOT found.")

        # Check for padding on input area
        # We can't easily check CSS computed style via locator.count(), but we can check if elements exist.

        browser.close()

if __name__ == "__main__":
    verify_director_panel()
