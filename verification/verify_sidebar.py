from playwright.sync_api import sync_playwright, expect

def test_sidebar_visibility():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # 🟢 EMULATE LARGE DESKTOP TO AVOID MOBILE BREAKPOINTS
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        print("🚀 Navigating to App...")
        # App is running on 3000
        page.goto("http://localhost:3000")

        # 1. WAIT FOR LOAD
        # Login screen or App content?
        # The app might be in Ghost Mode or require login.
        # Ideally we should see something.
        # "Ghost Access Enabled" in logs suggests it bypasses auth if configured.
        # Let's wait for a known element.

        try:
             # Wait for either sidebar or login
             page.wait_for_selector('body', timeout=10000)
             print("✅ Page loaded.")
        except Exception as e:
             print(f"❌ Page load failed: {e}")
             page.screenshot(path="verification/error_load.png")
             browser.close()
             return

        # 2. CHECK INITIAL STATE (EDITOR)
        # Sidebar should be visible (w-72)
        print("🔍 Checking Initial State (Editor View)...")
        # Sidebar is the 'aside' with 'border-r'.
        # We can look for text "Manual de Campo" which is in VaultSidebar header.
        try:
            expect(page.get_by_text("Manual de Campo")).to_be_visible(timeout=5000)
            print("✅ Sidebar visible in Editor Mode.")
            page.screenshot(path="verification/1_editor_mode.png")
        except:
             print("❌ Sidebar NOT visible in Editor Mode (or Login Screen active).")
             page.screenshot(path="verification/error_initial.png")
             # If login screen, we can't proceed easily without auth.
             # Assuming Ghost Mode is working or we are just testing layout logic if we can mock it.
             # But let's see the screenshot.
             browser.close()
             return

        # 3. SWITCH TO HEAVY TOOL (FORGE)
        print("🔨 Switching to Forge (Heavy Tool)...")
        # Click the "Forge" icon in ArsenalDock (Zone C).
        # It has title "Forge" or aria-label "Forge".
        # Let's use get_by_label("Forge") or get_by_title("Forge").
        forge_btn = page.get_by_label("Forge")
        if not forge_btn.is_visible():
             # Fallback to title if aria-label missing (though I added it)
             forge_btn = page.get_by_title("Forge")

        forge_btn.click()

        # Wait for transition (Sidebar should hide)
        page.wait_for_timeout(1000)

        # Check Sidebar hidden
        # The Sidebar element (Manual de Campo) should not be visible.
        try:
            expect(page.get_by_text("Manual de Campo")).not_to_be_visible()
            print("✅ Sidebar HIDDEN in Forge Mode.")
            page.screenshot(path="verification/2_forge_mode.png")
        except:
            print("❌ Sidebar STILL VISIBLE in Forge Mode.")
            page.screenshot(path="verification/error_forge.png")

        # 4. CLOSE FORGE (RETURN TO EDITOR)
        print("↩️ Closing Forge...")
        # Close button in ForgePanel. Usually an 'X' or 'Cerrar'.
        # Look for X icon button or similar.
        # ForgePanel has `onClose`.
        # Usually standard panel has a header with X.
        # Let's try to find a button with generic close icon or label.
        # Or just click "Forge" icon again? (Toggle logic added in App.tsx)
        forge_btn.click()

        page.wait_for_timeout(1000)

        try:
            expect(page.get_by_text("Manual de Campo")).to_be_visible()
            print("✅ Sidebar RESTORED after closing Forge.")
            page.screenshot(path="verification/3_restored_mode.png")
        except:
            print("❌ Sidebar NOT RESTORED.")
            page.screenshot(path="verification/error_restore.png")

        # 5. OPEN DIRECTOR (SIDE TOOL)
        print("🎬 Opening Director...")
        director_btn = page.get_by_label("Director")
        director_btn.click()

        page.wait_for_timeout(1000)

        # Sidebar should still be visible
        try:
            expect(page.get_by_text("Manual de Campo")).to_be_visible()
            print("✅ Sidebar VISIBLE in Director Mode.")
            page.screenshot(path="verification/4_director_mode.png")
        except:
            print("❌ Sidebar HIDDEN in Director Mode.")
            page.screenshot(path="verification/error_director.png")

        browser.close()

if __name__ == "__main__":
    test_sidebar_visibility()
