# Harnesses

Every one of these drives the **shipped** code — lifted out of `app/index.html`,
`app/main.js` or `rc-tbind.exe` by text or by reflection, never retyped. A test that
retypes the logic proves only that the copy works.

Run the ones that need nothing but node:

    sh test/run.sh

| | what it holds the line on |
|---|---|
| `scopecheck.js` | every call in the moves functions resolves to something declared. A silent `ReferenceError` inside a `stage()` looks exactly like "there was nothing to draw" — this is how the movements panel was dark for two versions |
| `status.js` | the STATUS store, through the shipped writer and marks: each list kept for the day as the union of its captures; an arrival gone from the arrival list is nothing until the in-house list shows the same name and room with CI; a departure gone from the departure list is nothing until a COMPLETE in-house list captured afterwards does not show it — a cut-short one proves nothing; `414` and `414-15` are one room; the pills come from the store and from nothing else — three groups since 1.17.46, ARRIVALS · DEPARTURES · MOVES, a room on two lists on both, a move pill reading `old → new` — and the dot lands on a departure or move pill only for that reservation's own name: equal, or the receipt's cut name opening it, unless another name on that room opens the same way (5c) — over the whole stay since 1.17.44, from the room+name pairs each loaded report leaves behind by night; with legacy ON the XPS-fed ledger draws them instead, as before 1.17.42 |
| `movespanel.js` | `renderMoves` over a DOM shim, the night built through `statusIngest`: all four pill kinds, the receipts dot only on a departure whose **name** matches, and a ledger entry alone drawing nothing |
| `pills0209.js` | the night of 02/09 rebuilt from his DEBUG dump — a name change must never draw a departure; since 1.17.42 the ledger draws nothing at all, and the two real departures come from the departure list |
| `report.js` | the DEBUG report prints the STATUS store's view of the night first — the pills' source — then the ledger's own, labelled as such, with **every** pill the ledger would draw and the rate list that wrote it, the stale ones flagged |
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
| `helperline.js` | the DEBUG helper line end to end, through the real `main.js`: the press asks `status`, which LOOKS FOR the resident's window, and the verdict is built on that answer — not on the state written at spawn time, which said "running" for a helper that died 53 ms in. The exe's version is labelled `exe=`; since helper v28 `status` prints the RESIDENT's version as a fourth field and the line says `helper=vNN` (or `helper=pre-v28`) only when that field arrived; a binds file that could not be written is not listed as published; a spawn Windows refuses is a state, not an uncaught exception |
| `spoolcap.js` | stage 1 of the redacted print: the spool watcher in `main.js`, over a fake spool folder. Nothing is listed or copied unless armed; a job that grows is copied at every size seen and the final copy is the whole file; a job the spooler took away is said to be gone, with how long it lived; a read the spooler refuses is counted with its code and asked for again, never thrown; the text comes out of NT EMF (EXTTEXTOUTW, SMALLTEXTOUT, GDI+ comments counted) and out of XPS (stored and deflated pages, numeric page order, entities); the job-info strings at both alignments; the window ends and the polling with it; eight jobs kept on disk, oldest first; a copy from an earlier run is listed; a folder that cannot be listed ends the window and says why |
| `xpsdump.js` | the DEBUG dump of the newest XPS in the reports folder — every token of every page with its position, through the shipped tokenizer: sorted by line then column, a column gap splitting a run, entities decoded. What he pastes for the redacted print's column map is what this prints |
| `reports.js` | the redacted departures print: the Departure List by Time parser over a page laid out exactly like his 06/09/26 file (names replaced), and the sheet. The columns come from the file's own heading line; the room type beside the number is read apart; the groups carry their time, the first one none; a note under a room is kept and the fragment protel prints in the guest column beside it is withheld; the totals are read; the sheet carries no guest name and no fragment, and everything else; a checkcharge page is not a departure list; the file-delete door removes only a report file inside the reports folder, to the Recycle Bin |
| `browser/movesfit.js` | the movements panel's pills fit the cells they are drawn in — real Chromium, the store through the real ingest. The panel is 250px and its grid was five to a line, a 38px cell cut for a room number; a move pill reading `old → new` wrapped into a two-line pill 40px tall beside 26px departures, and every harness passed because the DOM shims have no layout and the screen sweep only asks whether the page side-scrolls. Every pill on one line, inside its cell, no taller than its group, inside the panel, and a move pill cyan |
| `evflow.js` | the helper's capture path — `WinEventCallback` and `EvServiceReads` — compiled from the shipped `tbind.cs` with the three user32 calls, the reader, the writer, the log and the clock replaced by recorders, and driven under Mono. A shown-empty report is read again once it restates; an open inside the cooldown waits; a restatement of a taken caption is not re-read; a real open (SHOW) is; a Static never arms anything. Skips itself where there is no mcs |
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
ledger without moving him off the screen he is on. Since 1.17.41 it drives the STATUS
screen too — every list as captured, a refused one with its reason, the third home button
— and pins which clock stamps a report: the census's date when one is held, the tool's
night before that. Since 1.17.42 STATUS is four submenus — Arrivals, Departures, In-house,
Moves — and case 18 drives each: the sub-lines, the list screen, an arrival checked in only
by the in-house list, a departure checked out only by absence from a complete one, a row
gone from its list said as gone and nothing more, a cut-short read proving nothing, and
back to the submenus and home. Case 17 pins the department check's panel drawing from a
capture — the pills' source now — while he is on another screen. Case 20 (1.17.43) pins the
search cards: a departure list captured mid-search marks the departing guest's card red
without retyping, and a capture that changes nothing for the cards leaves the same nodes.

`h-sweep.html` carries TWO probes: `window.__t` for the app scope and `window.__tx` for the
tax scope. The two <script> blocks share nothing, so a guard in one cannot be reached from
the other — `__tx` exists because the check that the automatic read leaves his pairing
decision alone is not testable from outside that scope.

`fresh.js` makes that impossible to forget: `h-sweep.html` carries a sha256 of the page it
was built from and every browser harness refuses to run when it does not match. It exists
because a stale copy passed three times in one night while proving nothing.

**Regenerate `h-sweep.html` after every change to `index.html`** — it is a copy, and a
stale one tests the wrong page.
