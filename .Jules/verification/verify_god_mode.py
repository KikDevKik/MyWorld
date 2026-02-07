from playwright.sync_api import sync_playwright, expect
import time

def verify_god_mode_button():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Assuming mobile-like viewport since sidebar is often collapsed or narrow, but wider is safer for desktop view
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()

        print("🚀 Navigating to App...")
        # Localhost port from vite
        page.goto("http://localhost:5173")

        # Wait for app to load (skip login screen if needed or ghost mode handles it)
        # Note: App has ghost mode enabled in dev if VITE_JULES_MODE=true is set in previous steps?
        # But here we are running against `npm run dev`. I should check if ghost mode is active or if I need to mock login.
        # The App.tsx has logic: if (import.meta.env.DEV && import.meta.env.VITE_JULES_MODE === 'true') -> auto login.

        # Let's assume Ghost Mode is active or we wait for Login Screen.
        # If Login Screen appears, we can't test unless we mock auth.
        # But wait, `VaultSidebar` is visible AFTER login.

        print("⏳ Waiting for Sidebar...")
        try:
            # Wait for BrainCircuit button (Index button)
            # The aria-label is "Indexar" (t.index)
            # Or title="Indexar"
            # Selector: button[aria-label="Indexar"] or just the icon structure.

            # Since translations might vary, let's look for the button near the settings cog or trash.
            # But specific selector is better.
            # In VaultSidebar.tsx: aria-label={t.index}
            # t.index is likely "Indexar" or "Aprender".

            # Let's try to find the button with the brain icon.
            # svg.lucide-brain-circuit

            page.wait_for_selector("button:has(svg.lucide-brain-circuit)", timeout=10000)

            index_btn = page.locator("button:has(svg.lucide-brain-circuit)")

            # Click to open dropdown
            print("👇 Clicking Index Button...")
            index_btn.click()

            # Wait for Dropdown
            # Dropdown contains "Cargar Memoria (God Mode)"
            # Text might be "Cargar Memoria (God Mode)" or localized.
            # In the code: <span>Cargar Memoria (God Mode)</span>

            time.sleep(1) # Animation

            page.wait_for_selector("text=Cargar Memoria (God Mode)", timeout=5000)
            print("✅ Dropdown appeared with 'God Mode' option.")

            # Take screenshot of the open menu
            print("📸 Taking screenshot...")
            page.screenshot(path=".Jules/verification/god_mode_menu.png")

        except Exception as e:
            print(f"💥 Verification Failed: {e}")
            page.screenshot(path=".Jules/verification/god_mode_failure.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    verify_god_mode_button()
