import re
import time
from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))

        print("Navigating to app...")
        page.goto("http://localhost:3000")

        page.wait_for_load_state("networkidle")
        time.sleep(2)

        print("Searching for Preferencias...")
        settings_btn = page.get_by_text("Preferencias")

        try:
            expect(settings_btn).to_be_visible(timeout=5000)
            settings_btn.click()
        except Exception as e:
            print(f"Error finding button: {e}")
            page.screenshot(path="verification/debug_failure.png")
            browser.close()
            exit(1)

        print("Verifying Modal Open...")
        # Fix strict mode violation by being more specific
        expect(page.get_by_role("heading", name="Configuración", exact=True)).to_be_visible()

        print("Switching to Profile Tab...")
        profile_tab = page.get_by_role("button", name="Perfil")
        profile_tab.click()

        page.wait_for_timeout(500)

        print("Verifying UI Changes...")

        if page.get_by_label("Inspiraciones").count() > 0:
             print("FAILURE: 'Inspiraciones' input found!")
             exit(1)

        if page.get_by_label("Reglas de Oro").count() > 0:
             print("FAILURE: 'Reglas de Oro' input found!")
             exit(1)

        print("SUCCESS: Old inputs removed.")

        style_label = page.get_by_text("Estilo y Tono")
        expect(style_label).to_be_visible()

        style_area = page.get_by_placeholder("Describe tu voz narrativa")
        expect(style_area).to_be_visible()

        rows_val = style_area.get_attribute("rows")
        if rows_val != "12":
            print(f"FAILURE: Expected rows=12, got {rows_val}")
            exit(1)
        print("SUCCESS: Style textarea expanded.")

        note_strong = page.get_by_text("Gestión de Inspiraciones")
        expect(note_strong).to_be_visible()

        note_body = page.get_by_text("Gestiona tu carpeta de Recursos en la pestaña Proyecto")
        expect(note_body).to_be_visible()
        print("SUCCESS: Info note found.")

        print("Taking screenshot...")
        page.screenshot(path="verification/settings_profile_verified.png")

        browser.close()

if __name__ == "__main__":
    run()
