from playwright.sync_api import Page, expect, sync_playwright

def test_ban_list(page: Page):
    # 1. Arrange: Go to localhost
    print("Navigating to app...")
    page.goto("http://localhost:3000")

    # 2. Act: Click 'World Engine' (Perforador)
    print("Clicking World Engine...")
    page.get_by_label("World Engine").click()

    # 3. Act: Click DEBUG button
    print("Waiting for DEBUG button...")
    debug_btn = page.get_by_text("DEBUG: OPEN TRIBUNAL")
    expect(debug_btn).to_be_visible(timeout=5000)
    debug_btn.click()

    # 4. Wait for Tribunal
    print("Waiting for Tribunal...")
    expect(page.get_by_text("NEXUS TRIBUNAL")).to_be_visible(timeout=5000)

    # 5. Act: Click Trash Tab
    print("Opening Trash tab...")
    # There are 4 buttons in the tabs container.
    page.locator("div.flex.border-b.border-slate-800 > button").nth(3).click()

    # 6. Assert: Check for Input
    print("Checking for input field...")
    input_field = page.get_by_placeholder("Add term to ban list...")
    expect(input_field).to_be_visible()

    # 7. Act: Type
    print("Adding ban term...")
    input_field.fill("ForbiddenTerm123")

    ban_button = page.get_by_role("button", name="BAN")
    expect(ban_button).to_be_enabled()

    # 8. Screenshot
    print("Taking screenshot...")
    page.screenshot(path="verification/ban_list_ui.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        print("Launching browser...")
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_ban_list(page)
            print("Test passed!")
        except Exception as e:
            print(f"Test failed: {e}")
            page.screenshot(path="verification/failure.png")
        finally:
            browser.close()
