from playwright.sync_api import sync_playwright

def verify_forge():
    print("🚀 Starting Forge Verification Final...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            print("🌍 Navigating to http://localhost:3002...")
            page.goto("http://localhost:3002", timeout=60000)
            page.wait_for_load_state("networkidle")

            print("🔨 Finding Forge button...")
            # Try finding by icon or specific button
            # Trying to find the hammer icon button in sidebar
            # Assuming it's one of the buttons in the sidebar nav
            # Let's take a screenshot of initial page to be safe if it fails
            page.screenshot(path="verification/initial_load.png")

            # Use specific selector if possible, or try 'Forja de Almas'
            try:
                page.get_by_label("Forja de Almas").click(timeout=5000)
            except:
                print("⚠️ Label not found, trying generic hammer icon click")
                page.locator("svg.lucide-hammer").first.click()

            print("⏳ Waiting for Hub...")
            page.wait_for_selector("text=El Hub", timeout=10000)

            print("🔍 Verifying Mock Root...")
            page.wait_for_selector("text=Mock Canon Root", timeout=5000)

            # Take verification screenshot
            screenshot_path = "verification/forge_hub_success.png"
            page.screenshot(path=screenshot_path)
            print(f"✅ Success! Screenshot saved to {screenshot_path}")

        except Exception as e:
            print(f"❌ Failed: {e}")
            page.screenshot(path="verification/forge_failure.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    verify_forge()
