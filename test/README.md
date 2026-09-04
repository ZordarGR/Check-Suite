# Harnesses

Every one of these drives the **shipped** code — lifted out of `app/index.html`,
`app/main.js` or `rc-tbind.exe` by text or by reflection, never retyped. A test that
retypes the logic proves only that the copy works.

Run the ones that need nothing but node:

    sh test/run.sh

| | what it holds the line on |
|---|---|
| `scopecheck.js` | every call in the moves functions resolves to something declared. A silent `ReferenceError` inside a `stage()` looks exactly like "there was nothing to draw" — this is how the movements panel was dark for two versions |
| `movespanel.js` | `renderMoves` over a DOM shim: all four pill kinds, and the receipts dot only on a departure whose **name** matches |
| `pills0209.js` | the night of 02/09 rebuilt from his DEBUG dump — a name change must never draw a departure |
| `report.js` | the DEBUG report lists **every** pill with the rate list that wrote it, and flags the stale ones |
| `poison.js` | one reservation printed `31/12/99` must not delete the ledger |
| `names.js` | a charge takes its room's name; a nickname still overrides; the printed name survives on the tooltip |
| `nighttest.js` | the working night turns at 03:30, the shift at 07:00, and the upgrade never wipes a tick mid-shift |
| `dst.js` | both boundaries across Greece's real DST transitions — fails on absolute-time arithmetic |
| `lvitem.cs` | the LVITEM the list control reads, laid out for the **target's** bitness. Get an offset wrong and the read silently returns nothing, which looks exactly like "protel will not allow it" |
| `stdout.js` | the helper's output reaches RecCheck as bytes. Greek guest names are the first non-ASCII thing to cross that pipe — this splits one mid-character across two chunks and checks it survives |
| `quiet.js` | the real `main.js` with electron stubbed: the 07:00 reset must not summon the overlay |

## Browser harnesses

`test/browser/` needs `playwright-core` and the Chromium at `/opt/pw-browsers`. First:

    node test/harness.js        # regenerate browser/h-sweep.html from the current page

Then `sweep.js` (every dialog at six window widths), `taxsweep.js` (every screen),
`legacy.js`, `ledger.js`, `dbgshot.js`, `optshot.js`.

**Regenerate `h-sweep.html` after every change to `index.html`** — it is a copy, and a
stale one tests the wrong page.
