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
| `moves.js` | recording a move that has already happened. Only rows protel has marked with its X, never a stay invented, and `mv` must never become a departure — protel did not call it one |
| `reports.js` | the arrival and departure reports feeding the ledger. Each carries only ONE of the two dates — the other is the report's own — and the writer must never touch a room its rows do not name, because saveMoves and detectMoves reason from absence and a 30-row report would read as 170 people leaving |
| `alerts.js` | the alerts store: the same missing X seen again by a read that never stops must be the SAME alert, read is not resolved, resolving removes entirely, and broken storage loads as empty rather than throwing |
| `roomsfile.js` | the room database on disk, through the real main.js handlers: a Greek name round-tripping byte for byte, the file not readable by opening it, every failure returning null rather than throwing, and no half-written file left beside it |
| `splash.cs` | the installation overlay's geometry: the icon centred in the ring, the ring inside the window, the palette the update button's. The drawing needs Windows; where it is placed does not, and both ways of getting it wrong are silent until it is on his screen mid-install |
| `stdout.js` | the helper's output reaches RecCheck as bytes. Greek guest names are the first non-ASCII thing to cross that pipe — this splits one mid-character across two chunks and checks it survives |
| `quiet.js` | the real `main.js` with electron stubbed: the 07:00 reset must not summon the overlay |
| `inhouse.js` | the live in-house read, his five real rows verbatim, through the shipped `inhouseToRate` and then the shipped `saveMoves`. Also which captions may become data at all: the bare frame caption he actually got on 04/09 must not |
| `helperline.js` | the DEBUG helper line end to end, through the real `main.js`: the press asks `status`, which LOOKS FOR the resident's window, and the verdict is built on that answer — not on the state written at spawn time, which said "running" for a helper that died 53 ms in. The version is labelled `exe=`, because that is whose it is; a binds file that could not be written is not listed as published; a spawn Windows refuses is a state, not an uncaught exception |
| `watchlog.js` | which nothing it is: the watch log and the four capture files, read through the real `main.js` handlers — no folder, no file, blank, unreadable, too old and fresh each come back as themselves, so the screen can never turn the tool's own failure into a statement about protel |

## Browser harnesses

`test/browser/` needs `playwright-core` and the Chromium at `/opt/pw-browsers`. First:

    node test/harness.js        # regenerate browser/h-sweep.html from the current page

Then `sweep.js` (every dialog at six window widths), `taxsweep.js` (every screen),
`legacy.js`, `ledger.js`, `live.js`, `alerts.js`, `dbgshot.js`, `optshot.js`.

`live.js` is the one to keep honest: it drives the shipped capture loop with a stubbed
bridge and requires that a list whose caption does not name it writes **nothing** to the
ledger. It also pins the line under the Tax Check: a capture the ingest refused is
named as *not taken*, a capture file the tool could not read is said as that and not as
protel having opened nothing, and the movements panel redraws when a capture writes the
ledger without moving him off the screen he is on.

`h-sweep.html` carries TWO probes: `window.__t` for the app scope and `window.__tx` for the
tax scope. The two <script> blocks share nothing, so a guard in one cannot be reached from
the other — `__tx` exists because the check that the automatic read leaves his pairing
decision alone is not testable from outside that scope.

`fresh.js` makes that impossible to forget: `h-sweep.html` carries a sha256 of the page it
was built from and every browser harness refuses to run when it does not match. It exists
because a stale copy passed three times in one night while proving nothing.

**Regenerate `h-sweep.html` after every change to `index.html`** — it is a copy, and a
stale one tests the wrong page.
