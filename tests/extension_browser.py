import os
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


def send_message(extension_page, target_url, message):
    return extension_page.evaluate(
        """async ({ targetUrl, message }) => {
          const tabs = await chrome.tabs.query({});
          const target = tabs.find(tab => tab.url === targetUrl);
          if (!target?.id) throw new Error(`target tab not found: ${targetUrl}`);
          return await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(target.id, message, response => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else resolve(response);
            });
          });
        }""",
        {"targetUrl": target_url, "message": message},
    )


def proposal(field, value, field_type):
    return {
        "fieldId": field["id"],
        "originalLabel": field["label"],
        "fieldType": field_type,
        "value": value,
        "confidence": 1,
        "reason": "extension browser test",
        "action": "auto_fill",
    }


def verify_page(page, extension_page, url, expected):
    scan = send_message(extension_page, url, {"type": "ANALYZE"})
    assert scan["type"] == "ANALYZE_RESULT"
    fields = scan["fields"]
    proposals = []
    for label, value, field_type in expected:
        field = next(item for item in fields if item["label"] == label)
        proposals.append(proposal(field, value, field_type))

    filled = send_message(extension_page, url, {"type": "FILL_BATCH", "fields": fields, "proposals": proposals})
    assert filled["type"] == "FILL_BATCH_RESULT"
    assert all(item["success"] for item in filled["attempts"]), filled

    verified = send_message(extension_page, url, {"type": "VERIFY_BATCH", "fields": fields, "proposals": proposals})
    assert verified["type"] == "VERIFY_BATCH_RESULT"
    expected_ids = {item["fieldId"] for item in proposals}
    assert all(item["status"] == "VERIFIED" for item in verified["results"] if item["fieldId"] in expected_ids), verified
    return fields


def main() -> None:
    with sync_playwright() as playwright:
        with tempfile.TemporaryDirectory(prefix="autoapply-extension-") as profile_dir:
            context = playwright.chromium.launch_persistent_context(
                profile_dir,
                headless=False,
                args=[
                    f"--disable-extensions-except={ROOT / 'dist'}",
                    f"--load-extension={ROOT / 'dist'}",
                ],
            )
            try:
                workers = context.service_workers
                if not workers:
                    context.wait_for_event("serviceworker", timeout=10_000)
                extension_id = (context.service_workers[0].url.split("/")[2])
                extension_page = context.new_page()
                extension_page.goto(f"chrome-extension://{extension_id}/index.html")

                page = context.new_page()
                mixed_url = "http://127.0.0.1:8765/fixtures/mixed-form.html"
                page.goto(mixed_url)
                page.wait_for_load_state("networkidle")
                verify_page(page, extension_page, mixed_url, [
                    ("姓名", "张三", "NAME"),
                    ("学校", "燕山大学", "SCHOOL"),
                    ("学历", "硕士研究生", "DEGREE"),
                    ("毕业时间", "2027-06", "GRADUATION_DATE"),
                ])
                assert page.locator("#name").input_value() == "张三"
                assert page.locator("#school").input_value() == "燕山大学"
                assert page.locator("input[name=schoolId]").input_value() == "ysu-001"
                assert page.locator("#degree").input_value() == "硕士研究生"
                assert page.locator("#graduation").input_value() == "2027-06"

                custom_url = "http://127.0.0.1:8765/fixtures/date-picker.html"
                page.goto(custom_url)
                page.wait_for_load_state("networkidle")
                verify_page(page, extension_page, custom_url, [("自定义毕业时间", "2027-06", "GRADUATION_DATE")])
                assert page.locator(".date-value").inner_text() == "2027年6月"

                moka_url = "http://127.0.0.1:8765/fixtures/moka-form.html"
                page.goto(moka_url)
                page.wait_for_load_state("networkidle")
                scan = send_message(extension_page, moka_url, {"type": "ANALYZE"})
                assert scan["type"] == "ANALYZE_RESULT"
                fields = {field["label"]: field for field in scan["fields"]}
                assert fields["姓名"]["componentType"] == "text"
                assert fields["出生日期 (年龄)"]["componentType"] == "date"
                assert fields["性别"]["componentType"] == "custom-select"

                iguopin_url = "http://127.0.0.1:8765/fixtures/iguopin-form.html"
                page.goto(iguopin_url)
                page.wait_for_load_state("networkidle")
                scan = send_message(extension_page, iguopin_url, {"type": "ANALYZE"})
                assert scan["type"] == "ANALYZE_RESULT"
                fields = {field["label"]: field for field in scan["fields"]}
                assert "现居住地" in fields, scan["fields"]
                assert "毕业院校" in fields, scan["fields"]
                assert fields["姓名"]["componentType"] == "text"
                assert fields["出生日期"]["componentType"] == "date"
                assert fields["现居住地"]["componentType"] == "cascader"
                assert fields["毕业院校"]["componentType"] == "autocomplete"
                assert len([field for field in scan["fields"] if field["label"] == "性别"]) == 1
                assert len([field for field in scan["fields"] if field["label"] == "毕业院校"]) == 1
                verify_page(page, extension_page, iguopin_url, [
                    ("姓名", "张三", "NAME"),
                    ("性别", "男", "GENDER"),
                ])
                assert page.locator("#full_name").input_value() == "张三"
                assert page.locator(".ant-radio-button-input").first.is_checked()
            finally:
                context.close()


if __name__ == "__main__":
    main()
