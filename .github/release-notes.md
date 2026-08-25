## RecCheck 1.16.0 — Windows

Nightly POS receipt audit for the protel checkcharge1 report (.oxps). Everything runs locally — no data leaves the machine.

### Fix — shortcuts could not be bound in 1.15.0

**Please install this if you are on 1.15.0.** Binding any mouse button stored a value the helper could not read, so the shortcut did nothing — and because setting it also replaced whatever was there before, a binding that had been working was lost at the same time. Both halves of that change shipped in 1.15.0; only one of them had been updated.

Setting a binding now stores it correctly, a binding that cannot be read is refused rather than saved over a working one, and any bad value already in your settings is cleared on first run so the row simply reads *not set* and can be bound again.

You will need to set your bindings once more after updating.

### Switch user

Profiles have moved out of *PROTEL SHORTCUTS* into their own **Switch user** button on the home screen, to the right of the checklist. They are a different kind of thing: the shortcuts menu is *what the buttons do*, a profile is *who is sitting here*.

The button opens the list of profiles with create, rename and delete. Resting the pointer on it for a second explains why profiles matter — that bindings belong to the profile rather than to the computer, so it is worth each person making their own and setting it up the way they work. It only appears after a full second, so it never flickers open in passing.

The shortcuts menu now simply states which profile it is editing.

### Install

Download **RecCheck-Setup.exe** below (under *Assets*) and open it. It installs in a few seconds — no administrator password — and puts **RecCheck** on the Desktop and in the Start Menu. If an older RecCheck is running, the installer closes it and relaunches when done.

If Windows shows a blue *"Windows protected your PC"* screen: click **More info → Run anyway** (the app is unsigned, not harmful).

Existing installs update themselves: the app downloads this version in the background and offers it with the blue ↑ button — no reinstall by hand needed.
