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
| `livenames.js` | the protel names meeting the .oxps ingest. An uncut name and its truncation are the same guest — read as a turnover it would mark every room movedOn, delete every nickname, fire the watchlist and overwrite the good name with the cut one, all on one report load |
| `roomsfile.js` | the room database on disk, through the real main.js handlers: a Greek name round-tripping byte for byte, the file not readable by opening it, every failure returning null rather than throwing, and no half-written file left beside it |
| `splash.cs` | the installation overlay's geometry: the icon centred in the ring, the ring inside the window, the palette the update button's. The drawing needs Windows; where it is placed does not, and both ways of getting it wrong are silent until it is on his screen mid-install |
| `stdout.js` | the helper's output reaches RecCheck as bytes. Greek guest names are the first non-ASCII thing to cross that pipe — this splits one mid-character across two chunks and checks it survives |
| `quiet.js` | the real `main.js` with electron stubbed: the 07:00 reset must not summon the overlay |
| `inhouse.js` | the live in-house read, his five real rows verbatim, through the shipped `inhouseToRate` and then the shipped `saveMoves`. Also which captions may become data at all: the bare frame caption he actually got on 04/09 must not |

## Browser harnesses

`test/browser/` needs `playwright-core` and the Chromium at `/opt/pw-browsers`. First:

    node test/harness.js        # regenerate browser/h-sweep.html from the current page

Then `sweep.js` (every dialog at six window widths), `taxsweep.js` (every screen),
`legacy.js`, `ledger.js`, `live.js`, `dbgshot.js`, `optshot.js`.

`live.js` is the one to keep honest: it presses the shipped *Read the in-house list*
button with a stubbed bridge and requires that a list whose caption does not name it
writes **nothing** to the ledger.

**Regenerate `h-sweep.html` after every change to `index.html`** — it is a copy, and a
stale one tests the wrong page.
