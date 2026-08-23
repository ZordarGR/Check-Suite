## RecCheck 1.11.6 — Windows

Nightly POS receipt audit for the protel checkcharge1 report (.oxps). Everything runs locally — no data leaves the machine.

### New in 1.11.6

**Fix — the T.A Selection Shortcut could type a plain English `t`.** The shortcut works by hopping the active window to the Greek layout, pressing the T key, and hopping back. Until now it asked for the layout change, waited a fixed 90 ms, and pressed T without ever checking whether the change had actually happened. In an app that was slow to react, the keystroke arrived while the English layout was still active and came out as `t` instead of `τ` — so the keyboard had to be left on Greek for the shortcut to be reliable.

The hop is now synchronous and verified:

- The layout request is **sent** rather than posted, so it returns once the target window has processed it. The τ lands in single-digit milliseconds instead of ~180 ms.
- Every hop is **confirmed** against the target window's actual layout before the T key is pressed. If the window ignored the request, the helper attaches to its input thread and switches the layout directly; failing that it falls back to the old ask-and-wait, and only as a last resort types τ as a plain character.
- **T is never pressed under an unconfirmed layout**, which is what removes the stray `t` entirely.
- The hop back now waits for the keystroke to be consumed first — restoring the layout too early would turn the τ back into a `t` in flight.

The mouse hook, the watchdog, and the way buttons are detected and bound are unchanged from 1.11.5.

### Install

Download **RecCheck-Setup.exe** below (under *Assets*) and open it. It installs in a few seconds — no administrator password — and puts **RecCheck** on the Desktop and in the Start Menu. If an older RecCheck is running, the installer closes it and relaunches when done.

If Windows shows a blue *"Windows protected your PC"* screen: click **More info → Run anyway** (the app is unsigned, not harmful).

Existing installs update themselves: the app downloads this version in the background and offers it with the blue ↑ button — no reinstall by hand needed.
