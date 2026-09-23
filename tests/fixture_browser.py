from playwright.sync_api import sync_playwright


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()

        page.goto('http://127.0.0.1:8765/fixtures/autocomplete.html')
        page.wait_for_load_state('networkidle')
        page.locator('#school').fill('燕山大学')
        page.locator('.suggestion').wait_for()
        page.locator('.suggestion').click()
        assert page.locator('#school').input_value() == '燕山大学'
        assert page.locator('#schoolId').input_value() == 'ysu-001'

        page.goto('http://127.0.0.1:8765/fixtures/custom-select.html')
        page.wait_for_load_state('networkidle')
        page.locator('.ant-select').click()
        page.locator('.ant-select-item-option', has_text='硕士研究生').click()
        assert page.locator('.selected').inner_text() == '硕士研究生'

        page.goto('http://127.0.0.1:8765/fixtures/date-picker.html')
        page.locator('#graduation').fill('2027-06')
        page.locator('#birth').fill('1999-01-02')
        assert page.locator('#graduation').input_value() == '2027-06'
        assert page.locator('#birth').input_value() == '1999-01-02'
        page.locator('[data-date-picker]').click()
        page.locator('.date-popup [data-value="2027-06"]').click()
        assert page.locator('.date-value').inner_text() == '2027年6月'

        browser.close()


if __name__ == '__main__':
    main()
