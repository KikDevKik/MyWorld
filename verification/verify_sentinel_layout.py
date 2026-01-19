import asyncio
from playwright.async_api import async_playwright

async def verify_layout():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Navigate to app
        try:
            # Check dev_output.log for port
            await page.goto("http://localhost:3002")
        except Exception as e:
            print(f"Error navigating: {e}")
            return

        # Wait for app to load
        try:
            await page.wait_for_selector("aside", timeout=10000)
            print("App loaded")
        except:
            print("App load timeout, continuing...")

        # 1. Standard View: Zone C should be visible (ArsenalDock)
        await page.screenshot(path="verification/1_standard_view.png")
        print("Captured standard view")

        # 2. Enter Full Focus Mode (Click "Forja" icon in Dock)
        # We need to find the Forja button. ArsenalDock usually has icons.
        # We'll try to find by aria-label or just click an icon if we can identify it.
        # Assuming Forja is one of the buttons.

        # Let's try to click the button with aria-label="Forja" or title="Forja"
        try:
            # Try to find the button.
            # If not sure about the label, we can try to find by icon class or just guess.
            # But let's try a generic selector for buttons in the dock.
            # The dock is the second 'aside' usually.

            # Let's try to find a button that looks like Forja (Hammer?).
            # Or just click the first button that is NOT the chat/director.

            # Better: Print aria-labels to see what we have
            buttons = await page.locator("aside button").all()
            for btn in buttons:
                label = await btn.get_attribute("aria-label")
                print(f"Button found: {label}")
                if label and "Forja" in label:
                    await btn.click()
                    print("Clicked Forja")
                    break
                # Fallback if english
                if label and "Forge" in label:
                     await btn.click()
                     print("Clicked Forge")
                     break

            await page.wait_for_timeout(2000) # Wait for transition
            await page.screenshot(path="verification/2_full_focus_forge.png")
            print("Captured Full Focus (Forge) view")
        except Exception as e:
            print(f"Failed to click Forja: {e}")

        # 3. Open Director in Full Focus (Overlay)
        # Use CommandBar to open Director
        try:
            await page.keyboard.press("Meta+k")
            await page.wait_for_timeout(500)
            await page.keyboard.type("Director")
            await page.wait_for_timeout(500)
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(2000)

            await page.screenshot(path="verification/3_overlay_director.png")
            print("Captured Overlay (Director) view")
        except Exception as e:
             print(f"Failed to open Director: {e}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_layout())
