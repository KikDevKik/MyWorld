
from playwright.sync_api import Page, expect, sync_playwright

def test_ghost_forge(page: Page):
    page.on("console", lambda msg: print(f"BROWSER LOG: {msg.text}"))
    page.on("pageerror", lambda err: print(f"BROWSER ERROR: {err}"))

    # 1. Navigate to App (Ghost Mode auto-logs in)
    page.goto("http://localhost:3000")

    # 2. Wait for Editor Content (implies loaded)
    expect(page.get_by_text("# Mock Content")).to_be_visible(timeout=20000)

    # 3. Open Forge
    # Use robust selector for the Hammer icon (Forge)
    page.locator("button:has(svg.lucide-hammer)").click()

    # 4. Verify Forge Dashboard Loaded
    expect(page.get_by_text("FORJA DE ALMAS")).to_be_visible()

    # 5. Verify New Categories (Ghost Mode Mock Data)
    # Check for Location "Castillo de Cristal"
    expect(page.get_by_text("Castillo de Cristal")).to_be_visible()

    # Check for Object "Espada de Luz"
    expect(page.get_by_text("Espada de Luz")).to_be_visible()

    # 6. Take Screenshot
    page.screenshot(path="tests/verification_ghost_forge.png")
    print("Screenshot saved to tests/verification_ghost_forge.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_ghost_forge(page)
        except Exception as e:
            print(f"Test failed: {e}")
            page.screenshot(path="tests/verification_failed.png")
        finally:
            browser.close()
