## RecCheck 1.17.10 — Windows

Nightly POS receipt audit for the protel checkcharge1 report (.oxps). Everything runs locally — no data leaves the machine.

### Caps Lock on screen

This keyboard has no Caps Lock light and the PC draws nothing of its own, so the state could flip silently in the middle of a passport entry and only show up in the typing.

Now the moment it changes, the icon flashes in the **middle of the screen** — the same **A** the laptops draw, struck through when it goes off — at 35% opacity for a second and a half, then it is gone. Nothing sits on screen the rest of the time.

It has its own window, so it is there whether or not the checklist overlay is up, and it stays after the night's tasks are ticked and the overlay puts itself away.

**It can be switched off** in *PROTEL SHORTCUTS*. That switch matters: seeing the key requires the helper's keyboard hook, which was not installed before on a mouse-only set of shortcuts. It passes every key straight through and swallows nothing, but turning this off takes it back out rather than leaving it there with nothing to do.

Nothing is written to protel, nothing is read from it, and no key other than Caps Lock is looked at.

### Install

Download **RecCheck-Setup.exe** below (under *Assets*) and open it. It installs in a few seconds — no administrator password — and puts **RecCheck** on the Desktop and in the Start Menu. If an older RecCheck is running, the installer closes it and relaunches when done.

If Windows shows a blue *"Windows protected your PC"* screen: click **More info → Run anyway** (the app is unsigned, not harmful).

Existing installs update themselves: the app downloads this version in the background and offers it with the blue ↑ button — no reinstall by hand needed.
