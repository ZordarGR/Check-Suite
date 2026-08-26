## RecCheck 1.16.5 — Windows

Nightly POS receipt audit for the protel checkcharge1 report (.oxps). Everything runs locally — no data leaves the machine.

### Fix — the τ needing two presses when the keyboard is on English

The layout part was never the problem. A diagnostic run showed every step of it working: Win+Space reached Greek on the first press, the T went out under the Greek layout, and the keyboard was put back on English and verified. And still the τ often did not arrive until the second press.

The fault is in the moment *after* the key is sent. The helper is supposed to wait for protel to take the key before switching the layout back, and it checked whether the key had gone with no delay at all — a fraction of a millisecond after sending it. `SendInput` hands a key to Windows' input thread rather than dropping it straight into protel's queue, so at that instant the queue is empty because the key **has not arrived yet**, not because it has been used. The helper read that as "done", switched back to English immediately, and protel then read the key under the English layout: a plain `t`.

Whether the τ survived came down to which won the race. That is why it was intermittent, why a second press usually worked, and why it never happened with the keyboard already on Greek — that path does not switch the layout at all, so there is no race to lose.

The helper now waits for the key to actually **arrive**, then for protel to **take** it, and then a moment longer, because protel's list is an embedded browser control that passes the key on once more before deciding which character it is. Typically ~50 ms; the shortcut still feels immediate.

The diagnostic (*Test the τ shortcut*) now reports how long each of those took, so if anything is still off the report says which part.

### Install

Download **RecCheck-Setup.exe** below (under *Assets*) and open it. It installs in a few seconds — no administrator password — and puts **RecCheck** on the Desktop and in the Start Menu. If an older RecCheck is running, the installer closes it and relaunches when done.

If Windows shows a blue *"Windows protected your PC"* screen: click **More info → Run anyway** (the app is unsigned, not harmful).

Existing installs update themselves: the app downloads this version in the background and offers it with the blue ↑ button — no reinstall by hand needed.
