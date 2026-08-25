## RecCheck 1.15.0 — Windows

Nightly POS receipt audit for the protel checkcharge1 report (.oxps). Everything runs locally — no data leaves the machine.

### The τ shortcut

**It no longer asks protel to change the keyboard layout — it changes it the way you would.** If the active window is already on Greek, the shortcut simply presses T and changes nothing. Otherwise it does Win+Space, presses T, and Win+Space back.

Every previous version asked the application itself to switch layouts, and protel is exactly the application that will not. Win+Space is handled by Windows, so it needs no cooperation. The layout switcher flashes briefly — that is the shell doing the work.

**It can no longer leave your keyboard stuck on Greek.** The old fallback posted a layout request that could not be recalled, then stopped waiting after 90 ms. When protel was busy and processed it late, the layout flipped with nothing left to undo it — no τ *and* a stranded keyboard, from one press, which is why it looked intermittent. That path is gone on the way to Greek, and the restore now runs whether or not the switch was confirmed, then re-checks that the layout stayed put.

### New

**A fixed keystroke run.** Under *PROTEL SHORTCUTS* you can bind **Enter · Enter · → · Enter · Enter** to a button — the whole run on one press instead of five, with a 25 ms pause between keys so nothing outruns the dialog. The run is stored as settings rather than built into the program, so it can be adjusted later without reinstalling.

**Modifier + button binds.** A trigger can now be `Ctrl`, `Alt` or `Shift` together with a mouse button, so `Shift + side button` and the plain side button can drive different shortcuts. Existing bindings keep working exactly as they were.

**The Test button is back.** *PROTEL SHORTCUTS → Test the τ shortcut* reports every step of what the shortcut did, with a copy button — useful if it ever misbehaves again.

### Fixes

- **The overlay's "all done" reminder could not appear.** If the app started, or updated, on a night whose tasks were already finished, the overlay never put itself away — so asking for it back did nothing instead of saying the night was done. Being put away now follows from the list being complete, however that came about; the animation still needs to be watched happening.

### Install

Download **RecCheck-Setup.exe** below (under *Assets*) and open it. It installs in a few seconds — no administrator password — and puts **RecCheck** on the Desktop and in the Start Menu. If an older RecCheck is running, the installer closes it and relaunches when done.

If Windows shows a blue *"Windows protected your PC"* screen: click **More info → Run anyway** (the app is unsigned, not harmful).

Existing installs update themselves: the app downloads this version in the background and offers it with the blue ↑ button — no reinstall by hand needed.
