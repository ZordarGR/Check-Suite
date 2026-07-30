# Check-Suite

Tools for the nightly audit at Kernos Hotel.

## REC CHECK

Nightly POS receipt audit against the protel **checkcharge1** report (`.oxps`).
Parses the report locally (nothing leaves the machine), lists room-charge receipts per
department, and tracks the check with per-day state: OK / missing / corrections, VOID
detection for consolidated receipts, an OPEN pill for departments that have not closed
yet, and a printable Greek corrections sheet.

### Get the Windows app

GitHub caps files at 100 MB, so the app zip is stored in two parts.

1. Click **Code → Download ZIP** (top right of this page) and extract it, or download the
   three files inside [`dist-win64/`](dist-win64/) individually.
2. Double-click **`JOIN-ME-FIRST.bat`** in `dist-win64/` — it joins the parts into
   `RecCheck-win64.zip`.
3. Right-click `RecCheck-win64.zip` → **Extract All**, open the folder, run **`RecCheck.exe`**.
   First run: Windows SmartScreen may warn about an unrecognized app → *More info → Run anyway*
   (the build is unsigned).

### Updates

The app checks `update/latest.json` in this repo on every launch. When a newer version of the
tool is available it downloads in the background (~70 KB — only the tool itself, never the
whole app) and a blue ↑ button appears at the bottom-right; clicking it installs the update
and restarts. Releases marked `"type": "full"` instead point the button at the release page
for a manual reinstall of the shell.

### No-install fallback

[`Departments Check.html`](Departments%20Check.html) is the identical tool as a single
HTML file — download it and open it in any browser.

### Repo layout

- `dist-win64/` — the packaged Windows app (split zip + join script)
- `app/` — the Electron app source (`index.html` is the tool itself, plus `main.js`,
  `package.json`, and the icon)
- `Departments Check.html` — standalone browser version
