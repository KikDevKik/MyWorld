from playwright.sync_api import sync_playwright, expect

def test_sidebar_visibility():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        print("🚀 Navigating to App (Ghost Mode)...")
        page.goto("http://localhost:3000")

        # 1. WAIT FOR APP
        try:
             page.wait_for_selector('h2', timeout=15000) # Wait for the header
             print("✅ App loaded.")
        except:
             print("❌ App load failed.")
             page.screenshot(path="verification/error_load_v2.png")
             browser.close()
             return

        root = page.locator("div[data-active-view]")

        # 2. CHECK INITIAL STATE (EDITOR)
        print(f"🔍 Initial: View='{root.get_attribute('data-active-view')}', Show='{root.get_attribute('data-show-sidebar')}'")

        # 3. SWITCH TO FORGE (HEAVY TOOL)
        print("🔨 Switching to Forge...")
        forge_btn = page.locator("button[aria-label='Forge']")
        if not forge_btn.is_visible():
             forge_btn = page.locator("button[title='Forja']")

        forge_btn.click()
        print("✅ Clicked Forge.")

        page.wait_for_timeout(2000) # Animation

        view = root.get_attribute("data-active-view")
        show = root.get_attribute("data-show-sidebar")
        print(f"🔨 Forge State: View='{view}', Show='{show}'")

        # Check Sidebar HIDDEN
        try:
            expect(page.get_by_text("Manual de Campo").first).not_to_be_visible()
            print("✅ Sidebar HIDDEN in Forge Mode.")
        except:
            print("❌ Sidebar STILL VISIBLE in Forge Mode.")
            page.screenshot(path="verification/error_forge_v3.png")

        browser.close()

if __name__ == "__main__":
    test_sidebar_visibility()
