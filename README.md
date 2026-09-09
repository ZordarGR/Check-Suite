# Pro-Check

**For protel setups that have been stuck in the '80s.**

Pro-Check runs beside protel on the night auditor's PC and does the things a hotel system should have been doing ages ago. It works from protel's own reports and the lists protel has already drawn on screen; it never touches protel's installation, its files or its data. protel is not ours to break, and the whole tool is built around that.

> No offence to protel. A little offence to protel.

## What it does

* **Department Check** — the nightly receipt audit against protel's `checkcharge1` report. Load the `.oxps`, search each paper serial, tick it. Corrections, manual entries and a printed sheet for reception come out the other end, and every load verifies its own parse against the report's totals.
* **STATUS** — arrivals, departures, in-house and moves for the night, read off protel's own lists the moment you open them. You open the window as you always did; the tool reads what protel drew. A dot marks the departing guest who has a receipt in the audit, anywhere in their stay.
* **REPORTS** — protel's Departure List and Boarding List printed in protel's own layout with the guest names cut out. Print the report to the XPS Writer, pick it, print it, done; the file goes to the Recycle Bin.
* **Shortcuts** — the τ jump to ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ, the invoice keystroke run, Alt+F4 for the receipt preview, Alt+N on the passport screen. Each on a mouse side button or a key combination, per person, and only while protel is in front. The τ is a real keypress under a real Greek layout, because protel ignores anything less.
* **Tax Check** — cross-references the rate list against the tax report, for the nights the main courante did not balance.
* **The small things** — a checklist with a desktop overlay, room nicknames that reset when the guests change, a watchlist, per-user profiles, and a Caps Lock indicator that keeps working with the app closed, because Caps Lock flips mid-passport and nothing else tells you.

Everything runs locally. Nothing is uploaded anywhere.

## Install (Windows)

**[Download Pro-Check-Setup.exe](https://github.com/ZordarGR/Check-Suite/releases/latest/download/Pro-Check-Setup.exe)** — then open the downloaded file. It installs itself in a few seconds (no administrator password), puts **Pro-Check** on your Desktop and in the Start Menu, and starts the app.

> If Windows shows a blue *"Windows protected your PC"* screen the first time, click **More info → Run anyway**. The app is unsigned, not harmful.

## Updates

The app checks this repository every time it opens. When a new version exists it downloads quietly in the background and a **blue ↑ button** appears at the bottom-right — one click installs it and restarts the app. You never download the installer again.

## Uninstall

Windows Settings → Apps → Pro-Check → Uninstall. Your saved work (check history, watchlist, room nicknames, shortcut profiles) is kept in case you reinstall.

## No-install fallback

[`Departments Check.html`](Departments%20Check.html) is the Department Check and the Tax Check as a single HTML file — download it and open it in any browser. STATUS, REPORTS and the shortcuts need Windows and the installed app.

## A note on the name

Until 1.17.62 this was RecCheck. Pro-Check says what it is for: *pro* as in protel, *check* as in the things it should have been checking on its own. Under the hood the executable, its folders and its registry entries are still called RecCheck, deliberately — a rename that moved your data would be exactly the kind of thing this tool exists to prevent.

## Repo layout

- `dist-win64/parts/` — the installer, chunked; a GitHub Action assembles it and publishes each release
- `app/` — application source (`index.html` is the tool itself, plus the Electron shell: `main.js`, `preload.js`, `updater.js`, and `tbind.cs`, the native helper behind the shortcuts and the list reads)
- `update/latest.json` — the auto-update manifest the installed app checks
- `Departments Check.html` — the standalone browser version, byte-identical to `app/index.html`

Made by ZordarGR, on the night shift, for the night shift.
