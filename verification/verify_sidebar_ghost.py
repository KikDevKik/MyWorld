import time
import re
from playwright.sync_api import sync_playwright

def get_port():
    # Try to read from the log file
    log_file = "dev_output_ghost.log"
    port = "3001" # Default fallback
    try:
        with open(log_file, "r") as f:
            content = f.read()
            # Look for "Local:   http://localhost:3001/"
            match = re.search(r"Local:\s+http://localhost:(\d+)/", content)
            if match:
                port = match.group(1)
            else:
                print("Could not find port in log, using default")
    except Exception as e:
        print(f"Error reading log: {e}")

    return port

def verify_sidebar(page):
    print("Page Title:", page.title())

    # Check if we are already logged in (Ghost Mode)
    # or if we need to login
    try:
        # Wait for either login button OR sidebar
        page.wait_for_selector("body")
        time.sleep(2)

        if page.locator("text=Iniciar Sesión con Google").is_visible():
             print("Login screen detected. Clicking login...")
             page.click("text=Iniciar Sesión con Google")
             page.wait_for_selector("text=Manual de Campo")
        else:
             print("Already logged in (Ghost Mode active).")
             # Wait for sidebar to appear
             page.wait_for_selector("text=Manual de Campo")

        # Now verify Sidebar
        time.sleep(2) # Let animations settle
        page.screenshot(path="verification/sidebar_final.png")
        print("Screenshot saved to verification/sidebar_final.png")

        content = page.content()

        if "Conectar Unidad" in content:
            print("FAIL: 'Conectar Unidad' button is still present!")
        else:
            print("PASS: 'Conectar Unidad' button is GONE.")

        if "Proyecto Vacío" in content:
            print("PASS: 'Proyecto Vacío' state is present.")
        else:
             # Check if it's because fileTree is NOT empty?
             print("FAIL: 'Proyecto Vacío' state is MISSING.")

    except Exception as e:
        print(f"Verification Failed: {e}")
        page.screenshot(path="verification/error_state.png")

if __name__ == "__main__":
    port = get_port()
    print(f"Connecting to port {port}")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()
        try:
            page.goto(f"http://localhost:{port}")
            verify_sidebar(page)
        except Exception as e:
            print(f"Script Error: {e}")
        finally:
            browser.close()
