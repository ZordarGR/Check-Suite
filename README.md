# Check-Suite

Tools for the nightly audit at Kernos Hotel.

## RecCheck — nightly receipt audit

Checks the physical POS receipts against the protel **checkcharge1** report (`.oxps`).
Everything is parsed locally on your machine — nothing is uploaded anywhere.

### ⬇ Install (Windows)

**[Download RecCheck-Setup.exe](https://github.com/ZordarGR/Check-Suite/releases/latest/download/RecCheck-Setup.exe)** — then open the downloaded file. That's all: it installs itself in a few seconds (no administrator password needed), puts **RecCheck** on your Desktop and in the Start Menu, and starts the app.

> If Windows shows a blue *"Windows protected your PC"* screen the first time, click **More info → Run anyway** — the app is simply unsigned, not harmful.

### Updates

The app checks this repository every time it opens. When a new version of the tool exists it downloads quietly in the background, and a **blue ↑ button** appears at the bottom-right — one click installs it and restarts the app. You never download the installer again.

### Uninstall

Windows Settings → Apps → RecCheck → Uninstall. Your saved work (check history, watchlist, room nicknames) is kept in case you reinstall.

### No-install fallback

[`Departments Check.html`](Departments%20Check.html) is the identical tool as a single HTML file — download it and open it in any browser.

### Features

Per-department receipt lists with per-day check state (OK / missing / corrections) · VOID detection for consolidated receipts · OPEN pill for departments that had not closed when the report was pulled · receipt search by serial number · watchlist with yellow highlighting for rooms that need a closer look · persistent room database with searchable nicknames that reset automatically when a room's guests change · printable Greek corrections sheet · parse self-verification against the report's own totals on every load.

### Repo layout

- `dist-win64/parts/` — the installer, chunked; a GitHub Action assembles it and publishes each release
- `app/` — application source (`index.html` is the tool itself, plus the Electron shell: `main.js`, `preload.js`, `updater.js`)
- `update/latest.json` — the auto-update manifest the installed app checks
- `Departments Check.html` — standalone browser version
