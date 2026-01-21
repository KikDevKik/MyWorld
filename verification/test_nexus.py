from playwright.sync_api import sync_playwright
import time

def test_nexus_graph():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the app (assuming it's running on port 5173)
        page.goto("http://localhost:5173")

        # Wait for the canvas to appear (NexusGraph uses HTML5 Canvas)
        try:
            # Wait for canvas element
            page.wait_for_selector("canvas", timeout=10000)

            # Wait a bit for the graph to "stabilize" (Pre-warm should handle most of it)
            time.sleep(2)

            # Take a screenshot
            page.screenshot(path="verification/nexus_graph_stable.png")
            print("Screenshot captured: verification/nexus_graph_stable.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")

        finally:
            browser.close()

if __name__ == "__main__":
    test_nexus_graph()
