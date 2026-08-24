## RecCheck 1.13.0 — Windows

Nightly POS receipt audit for the protel checkcharge1 report (.oxps). Everything runs locally — no data leaves the machine.

### New in 1.13.0

**Test the τ shortcut, and find out why it fails.** Under *PROTEL SHORTCUTS* there is now a **Test the τ shortcut** button. Press it, click into protel, put the cursor where the τ should appear, and after a five-second countdown RecCheck runs the real shortcut and prints exactly what it observed: which window had focus, which thread owned it, what keyboard layout that thread was on, which Greek layout was loaded, whether it could attach to protel's input, and which of the layout-switch attempts succeeded or failed. There is a **Copy report** button next to it.

This exists because the shortcut can fail for reasons that are invisible from the outside — the report says which one, instead of leaving it at "nothing happened".

### Fixes

- **The layout check compared the wrong thing.** A keyboard layout handle is a device handle combined with a language id. The hop verified success by comparing whole handles, so if Windows handed back a Greek layout whose device handle differed from the one the target window ended up using — a second Greek layout, or one Windows had re-created — a hop that had genuinely worked was recorded as failed, and the shortcut fell back to inserting τ as plain text, which protel ignores. It now compares the language, which is the part that decides what the T key produces.
- **The layout request went to the wrong window.** It was always sent to the top-level window, but on a dialog-heavy program the window holding keyboard focus is a child control. The request now goes to the focused control first and to the top-level window second, and it waits slightly longer for an answer.

### Install

Download **RecCheck-Setup.exe** below (under *Assets*) and open it. It installs in a few seconds — no administrator password — and puts **RecCheck** on the Desktop and in the Start Menu. If an older RecCheck is running, the installer closes it and relaunches when done.

If Windows shows a blue *"Windows protected your PC"* screen: click **More info → Run anyway** (the app is unsigned, not harmful).

Existing installs update themselves: the app downloads this version in the background and offers it with the blue ↑ button — no reinstall by hand needed.
