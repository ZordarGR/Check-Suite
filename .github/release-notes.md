## RecCheck 1.17.3 — Windows

Nightly POS receipt audit for the protel checkcharge1 report (.oxps). Everything runs locally — no data leaves the machine.

### The τ presses its own Enter

The shortcut that "needed two presses" was never failing. The τ goes in, protel takes a moment to react to it, and the Enter that always follows gets there first and is lost. Pressing it again worked because by then protel had caught up.

The invoice shortcut never had this problem, and that is the giveaway — it is a run of keys the helper times itself, so protel is never rushed. The τ now works the same way: it waits 100 ms after the layout is back and presses the Enter for you.

*PROTEL SHORTCUTS* has a checkbox for it, on by default. Turn it off and the τ goes back to being just the τ.

### Install

Download **RecCheck-Setup.exe** below (under *Assets*) and open it. It installs in a few seconds — no administrator password — and puts **RecCheck** on the Desktop and in the Start Menu. If an older RecCheck is running, the installer closes it and relaunches when done.

If Windows shows a blue *"Windows protected your PC"* screen: click **More info → Run anyway** (the app is unsigned, not harmful).

Existing installs update themselves: the app downloads this version in the background and offers it with the blue ↑ button — no reinstall by hand needed.
