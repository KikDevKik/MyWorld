from playwright.sync_api import Page, expect, sync_playwright
import os
import time

def test_commandbar_accessibility(page: Page):
    print("Navigating to app...")
    page.goto("http://localhost:3000")

    # Wait a bit for initial load
    page.wait_for_load_state("networkidle")

    print("Looking for World Engine button...")
    # Act: Navigate to World Engine
    world_engine_btn = page.get_by_label("World Engine")
    expect(world_engine_btn).to_be_visible(timeout=10000)
    world_engine_btn.click()

    print("Waiting for World Engine to load...")
    # Wait for CommandBar input
    # It might take a moment for the component to mount
    command_input = page.get_by_label("Comando para el motor")
    expect(command_input).to_be_visible(timeout=10000)

    print("Checking Radio Group...")
    # Check Radio Group
    radio_group = page.get_by_role("radiogroup", name="Modo de Realidad")
    expect(radio_group).to_be_visible()

    # Check options
    rigor_option = page.get_by_role("radio", name="Modo RIGOR")
    fusion_option = page.get_by_role("radio", name="Modo FUSIÓN")
    entropia_option = page.get_by_role("radio", name="Modo ENTROPÍA")

    expect(rigor_option).to_be_visible()
    expect(fusion_option).to_be_visible()
    expect(entropia_option).to_be_visible()

    # Verify default state (FUSIÓN seems to be default in code)
    expect(fusion_option).to_have_attribute("aria-checked", "true")
    expect(rigor_option).to_have_attribute("aria-checked", "false")

    print("Testing Interaction...")
    # Click RIGOR
    rigor_option.click()
    expect(rigor_option).to_have_attribute("aria-checked", "true")
    expect(fusion_option).to_have_attribute("aria-checked", "false")

    # Keyboard Interaction (Tab to focus, Enter to select)
    # We need to focus first. Tab navigation might be tricky to simulate perfectly without knowing start point,
    # so we'll just focus the element directly then press Enter.
    entropia_option.focus()
    page.keyboard.press("Enter")
    expect(entropia_option).to_have_attribute("aria-checked", "true")
    expect(rigor_option).to_have_attribute("aria-checked", "false")

    # 4. Screenshot
    page.screenshot(path="verification/commandbar_verification.png")
    print("Verification screenshot saved.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_commandbar_accessibility(page)
        except Exception as e:
            print(f"Test failed: {e}")
            page.screenshot(path="verification/error.png")
            # Dump content for debugging
            with open("verification/page_dump.html", "w") as f:
                f.write(page.content())
        finally:
            browser.close()
