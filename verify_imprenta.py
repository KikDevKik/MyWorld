
import re
from playwright.sync_api import Page, expect, sync_playwright

def get_dev_server_url():
    """Parses the dev server URL from the output log."""
    try:
        with open("dev_output.log", "r") as f:
            content = f.read()
            match = re.search(r"http://localhost:\d+", content)
            if match:
                return match.group(0)
    except FileNotFoundError:
        pass
    return "http://localhost:5173"  # Default fallback

def verify_export_panel(page: Page):
    # 1. Arrange: Go to the app.
    base_url = get_dev_server_url()
    print(f"Navigating to {base_url}")
    page.goto(base_url)

    # 2. LOGIN (Ghost Mode Bypass)
    # Check if we are on login screen
    try:
        page.wait_for_selector('text="Acceso Restringido"', timeout=3000)
        print("Login screen detected. Clicking Login Button...")
        page.get_by_role("button", name="Iniciar Sesión con Google").click()
    except:
        print("No login screen or timeout. Assuming logged in or loading.")

    # 3. Wait for Main App
    print("Waiting for Arsenal Dock...")
    # Wait for the Printer button (Press)
    # Use aria-label="Press" as defined in ArsenalDock.tsx
    button = page.locator('button[aria-label="Press"]')
    button.wait_for(state="visible", timeout=15000)

    # 4. Open Imprenta
    print("Opening Imprenta...")
    button.click()

    # 3. Assert: Verify the Export Panel is open.
    print("Waiting for Panel Header...")
    expect(page.get_by_text("LA IMPRENTA")).to_be_visible()
    expect(page.get_by_text("v3.3 TITAN")).to_be_visible()

    # 4. Verify Content
    # Zone A: "Composición del Manuscrito"
    expect(page.get_by_text("Composición del Manuscrito")).to_be_visible()

    # Zone B: "Prensa y Ajustes"
    expect(page.get_by_text("Prensa y Ajustes")).to_be_visible()

    # Verify New Inputs
    expect(page.get_by_placeholder("Ej. Crónicas de Titán")).to_be_visible()

    # Verify Smart Breaks Checkbox
    expect(page.get_by_text("Auto-Detectar Capítulos")).to_be_visible()
    expect(page.get_by_text("Usa headers (#) como saltos de página")).to_be_visible()

    # 5. Screenshot
    page.screenshot(path="verification_imprenta.png")
    print("Screenshot taken: verification_imprenta.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_export_panel(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification_error.png")
        finally:
            browser.close()
