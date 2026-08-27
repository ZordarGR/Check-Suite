## RecCheck 1.17.0 — Windows

Nightly POS receipt audit for the protel checkcharge1 report (.oxps). Everything runs locally — no data leaves the machine.

### The τ now records what it actually did

The shortcut fails now and then — one invoice goes through, the next needs two presses — and every diagnostic run has come back clean, because *Test the τ shortcut* runs it against an idle protel, which is the one state it never fails in.

So every real press now writes down what it did: which window it found, whether the layout hop landed, how long protel took to take the key, whether the layout came back, and how long the whole thing took. **PROTEL SHORTCUTS → What the last presses did** shows the last few, newest first, with a copy button.

If it misbehaves again, that report says which step went wrong instead of leaving it to guesswork.

### Two changes while waiting for it

**It waits far longer for protel to take the key.** A protel still drawing the preview of the invoice just printed can leave the keystroke queued for the best part of a second, and the moment the helper stopped waiting the keyboard went back to English and that key became a Latin `t`. Waiting only ever makes the shortcut slower; not waiting makes it wrong.

**It will not leave the keyboard on Greek.** If every polite way of putting the layout back has failed, it now cycles the Windows layout switcher directly until it is back, because that needs nothing from protel. Being left on Greek is the worst thing this shortcut can do to a night.

One thing the record will also show: a second press made while the first is still running queues behind it rather than doing nothing, and how long it waited is printed. From the desk that looks exactly like "it didn't work the first time".

### Install

Download **RecCheck-Setup.exe** below (under *Assets*) and open it. It installs in a few seconds — no administrator password — and puts **RecCheck** on the Desktop and in the Start Menu. If an older RecCheck is running, the installer closes it and relaunches when done.

If Windows shows a blue *"Windows protected your PC"* screen: click **More info → Run anyway** (the app is unsigned, not harmful).

Existing installs update themselves: the app downloads this version in the background and offers it with the blue ↑ button — no reinstall by hand needed.
