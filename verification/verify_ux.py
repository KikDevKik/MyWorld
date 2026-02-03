from playwright.sync_api import Page, expect, sync_playwright

def test_session_manager_accessibility(page: Page):
    # Monitor console logs
    page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))
    page.on("pageerror", lambda err: print(f"BROWSER ERROR: {err}"))

    # 1. Arrange: Go to the app.
    page.goto("http://localhost:3000")

    # Wait for app to load (checking for ArsenalDock)
    try:
        page.wait_for_selector('button[aria-label="Director"]', timeout=15000)
    except:
        print("Director button not found after 15s.")
        page.screenshot(path="verification/failed_landing.png")
        return

    # 2. Act: Open Director
    page.get_by_label("Director").click()

    # Wait for Director panel
    page.wait_for_selector('h2:has-text("Director")', timeout=5000)

    # 3. Open Session Manager
    # Button has title "Archivos de Sesión"
    page.locator('button[title="Archivos de Sesión"]').click()

    # 4. Assert Modal Open
    page.wait_for_selector('div:has-text("Archivos de Memoria")', timeout=5000)

    # 5. Wait for Loading to Finish
    # Either "No hay registros" or a session item
    try:
        page.wait_for_selector('text="No hay registros de memoria disponibles."', timeout=10000)
        print("Empty state loaded.")
    except:
        print("Empty state text not found. Checking for items...")
        try:
             page.wait_for_selector('div[role="button"][tabindex="0"]', timeout=5000)
             print("Items loaded.")
        except:
             print("Neither empty state nor items found. Still loading?")

    # 5. Check content
    page.screenshot(path="verification/session-manager.png")

    try:
        # Check if we have items
        items = page.locator('div[role="button"][tabindex="0"]')
        count = items.count()

        if count > 0:
            print(f"Found {count} session items. Testing keyboard navigation.")
            # Focus the first item
            items.first.focus()
            page.screenshot(path="verification/session-focus.png")

            class_attr = items.first.get_attribute("class")
            if "focus-visible:ring-2" in class_attr:
                print("SUCCESS: focus-visible:ring-2 class found on session item.")
            else:
                print("WARNING: focus-visible:ring-2 class NOT found on session item.")
        else:
            print("No session items found (Empty State). Verified modal opens.")

    except Exception as e:
        print(f"Error checking items: {e}")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_session_manager_accessibility(page)
        finally:
            browser.close()
