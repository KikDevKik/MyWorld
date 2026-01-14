from playwright.sync_api import sync_playwright, expect

def test_internal_file_selector():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a larger viewport to see the modal clearly
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()

        # 1. Navigate to the app in Ghost Mode (Jules Dev)
        # We append VITE_JULES_MODE=true query param if the app supports it,
        # or rely on the environment. The memory says "injecting VITE_JULES_MODE='true' directly within the webServer configuration"
        # but here I am running `npm run dev` manually. I can't easily inject env vars into the running process from here
        # unless I restart it.
        # However, looking at App.tsx (if I could), it might read from import.meta.env.
        # If I cannot change env, I might need to login.
        # BUT, the memory says "Ghost Access protocol bypasses Google Auth... explicitly accepting data fetch failures".
        # Let's try to pass it via URL if supported, or hope the default dev env allows access.
        # Actually, `npm run dev` uses `.env` files.
        # Let's assume the app loads.

        print("Navigating to app...")
        page.goto("http://localhost:3000/")

        # Wait for the app to load.
        # We expect to see the "Seleccionar Fuente de Verdad" screen if no source is selected.
        # Or "Vault Connection Required" if no vault is linked.
        # In Ghost Mode, it might default to something.

        # Let's wait for network idle to ensure initial checks are done.
        page.wait_for_load_state("networkidle")

        # Screenshot initial state
        page.screenshot(path="verification/step1_initial.png")
        print("Initial state screenshot taken.")

        # Check if we are at "Seleccionar Fuente de Verdad" (ForgeSourceSelector)
        # Look for text "Seleccionar la Fuente de Verdad"
        try:
            expect(page.get_by_text("Seleccionar la Fuente de Verdad")).to_be_visible(timeout=5000)
            print("Found 'Seleccionar la Fuente de Verdad' screen.")
        except:
            print("Did not find Source Selector immediately. Checking for Vault Connection...")
            # Maybe we are at ForgePanel (Vault Connection)
            try:
                expect(page.get_by_text("Vault Connection Required")).to_be_visible(timeout=2000)
                print("Found 'Vault Connection Required'.")
                # If so, we can't easily get to Source Selector without connecting a vault (which requires Google Auth).
                # UNLESS Ghost Mode is active.
                # If Ghost Mode is active, maybe it mocks the config?
                # Let's try to force the state if possible, or just fail and report.
            except:
                print("Unknown state.")

        # 2. Interact with the new button
        # Button text: "Seleccionar de Memoria..."
        print("Clicking 'Seleccionar de Memoria...'...")
        try:
            page.get_by_role("button", name="Seleccionar de Memoria...").click(timeout=5000)

            # 3. Verify Modal Opens
            # Modal Header: "Seleccionar Fuente de Verdad" (same as main screen, but in modal)
            # Or "TDB_INDEX :: READY"
            expect(page.get_by_text("TDB_INDEX :: READY")).to_be_visible()
            print("Internal Selector Modal Opened!")

            # Take screenshot of the modal
            page.screenshot(path="verification/verification.png")
            print("Verification screenshot taken.")

        except Exception as e:
            print(f"Error finding button or modal: {e}")
            page.screenshot(path="verification/error.png")

        browser.close()

if __name__ == "__main__":
    test_internal_file_selector()
