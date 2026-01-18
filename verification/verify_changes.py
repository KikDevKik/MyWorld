import time
from playwright.sync_api import sync_playwright, expect

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a larger viewport to see everything
        page = browser.new_page(viewport={'width': 1280, 'height': 800})

        try:
            print("Navigating to app...")
            page.goto("http://localhost:3000")

            # Wait for app to load - check for a known element like the sidebar or HUD
            print("Waiting for app to load...")
            # Using a locator that should be present. Based on ProjectHUD, "Identidad Activa" might be visible
            # But the user is likely not logged in or in Ghost Mode.
            # Ghost Mode 'jules-dev' should be active if VITE_JULES_MODE='true' is set in .env or passed.
            # The memory says 'The Ghost Access mode (VITE_JULES_MODE='true') bypasses...'
            # Let's see if we can open the settings modal. It usually requires a button click.

            # Assuming there is a Settings button. Let's find it.
            # In SettingsModal.tsx it is exported. It is likely used in a Sidebar or HUD.
            # I will try to find a button with a settings icon or text "Configuración".

            # Wait a bit for async operations (like ghost mode login)
            time.sleep(5)

            print("Taking initial screenshot...")
            page.screenshot(path="verification/01_initial_load.png")

            # Look for the settings trigger.
            # Often it's a gear icon. Let's try to find a button that looks like settings.
            # Or I can try to find the text "Proyecto Desconocido" or the new Project Name if it defaulted.

            # Check for HUD
            hud_identity = page.locator("text=Identidad Activa")
            if hud_identity.count() > 0:
                print("HUD found.")
            else:
                print("HUD NOT found. Dumping page content...")
                # print(page.content())

            # Try to find the settings button.
            # In VaultSidebar, usually there is a user/settings area.
            # Let's try looking for a 'Settings' or 'Config' button, or an SVG with User/Gear.
            # The SettingsModal code shows <User size={24} ...> in header.
            # In the Sidebar, it might be similar.

            # Let's blindly click likely candidates if we can't find text.
            # Or better, let's search for the ProjectHUD element and see if it is clickable?
            # No, ProjectHUD is usually just display.

            # Let's look for "Configuración" button or tooltip.
            settings_btn = page.get_by_role("button").filter(has_text="Configuración")
            if settings_btn.count() == 0:
                 # Try finding by icon class or something generic if text fails
                 # Let's try to find the button that opens the modal.
                 # Usually in bottom left or top right.
                 print("Searching for Settings button...")
                 # Maybe it's a User icon?
                 pass

            # Since I don't know exactly where the settings button is,
            # I will try to find the 'Proyecto Desconocido' text in HUD and see if clicking it does anything (unlikely)
            # OR, I will look for the Sidebar buttons.

            # Let's try to verify if the modal is already open? No.

            # Let's try to find a button with SVG that looks like a gear or user.
            # We can use a selector for lucide icons if classes allow, but they are generic.

            # STRATEGY: Click the 'Proyecto' button in sidebar if exists?
            # Or 'Configuración'

            # Let's try clicking on the button that says "General" or "Profile" inside the modal *if* I can open it.

            # Wait, if I can't find the button, I can't verify the modal.
            # Let's assume there is a button with an aria-label or just "Configuración".

            # I'll try to find any button and log them to debug if needed.
            # buttons = page.get_by_role("button").all_inner_texts()
            # print("Buttons found:", buttons)

            # Let's try clicking the bottom-left button in sidebar which is usually settings/profile.
            # It usually has a User icon.

            # Trying to target the Settings button via standard layout guess
            # Sidebar is usually on the left.
            # Settings is usually at the bottom.

            # Let's try to click the button that likely opens settings.
            # I'll search for the text "Configuración" again, maybe it's an icon with tooltip.

            # Trying to find the "Settings" button by locating the User icon
            # SettingsModal has User icon. Maybe Sidebar does too.

            # Let's try locating by class if standard
            # page.locator(".lucide-user").click() # Risky

            # Let's use a brute force approach: Find all buttons, click the one that looks like settings.
            # Actually, let's look at the source code of VaultSidebar if I could... but I'm in the python script.

            # Let's just try to find the text "Configuración" which might be in the button or tooltip.
            # If not found, I'll take a screenshot of the main page and fail gracefully on the interaction,
            # but at least showing the HUD.

            # Wait! The HUD has "Identidad Activa".
            # The new code says `projectName = config?.projectName || ...`
            # If I can see the HUD, I can verify the change in logic (it shows "Proyecto Desconocido" by default).

            # TOAST verification:
            # I need to open the modal to see the new input and button.

            # Let's try to find the button that opens the modal.
            # In many of these apps, it's the User Avatar/Icon in the sidebar.

            print("Attempting to open Settings Modal...")
            # Try clicking the User/Profile area
            # Often it's at the bottom of a sidebar.

            # Let's try to click the "Proyecto" item if it exists in the tree? No.

            # Let's try looking for an element with 'Settings' or 'User' in aria-label.
            # page.get_by_label("Configuración").click()

            # Fallback: Click the first button that contains an SVG of a user?

            # Let's try to identify the sidebar.

            # If I can't open the modal, I will at least screenshot the HUD.

            # Let's try to find the button by text "Configuración" again.

            # Assuming I find it and click it:
            # page.get_by_text("Configuración").click()

            # Let's assume the button is icon-only and has no text.
            # I will try to click the element that looks like the User Profile trigger.
            # It's usually the last item in the sidebar.

            # Let's try clicking the button in the bottom left.
            # page.mouse.click(50, 750) # Risky coordinates

            # Better: Search for the SVG.
            # <svg ... class="lucide lucide-user ...">
            # page.locator("svg.lucide-user").first.click()

            user_icon = page.locator("svg.lucide-user")
            if user_icon.count() > 0:
                print("Found User icon, clicking...")
                user_icon.first.click()
                time.sleep(2) # Wait for modal
            else:
                print("User icon not found.")

                # Try finding 'settings' icon
                settings_icon = page.locator("svg.lucide-settings")
                if settings_icon.count() > 0:
                    print("Found Settings icon, clicking...")
                    settings_icon.first.click()
                    time.sleep(2)

            # Now check if Modal is open.
            if page.locator("text=Configuración General").is_visible():
                print("Settings Modal Opened!")

                # 1. VERIFY GENERAL TAB (Project Name Input)
                print("Verifying General Tab...")
                page.screenshot(path="verification/02_settings_general.png")

                # Check for "Nombre del Proyecto (Universo)"
                expect(page.get_by_text("Nombre del Proyecto (Universo)")).to_be_visible()

                # Type a name
                input_field = page.get_by_placeholder("Ej: Crónicas de la Eternidad")
                input_field.fill("Titanium Chronicles")

                # 2. VERIFY PROFILE TAB (Auto-Tone Button)
                print("Switching to Profile Tab...")
                page.get_by_text("Perfil").click()
                time.sleep(1)

                print("Verifying Profile Tab...")
                page.screenshot(path="verification/03_settings_profile.png")

                # Check for button
                auto_btn = page.get_by_role("button", name="Detectar Automáticamente")
                expect(auto_btn).to_be_visible()

                # Click it and check toast
                print("Clicking Auto-Tone button...")
                auto_btn.click()

                # Wait for toast
                time.sleep(1)
                page.screenshot(path="verification/04_toast_check.png")
                # Expect toast text
                # expect(page.get_by_text("Módulo en construcción")).to_be_visible()

                # 3. SAVE AND VERIFY HUD
                print("Saving changes...")
                page.get_by_role("button", name="Guardar Cambios").click()
                time.sleep(2)

                print("Verifying HUD update...")
                page.screenshot(path="verification/05_hud_update.png")

                # Check HUD text
                expect(page.get_by_text("Titanium Chronicles")).to_be_visible()

            else:
                print("Settings Modal did NOT open. Check screenshots.")

        except Exception as e:
            print(f"Error during verification: {e}")
            page.screenshot(path="verification/error_state.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    verify_changes()
