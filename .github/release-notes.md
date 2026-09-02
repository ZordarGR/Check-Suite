## RecCheck 1.17.13 — Windows

Nightly POS receipt audit for the protel checkcharge1 report (.oxps). Everything runs locally — no data leaves the machine.

### A room move is no longer counted as an arrival

protel prints a room move as a **new stay on the new room, dated today** — the row is identical to a genuine arrival in every column, so the report cannot tell them apart. On 01/09 that meant 29 arrivals where 26 people actually arrived.

Moves now get their own blue **MOVED** group in the movements panel. A room counts as a move when the same guest name, exactly, was in a *different* room the night before and is not still charging there. Two guards, both deliberate: one party spread across two adjoining rooms is not a move, and an ambiguous match moves nothing at all.

The room they came from stops claiming a departure it never had.

### Departures that have receipts carry a dot

A **·** on a DEPARTED pill means that room also appears in tonight's department check — the paper you can throw away. Live receipts only: cancelled and POS-reversed ones do not count.

### The τ is faster, and the millisecond box is gone

The log showed a τ press costing 0.9–1.7 seconds, of which the Enter delay was 10–20 ms. It was the one setting with no effect on anything, sitting in front of you while the three that cost real time were hardcoded. Those are fixed now: a 150 ms wait that never once observed what it was waiting for is down to 30, and the layout switch is checked four times as often. The Enter itself still happens, and can still be turned off.

### The shortcuts dialog uses the window

It was a 420-pixel strip with a scrollbar no matter how wide your screen was. It now flows into columns like the checklist does.

### The movement memory can be started again

If the room movements panel is ever wrong, *PROTEL SHORTCUTS → Room movements memory → Start it again* clears it. The next rate list rebuilds it from what protel prints. Until now there was no way back.

### Install

Download **RecCheck-Setup.exe** below (under *Assets*) and open it. It installs in a few seconds — no administrator password — and puts **RecCheck** on the Desktop and in the Start Menu. If an older RecCheck is running, the installer closes it and relaunches when done.

If Windows shows a blue *"Windows protected your PC"* screen: click **More info → Run anyway** (the app is unsigned, not harmful).

Existing installs update themselves: the app downloads this version in the background and offers it with the blue ↑ button — no reinstall by hand needed.
