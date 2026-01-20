from playwright.sync_api import sync_playwright, expect
import time

def verify_world_engine_load(page):
    print("Navigating to application...")
    page.goto("http://localhost:3000", timeout=60000)

    # 1. Login (if needed) or bypass via Ghost Mode
    # The app seems to be in Ghost Mode based on logs, so it might skip login.
    # We'll wait for the main interface.
    print("Waiting for editor or sidebar...")
    # Take screenshot to see where we are
    time.sleep(5)
    page.screenshot(path="/home/jules/verification/load_state.png")

    # Increase timeout for initial load
    # Maybe "Documentos" is not visible yet, try finding something else or just log source
    # page.wait_for_selector('text=Documentos', timeout=30000)

    # 2. Open World Engine Panel (Perforador)
    # Finding the button in the sidebar/dock.
    # Looking at ArsenalDock.tsx (implied), buttons usually have tooltips or specific icons.
    # Let's search by text or role. "Perforador" or "World Engine".
    # Assuming ArsenalDock has a button for 'perforador'.
    print("Opening World Engine...")

    # Try to find the button using aria-label defined in ArsenalDock.tsx
    # aria-label="World Engine" (from GEM_LABELS)
    try:
        print("Clicking 'World Engine' button...")
        page.get_by_label("World Engine").click()
    except:
        print("Could not find button by label 'World Engine'. Trying title 'Perforador de Mundos'...")
        try:
             page.get_by_title("Perforador de Mundos").click()
        except:
             print("Fallback failed. Taking screenshot of dock.")
             page.screenshot(path="/home/jules/verification/debug_dock.png")
             raise Exception("Could not find World Engine button")

    # 3. Wait for World Engine Panel to load
    print("Waiting for World Engine Panel...")
    # It should show "ESTABLISHING NEURAL LINK..." or the canvas.
    # We added a loader "CONNECTING TO CANON VAULT...".
    page.wait_for_selector("text=CONNECTING TO CANON VAULT", timeout=5000)

    # 4. Wait for Content to Load (Loader disappears)
    print("Waiting for Canon Data...")
    page.wait_for_selector("text=CONNECTING TO CANON VAULT", state="hidden", timeout=15000)

    # 5. Verify Visual Elements
    # Check for "RIGOR" slider or "ENTROPÍA"
    expect(page.get_by_text("RIGOR")).to_be_visible()

    # Check if Canvas is rendered (canvas element)
    # The ForceGraph2D usually creates a canvas inside the div.
    # Note: If no nodes, canvas might be empty but present.
    # Wait a bit more.
    time.sleep(2)
    expect(page.locator("canvas")).to_be_visible()

    # 6. Take Screenshot
    print("Taking screenshot...")
    time.sleep(2) # Wait for animation
    page.screenshot(path="/home/jules/verification/world_engine_verified.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_world_engine_load(page)
            print("Verification Successful!")
        except Exception as e:
            print(f"Verification Failed: {e}")
            page.screenshot(path="/home/jules/verification/verification_error.png")
        finally:
            browser.close()
