# Autofill fixtures

1. Run `npm run build` and load `dist/` as an unpacked extension.
2. Serve the repository with `python3 -m http.server 8765`.
3. Open `http://127.0.0.1:8765/fixtures/mixed-form.html` (or an individual fixture).

The fixtures use a plain static server because Vite's CRX inline-script transform is for extension entry modules and does not execute arbitrary HTML fixture inline scripts.
4. In the extension popup, save a Profile containing name, phone, email and one education record, then click `一键智能填写`.

Automated checks:

- `npm test` runs matching and fixture checks;
- `npm run test:extension` builds `dist/`, loads the MV3 extension in Chromium, and exercises `ANALYZE → FILL_BATCH → VERIFY_BATCH` against the mixed and custom-date fixtures.

Expected observations:

- native fields and matching native options become green only after verification;
- autocomplete waits for the delayed option and requires the hidden `schoolId` to be committed;
- date inputs accept the Profile date format;
- custom date pickers select an already-rendered month candidate;
- the cascader and human-gate fields stay yellow for review;
- a non-empty page field is not overwritten.
