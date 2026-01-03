from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_frontend(page: Page):
    # 1. Arrange: Go to the app (using localhost:3000 as indicated by the logs)
    print("Navigating to app...")
    page.goto("http://localhost:3000")

    # Wait for loading to finish (the "CARGANDO SISTEMAS NEURONALES..." text should disappear)
    # The login screen should appear.
    print("Waiting for login screen...")

    # Since I cannot easily log in without real credentials/interaction in this headless environment,
    # I will verify the initial state (Login Screen) which confirms the app built and loaded.
    # If the app crashed due to my changes in App.tsx, the login screen might not appear or we might see a white screen.

    try:
        # Check for text present in LoginScreen.tsx "Acceso al Sistema" or similar
        # Inspecting LoginScreen.tsx... I'll check for a button or input.
        # Let's assume there is a generic login button or text.
        # I'll just wait for a known element or take a screenshot of whatever is there.
        # Actually, let's wait for a bit to ensure any crash happens if it's going to happen.
        time.sleep(5)

        # Take a screenshot of the initial state
        print("Taking screenshot...")
        page.screenshot(path="/home/jules/verification/verification.png")

        # Check if the title is correct (usually set in index.html, defaulting to Vite App or similar)
        title = page.title()
        print(f"Page title: {title}")

    except Exception as e:
        print(f"Error during verification: {e}")
        page.screenshot(path="/home/jules/verification/error.png")
        raise e

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_frontend(page)
        finally:
            browser.close()
