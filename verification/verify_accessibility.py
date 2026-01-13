from playwright.sync_api import sync_playwright, expect

def verify_accessibility():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Navigating to app...")
        try:
            page.goto("http://localhost:3000")
            print("Waiting for network idle...")
            page.wait_for_load_state("networkidle")

            # Verify CommandBar (visible by default)
            print("Checking for CommandBar 'Instrucción' input...")
            try:
                # Use get_by_label for robust accessibility check
                expect(page.get_by_label("Instrucción")).to_be_visible(timeout=10000)
                print("✅ Found CommandBar 'Instrucción' input")
            except Exception as e:
                print(f"❌ Could not find CommandBar 'Instrucción' input: {e}")

            print("Checking for CommandBar 'Ejecutar comando' button...")
            try:
                expect(page.get_by_label("Ejecutar comando")).to_be_visible(timeout=5000)
                print("✅ Found CommandBar 'Ejecutar comando' button")
            except Exception as e:
                print(f"❌ Could not find CommandBar 'Ejecutar comando' button: {e}")

            print("Checking for CommandBar 'Menú de herramientas' button...")
            try:
                expect(page.get_by_label("Menú de herramientas")).to_be_visible(timeout=5000)
                print("✅ Found CommandBar 'Menú de herramientas' button")
            except Exception as e:
                print(f"❌ Could not find CommandBar 'Menú de herramientas' button: {e}")

            # Try to switch to Guardian (Chat) if possible to verify ForgeChat
            # The sidebar is on the right. Guardian is likely the 'Shield' icon.
            # But just verifying CommandBar is sufficient to prove the pattern was applied.

            # Take final screenshot
            page.screenshot(path="verification/accessibility_check_v2.png")
            print("✅ Verification screenshot saved to verification/accessibility_check_v2.png")

        except Exception as e:
            print(f"❌ General Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_accessibility()
