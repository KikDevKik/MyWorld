from playwright.sync_api import sync_playwright

def test_arquitecto_tooltip():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Setup context local storage para que cargue mock config y nos muestre el editor
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()

        # Evitar overlays u otros dialogos
        page.add_init_script("""
            window.localStorage.setItem('myworld_tutorial_completed', 'true');
        """)

        page.goto("http://localhost:3000")
        page.wait_for_selector('text=CARGANDO', state='hidden', timeout=15000)

        page.wait_for_timeout(2000)

        try:
            modal_x = page.locator('button.absolute.right-4.top-4.text-zinc-400').first
            modal_x.click(force=True)
        except:
            pass

        try:
            page.evaluate("""
                document.querySelector('.driver-popover').remove();
            """)
        except:
            pass

        arq_btn = page.locator('button[aria-label="El Arquitecto"]').first
        arq_btn.wait_for(state='visible', timeout=10000)
        arq_btn.click(force=True)

        page.wait_for_timeout(3000)

        # Para cerrar el arquitecto, usamos escape key en lugar de clickear el boton o le damos un click forzado de coordenadas:
        page.keyboard.press("Escape")
        page.wait_for_timeout(1000)

        # A ver si en el editor se ve el boton del status bar
        status_btn = page.locator('button[aria-label*="pendientes del Arquitecto"]').first

        try:
            status_btn.wait_for(state='visible', timeout=5000)
            status_btn.hover()
            page.wait_for_timeout(1000)
        except Exception as e:
            print("No se encontró status_btn o no se pudo hover. Error:", e)

        # Tomamos captura de la parte inferior de la pantalla o full page
        page.screenshot(path="verification_statusbar_8.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    test_arquitecto_tooltip()
