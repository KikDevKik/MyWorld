from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1920, "height": 1080})
    page = context.new_page()

    # Determine port
    port = "5173" # Default
    import os
    if os.path.exists("dev_output.log"):
        with open("dev_output.log", "r") as f:
            content = f.read()
            import re
            match = re.search(r"http://localhost:(\d+)", content)
            if match:
                port = match.group(1)

    url = f"http://localhost:{port}"
    print(f"Navigating to {url}")

    try:
        page.goto(url)

        # Wait for loading
        page.wait_for_timeout(5000)

        # Check for Director Panel button (ArsenalDock)
        # It has "Director de Escena" title or "Director" aria-label
        director_btn = page.get_by_label("Director")
        if not director_btn.is_visible():
            director_btn = page.get_by_title("Director de Escena")

        if director_btn.is_visible():
            director_btn.click()
            page.wait_for_timeout(2000)

            # 1. Verify Session Drawer Toggle (History Icon)
            history_btn = page.get_by_title("Historial de Sesiones")
            if history_btn.is_visible():
                history_btn.click()
                page.wait_for_timeout(1000)
                page.screenshot(path="verification/director_session_drawer.png")
                history_btn.click() # Close it
                page.wait_for_timeout(500)
            else:
                print("History button not found")

            # 2. Verify Wide Mode (LayoutTemplate Icon)
            wide_btn = page.get_by_title("Modo Estratega (Expandir)")
            if wide_btn.is_visible():
                wide_btn.click()
                page.wait_for_timeout(1000)
                page.screenshot(path="verification/director_wide_mode.png")
            else:
                print("Wide mode button not found")

            # 3. Verify Drift HUD (Status Ring)
            # It is an SVG, hard to select by text, but we can check if it exists in the header
            # Look for "Director" text in header
            page.screenshot(path="verification/director_panel_v2.png")

        else:
            print("Director button not found. Taking screenshot of landing.")
            page.screenshot(path="verification/landing_failed.png")

    except Exception as e:
        print(f"Error: {e}")
        page.screenshot(path="verification/error.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
