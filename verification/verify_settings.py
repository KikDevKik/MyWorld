from playwright.sync_api import sync_playwright

def verify_settings_modal():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 720})

        # Correct port from server.log is 3000
        try:
            page.goto("http://localhost:3000", timeout=60000)
            print("Page loaded")
        except Exception as e:
            print(f"Failed to load page: {e}")
            browser.close()
            return

        page.wait_for_load_state("networkidle")

        # Take a screenshot of the main page to ensure it loaded
        page.screenshot(path="verification/main_page.png")
        print("Main page screenshot taken")

        try:
            # Try to find a settings button.
            # Searching for the settings icon or button.
            # In many apps it's in a sidebar or top bar.
            # Let's try to find an element that might open it.
            # If we fail, we'll just report the main page.

            # Assuming there's a button with 'settings' or 'config' text or icon.
            # Searching for the text "Configuración" might work if it's already visible? No, it's inside the modal.

            # Let's try to find a button with an SVG inside.
            # Or look for aria-label "Settings"

            # Let's just dump the page content to stdout to help debug if needed (not here)
            # but for now, I'll try to click any likely candidate.

            # I'll look for the CommandBar input which might be visible, but the settings button is usually separate.
            # Let's look for a User icon button.

            user_btn = page.locator("button svg.lucide-user").locator("..") # Parent button
            if user_btn.count() > 0:
                 user_btn.first.click()
                 print("Clicked User button")
            else:
                 # Try settings icon
                 settings_btn = page.locator("button svg.lucide-settings").locator("..")
                 if settings_btn.count() > 0:
                     settings_btn.first.click()
                     print("Clicked Settings button")

            # Wait for modal text
            try:
                page.wait_for_selector("text=Configuración", timeout=3000)
                print("Modal opened")

                # Click "Memoria (Debug)" tab
                page.click("text=Memoria (Debug)")
                page.wait_for_timeout(1000) # Wait for animation

                # Take screenshot of the memory tab
                page.screenshot(path="verification/settings_memory_tab.png")
                print("Memory tab screenshot taken")
            except:
                print("Modal did not open or text not found")

        except Exception as e:
            print(f"Interaction failed: {e}")

        browser.close()

if __name__ == "__main__":
    verify_settings_modal()
