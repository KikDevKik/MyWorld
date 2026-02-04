
import os
import time
from playwright.sync_api import sync_playwright, expect

def verify_localization():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            # 1. Inject localStorage to set language to English initially
            # We need to do this before page load or reload
            page.goto("http://localhost:3001")

            # Allow app to hydrate
            time.sleep(2)

            # Set language to English and reload to apply
            page.evaluate("localStorage.setItem('myworld_language_preference', 'en')")
            page.reload()
            time.sleep(2)

            # 2. Open Settings and Change to Japanese (JP)
            # Find the Settings button in the sidebar (assuming it's labeled 'Preferences' in EN)
            settings_btn = page.locator('button[aria-label="Preferences"]')
            if not settings_btn.is_visible():
                # Fallback: Maybe it's just an icon or has a different label in English
                # In previous steps we saw 'Preferences' in EN sidebar
                # Let's try finding by text 'Preferences'
                 settings_btn = page.get_by_text("Preferences")

            settings_btn.click()
            time.sleep(1)

            # In Settings Modal, find Language Selector
            # It's a select element
            select = page.locator('select')
            select.select_option('jp')

            # Click Save Changes (Save Changes in EN)
            save_btn = page.get_by_text("Save Changes")
            save_btn.click()
            time.sleep(2) # Wait for toast and potential reload

            # 3. Verify Sidebar Localization (JP)
            # 'Preferences' should now be '設定' (Settei)
            # 'Project' should be 'プロジェクト'
            expect(page.get_by_text("設定")).to_be_visible()
            expect(page.get_by_text("プロジェクト")).to_be_visible()

            # 4. Open Director Panel and Verify
            # Click on 'Director' tool (might be an icon, let's assume Director tool exists)
            # In localized JP, 'Director' is 'ディレクター'
            # But the tool button might just be an icon or have a tooltip
            # Let's try to find the Director toggle or panel opener.
            # Assuming it's in the sidebar or a tools menu.
            # Based on 'src/components/DirectorPanel.tsx', the title is localized.

            # Let's try to open the Export Panel ("La Imprenta") as it was a specific request
            # "La Imprenta" in JP is "印刷所" (Insatsusho)
            # Find the print/export button. usually an icon.
            # We might need to select a file first to see some tools, but Export might be global?
            # Let's try to take a screenshot of the Sidebar to prove at least the main UI is localized.

            page.screenshot(path="verification/localization_sidebar_jp.png")
            print("Sidebar JP screenshot captured.")

            # 5. Open Settings Again to verify Settings Strings in JP
            # Click '設定'
            page.get_by_text("設定").click()
            time.sleep(1)

            # Verify "General Settings" -> "一般設定"
            expect(page.get_by_text("一般設定")).to_be_visible()

            # Verify "Project Name" -> "プロジェクト名"
            expect(page.get_by_text("プロジェクト名")).to_be_visible()

            # Capture Settings Modal in JP
            page.screenshot(path="verification/localization_settings_jp.png")
            print("Settings JP screenshot captured.")

        except Exception as e:
            print(f"Error during verification: {e}")
            page.screenshot(path="verification/error_state.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    verify_localization()
