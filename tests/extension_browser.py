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
                    "--host-resolver-rules=MAP fixture.iguopin.com 127.0.0.1",
                    "--no-proxy-server",
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

                custom_select_url = "http://127.0.0.1:8765/fixtures/custom-select.html"
                page.goto(custom_select_url)
                page.wait_for_load_state("networkidle")
                verify_page(page, extension_page, custom_select_url, [
                    ("最高学历", "硕士研究生", "DEGREE"),
                ])
                assert page.locator(".selected").inner_text() == "硕士研究生"

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

                iguopin_url = "http://fixture.iguopin.com:8765/fixtures/iguopin-form.html"
                page.goto(iguopin_url)
                page.wait_for_load_state("networkidle")
                scan = send_message(extension_page, iguopin_url, {"type": "ANALYZE"})
                assert scan["type"] == "ANALYZE_RESULT"
                fields = {field["label"]: field for field in scan["fields"]}
                assert "现居住地" in fields, scan["fields"]
                assert "户口所在地" in fields, scan["fields"]
                assert "毕业院校" in fields, scan["fields"]
                assert fields["姓名"]["componentType"] == "text"
                assert fields["出生日期"]["componentType"] == "date"
                assert fields["现居住地"]["componentType"] == "cascader"
                assert fields["毕业院校"]["componentType"] == "autocomplete"
                assert fields["性别"]["currentValue"] == "", "unchecked radio value is an option ID, not a selected value"
                assert not any(field["placeholder"] == "请输入职位或企业名称" for field in scan["fields"])
                assert len([field for field in scan["fields"] if field["label"] == "性别"]) == 1
                assert len([field for field in scan["fields"] if field["label"] == "毕业院校"]) == 1
                verify_page(page, extension_page, iguopin_url, [
                    ("姓名", "张三", "NAME"),
                    ("性别", "男", "GENDER"),
                    ("出生日期", "2001-06-01", "BIRTH_DATE"),
                    ("现居住地", "河北省秦皇岛市海港区", "LOCATION"),
                    ("户口所在地", "江西省南昌市进贤县", "LOCATION"),
                ])
                assert page.locator("#full_name").input_value() == "张三"
                assert page.locator(".ant-radio-button-input").first.is_checked()
                assert page.locator("#birthdate").get_attribute("data-committed") == "2001-06-01"
                assert "河北 / 秦皇岛 / 海港区" in page.locator(".cascader-modal-location .ant-select-selection-item").inner_text()
                assert "江西 / 南昌 / 进贤县" in page.locator(".cascader-modal-hukou .ant-select-selection-item").inner_text()

                dynamic_url = "http://127.0.0.1:8765/fixtures/dynamic-form.html"
                page.goto(dynamic_url)
                page.wait_for_load_state("networkidle")
                before = send_message(extension_page, dynamic_url, {"type": "ANALYZE"})
                await_profile = {
                    "basic": {"name": "测试用户"},
                    "education": [{"degree": "硕士", "major": "计算机科学与技术"}],
                }
                extension_page.evaluate("async p => chrome.storage.local.set({profile:p, fillHistory:[]})", await_profile)
                extension_page.reload()
                # The popup can also be opened as a normal extension tab. In that
                # case the orchestrator must select the adjacent web page.
                extension_page.bring_to_front()
                extension_page.get_by_role("button", name="一键智能填写", exact=False).click()
                extension_page.get_by_text("已验证 3 个，待确认 0 个，失败 0 个", exact=True).wait_for(timeout=15000)
                assert page.locator("#major").input_value() == "计算机科学与技术"
                assert page.locator("#name").input_value() == "测试用户"
                after = send_message(extension_page, dynamic_url, {"type": "ANALYZE"})
                old_ids = {f["label"]: f["id"] for f in before["fields"]}
                new_ids = {f["label"]: f["id"] for f in after["fields"]}
                assert all(new_ids[label] == field_id for label, field_id in old_ids.items())
                history = extension_page.evaluate("async () => (await chrome.storage.local.get('fillHistory')).fillHistory")
                assert len(history) == 1 and history[0]["filledCount"] == 3, history
            finally:
                context.close()


if __name__ == "__main__":
    main()
