## RecCheck 1.11.5 — Windows

Nightly POS receipt audit for the protel checkcharge1 report (.oxps). Everything runs locally — no data leaves the machine.

### New in 1.11.5

**T.A Selection Shortcut:** under *Customize overlay* you can bind a mouse button (middle or a side button) so that pressing it delivers a real **Greek τ keypress** — anywhere in Windows, protel included, no matter which keyboard language is active. If the active window is on another layout, the helper hops it to Greek for the keystroke and hops it right back, so programs that listen for the key itself (like protel's selections) react correctly. Click the row, press the button you want, done. The bound button is reserved while RecCheck runs; the ✕ next to the row releases it. (A 7 KB helper installed with the app does the listening and typing locally.)

**Fix — mouse lock-up with the T.A Selection Shortcut:** binding a button in 1.11.2 could throttle mouse clicks outside the app until the helper was killed. The helper was rebuilt: the mouse hook now does nothing but classify events, the τ keystroke is produced outside the hook, and an independent watchdog closes the helper with RecCheck. The app and the installer also clean up any stray helper from the previous version automatically.

**Self-healing updates:** the updater now knows which engine a tool update needs. If an install's engine is too old for the latest tool version, it automatically fetches the full installer instead — an out-of-date install can no longer get stuck behind a lightweight update.

### Install

Download **RecCheck-Setup.exe** below (under *Assets*) and open it. It installs in a few seconds — no administrator password — and puts **RecCheck** on the Desktop and in the Start Menu. If an older RecCheck is running, the installer closes it and relaunches when done.

If Windows shows a blue *"Windows protected your PC"* screen: click **More info → Run anyway** (the app is unsigned, not harmful).

Existing installs update themselves: the app downloads this version in the background and offers it with the blue ↑ button — no reinstall by hand needed.
