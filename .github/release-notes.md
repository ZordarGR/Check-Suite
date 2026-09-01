## RecCheck 1.17.11 — Windows

Nightly POS receipt audit for the protel checkcharge1 report (.oxps). Everything runs locally — no data leaves the machine.

### The helper stands on its own

`rc-tbind.exe` used to be a child of RecCheck: it started when you opened the app and died with it. It does not any more. It starts with Windows and keeps running with RecCheck closed.

**Caps Lock, always.** This keyboard has no Caps Lock light and the PC draws no on-screen notice, so the state could flip silently in the middle of a passport entry. Now the icon — the same **A** the laptops draw, struck through when it goes off — flashes in the middle of the screen at 35% for a second and a half, whether or not RecCheck is open. It has to run at login for that, which is what changed here.

**protel's shortcuts still belong to RecCheck.** They fire only while RecCheck is running, and the helper works that out from your machine rather than being told. The **mouse hook goes in only while RecCheck is up and comes straight back out when you close it** — so a PC with RecCheck closed carries no mouse hook at all, exactly the scope it had when RecCheck started the helper itself.

**It can be switched off** in *PROTEL SHORTCUTS* → *Start with Windows*. Off means the helper only runs while RecCheck is open, and nothing starts at login. Uninstalling RecCheck removes the login entry too.

Your bindings now travel in a small file the helper re-reads when it changes, instead of on its command line — changing a shortcut in the app takes effect without restarting anything.

Nothing is written to protel and nothing is read from it.

### Install

Download **RecCheck-Setup.exe** below (under *Assets*) and open it. It installs in a few seconds — no administrator password — and puts **RecCheck** on the Desktop and in the Start Menu. If an older RecCheck is running, the installer closes it and relaunches when done.

If Windows shows a blue *"Windows protected your PC"* screen: click **More info → Run anyway** (the app is unsigned, not harmful).

Existing installs update themselves: the app downloads this version in the background and offers it with the blue ↑ button — no reinstall by hand needed.
