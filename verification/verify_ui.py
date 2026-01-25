from playwright.sync_api import sync_playwright

def verify_project_settings_modal():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Open App
        print("Opening App...")
        page.goto("http://localhost:3000")

        # 2. Wait for Sidebar (it has "Manual de Campo")
        print("Waiting for Sidebar...")
        try:
            page.wait_for_selector("text=Manual de Campo", timeout=15000)
        except:
            print("Timeout waiting for Sidebar. Dumping page content snippet...")
            content = page.content()
            print(content[:500])
            page.screenshot(path="/home/jules/verification/error_state.png")
            raise

        # 3. Open Project Settings
        print("Clicking Project Settings button...")
        # Button with text "Proyecto"
        # Since there might be multiple "Proyecto" texts (e.g. tooltip), use exact match or robust locator.
        # Sidebar has a button with text "Proyecto".
        project_btn = page.get_by_role("button", name="Proyecto")
        project_btn.click()

        # 4. Wait for Modal
        print("Waiting for Modal...")
        page.wait_for_selector("text=Configuración del Proyecto", timeout=5000)

        # 5. Check for Chronology Section (Should NOT exist)
        print("Checking for Chronology section...")
        chronology_label = page.locator("text=Ruta de Cronología")

        if chronology_label.count() > 0 and chronology_label.is_visible():
            print("❌ FAILURE: 'Ruta de Cronología' is still visible!")
        else:
            print("✅ SUCCESS: 'Ruta de Cronología' is GONE.")

        # 6. Check for Canon Paths (Should exist)
        canon_label = page.locator("text=Rutas Canon")
        if canon_label.is_visible():
             print("✅ Verified: 'Rutas Canon' is present.")
        else:
             print("❌ WARNING: 'Rutas Canon' missing?")

        # 7. Screenshot
        page.screenshot(path="/home/jules/verification/settings_modal.png")
        print("Screenshot saved to /home/jules/verification/settings_modal.png")

        browser.close()

if __name__ == "__main__":
    verify_project_settings_modal()
