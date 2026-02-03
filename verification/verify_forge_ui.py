from playwright.sync_api import sync_playwright
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.set_viewport_size({"width": 1280, "height": 720})

    # 1. Navigate to App (Ghost Mode)
    page.goto("http://localhost:3000")

    # Wait for loading
    page.wait_for_timeout(3000)

    # 2. Click Forge Icon (Anvil) in Sidebar
    try:
        page.wait_for_selector("button", state="visible")

        forge_btn = page.locator("button:has(svg.lucide-hammer)")
        if forge_btn.count() > 0:
            forge_btn.click()
        else:
            page.get_by_title("Forja de Almas").click()

    except Exception as e:
        print(f"Error clicking forge: {e}")
        page.screenshot(path="verification/error_forge_click.png")
        return

    page.wait_for_timeout(2000)

    # 3. Click "Materializar" on the Ghost Card
    try:
        # Find the specific card
        # We look for a container that has the text "Sombra del Pasillo"
        # And inside that, we find the button "Materializar"

        # Note: Playwright locators are strict.
        # "Materializar" might be uppercase in CSS but text in DOM might be mixed or diff.
        # The button text in JSX is "Materializar" (Zap icon + text).

        # Use a more generic locator
        materialize_btn = page.locator("button:has-text('Materializar')").first
        if materialize_btn.count() > 0:
            materialize_btn.click()
        else:
            print("Materializar button not found")
            page.screenshot(path="verification/error_no_materialize_btn.png")
            return

    except Exception as e:
        print(f"Error clicking card button: {e}")
        page.screenshot(path="verification/error_card_click.png")
        return

    # Wait for modal animation
    page.wait_for_timeout(3000)

    # 4. Screenshot the Chat Header
    page.screenshot(path="verification/forge_chat_opened.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
