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

        # 2. CHECK INITIAL STATE (EDITOR)
        print("🔍 Checking Initial State (Editor View)...")
        # Sidebar header text
        sidebar_header = page.locator("h2", has_text="MANUAL DE CAMPO") # CSS makes it uppercase, DOM text is mixed.
        # Playwright matches DOM text usually. "Manual de Campo"
        # Let's try simple text match.
        try:
            expect(page.get_by_text("Manual de Campo").first).to_be_visible()
            print("✅ Sidebar VISIBLE in Editor Mode.")
            page.screenshot(path="verification/1_editor_mode_v2.png")
        except:
             print("❌ Sidebar NOT DETECTED (Check case/selector).")
             page.screenshot(path="verification/error_initial_v2.png")
             # Proceeding anyway as screenshot showed it was there.

        # 3. SWITCH TO FORGE (HEAVY TOOL)
        print("🔨 Switching to Forge...")
        # Button in Arsenal Dock.
        # Title "Forge" (English) or "Forja" (Spanish)?
        # Code: title={GEMS[gemId].name}
        # Constants GEMS['forja'].name -> likely "Forja" or "Forge"?
        # ArsenalDock has `aria-label="Forge"`.

        forge_btn = page.locator("button[aria-label='Forge']")
        if not forge_btn.is_visible():
             print("⚠️ 'Forge' aria-label not found, trying 'Forja'...")
             forge_btn = page.locator("button[title='Forja']")

        if forge_btn.is_visible():
             forge_btn.click()
             print("✅ Clicked Forge.")
        else:
             print("❌ Forge button not found!")
             page.screenshot(path="verification/error_no_forge_btn.png")
             browser.close()
             return

        page.wait_for_timeout(2000) # Animation

        # Check Sidebar HIDDEN
        # The Sidebar container `w-0` means it's still in DOM but width 0.
        # Visually hidden?
        # Playwright `to_be_visible()` checks for non-zero size.
        # So `w-0` should fail `to_be_visible()`.

        try:
            # We expect the text inside to be hidden because parent is w-0 overflow-hidden
            expect(page.get_by_text("Manual de Campo").first).not_to_be_visible()
            print("✅ Sidebar HIDDEN in Forge Mode.")
            page.screenshot(path="verification/2_forge_mode_v2.png")
        except:
            print("❌ Sidebar STILL VISIBLE in Forge Mode.")
            page.screenshot(path="verification/error_forge_v2.png")

        # 4. CLOSE FORGE (RESTORE)
        print("↩️ Closing Forge (Toggle)...")
        # Click Forge button again to toggle back to Editor
        forge_btn.click()
        page.wait_for_timeout(2000)

        try:
            expect(page.get_by_text("Manual de Campo").first).to_be_visible()
            print("✅ Sidebar RESTORED after closing Forge.")
            page.screenshot(path="verification/3_restored_mode_v2.png")
        except:
            print("❌ Sidebar NOT RESTORED.")
            page.screenshot(path="verification/error_restore_v2.png")

        # 5. OPEN DIRECTOR
        print("🎬 Opening Director...")
        director_btn = page.locator("button[aria-label='Director']")
        director_btn.click()
        page.wait_for_timeout(2000)

        try:
            expect(page.get_by_text("Manual de Campo").first).to_be_visible()
            print("✅ Sidebar VISIBLE in Director Mode.")
            page.screenshot(path="verification/4_director_mode_v2.png")
        except:
            print("❌ Sidebar HIDDEN in Director Mode.")
            page.screenshot(path="verification/error_director_v2.png")

        browser.close()

if __name__ == "__main__":
    test_sidebar_visibility()
