from playwright.sync_api import sync_playwright

def verify_nexus():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Navigating to http://localhost:3000...")
        page.goto("http://localhost:3000")

        # 1. Wait for Arsenal Dock
        print("Waiting for Arsenal Dock...")
        try:
            # Try to find the button by aria-label
            # Note: The aria-label is dynamic based on GEM_LABELS or GEMS names.
            # GEM_LABELS['perforador'] = 'World Engine'
            # GEMS['perforador'].name = 'Perforador de Mundos'
            # ArsenalDock uses: aria-label={GEM_LABELS[gemId] || GEMS[gemId].name}
            # So it should be 'World Engine'.

            button = page.wait_for_selector('button[aria-label="World Engine"]', timeout=5000)
            if not button:
                 button = page.wait_for_selector('button[aria-label="Perforador de Mundos"]', timeout=5000)

            print("Found World Engine button. Clicking...")
            button.click()

            # 2. Wait for Nexus Interface
            print("Waiting for World Engine interface...")
            # Look for the NEXUS button or text "Vista Global" or something unique
            page.wait_for_selector("text=NEXUS", timeout=5000)
            print("World Engine loaded.")

            # 3. Take Screenshot
            output_path = "verification/nexus_v2_active.png"
            page.screenshot(path=output_path)
            print(f"Screenshot saved to {output_path}")

        except Exception as e:
            print(f"Error during interaction: {e}")
            page.screenshot(path="verification/error_state.png")
            print("Error screenshot saved to verification/error_state.png")

        browser.close()

if __name__ == "__main__":
    verify_nexus()
