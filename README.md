# Check-Suite

Tools for the nightly audit at Kernos Hotel.

## REC CHECK

Nightly POS receipt audit against the protel **checkcharge1** report (`.oxps`).
Parses the report locally (nothing leaves the machine), lists room-charge receipts per department,
and tracks the check with per-day state: OK / missing / corrections, VOID detection for
consolidated receipts, an OPEN pill for departments that have not closed yet, and a printable
Greek corrections sheet.

**Download:** grab `RecCheck-win64.zip` from the [latest release](../../releases/latest) — unzip, run `RecCheck.exe`.
`Departments.Check.html` in the same release is the identical tool as a single HTML file for any browser.
