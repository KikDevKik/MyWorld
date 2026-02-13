from playwright.sync_api import Page, expect, sync_playwright

def test_project_settings_modal(page: Page):
  # Set localStorage to skip tutorial
  page.add_init_script("localStorage.setItem('has_seen_intro_tutorial_v1', 'true');")

  # 1. Arrange: Go to the homepage.
  page.goto('http://localhost:3000')

  # 2. Wait for sidebar
  sidebar_btn = page.locator('#sidebar-project-settings')
  expect(sidebar_btn).to_be_visible(timeout=30000)

  # 3. Act: Click the Project Settings button.
  sidebar_btn.click()

  # 4. Assert: Modal appears.
  modal = page.locator('#project-settings-modal')
  expect(modal).to_be_visible(timeout=5000)

  # Check attributes
  print('Role:', modal.get_attribute('role'))
  print('Aria-Modal:', modal.get_attribute('aria-modal'))
  print('Aria-LabelledBy:', modal.get_attribute('aria-labelledby'))

  assert modal.get_attribute('role') == 'dialog'
  assert modal.get_attribute('aria-modal') == 'true'
  assert modal.get_attribute('aria-labelledby') == 'project-settings-title'

  # Check close button
  close_btn = page.get_by_label('Cerrar configuración')
  expect(close_btn).to_be_visible()

  # 5. Screenshot
  page.screenshot(path='verification/project_settings_modal.png')
  print('Verification successful!')

if __name__ == '__main__':
  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    try:
      test_project_settings_modal(page)
    except Exception as e:
      print(f'Error: {e}')
      page.screenshot(path='verification/error.png')
    finally:
      browser.close()
