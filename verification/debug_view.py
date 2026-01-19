from playwright.sync_api import sync_playwright, expect

def test_debug_view():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})

        print("🚀 Navigating...")
        page.goto("http://localhost:3000")

        try:
             page.wait_for_selector('h2', timeout=10000)
        except:
             print("❌ Failed to load")
             browser.close()
             return

        # CHECK EDITOR STATE
        root = page.locator("div[data-active-view]")
        view = root.get_attribute("data-active-view")
        show = root.get_attribute("data-show-sidebar")
        print(f"Initial State: View='{view}', ShowSidebar='{show}'")

        # SWITCH TO FORGE
        print("🔨 Switching to Forge...")
        # Use a more generic selector to ensure we hit the button
        # The icon is Hammer.
        page.locator("button").filter(has_text="Forge").click()
        # Wait for update
        page.wait_for_timeout(1000)

        view = root.get_attribute("data-active-view")
        show = root.get_attribute("data-show-sidebar")
        print(f"Forge State: View='{view}', ShowSidebar='{show}'")

        # Take Screenshot
        page.screenshot(path="verification/debug_forge.png")

        browser.close()

if __name__ == "__main__":
    test_debug_view()
