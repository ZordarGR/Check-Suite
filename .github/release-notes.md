## RecCheck 1.16.1 — Windows

Nightly POS receipt audit for the protel checkcharge1 report (.oxps). Everything runs locally — no data leaves the machine.

### Fix — side buttons that go through mouse software were being ignored

**Please install this if your shortcuts stopped working.**

The helper that watches for your bound button was discarding any button press that arrives flagged as *injected*. That flag is exactly how mouse software — G HUB, Synapse, an OEM driver — delivers a remapped side button. So on a mouse whose side buttons are routed through its own software, the press was thrown away before anything looked at it: nothing happened when you pressed it, and nothing was detected when you tried to bind it either.

That filter was there to stop the helper reacting to its own output. It never needed to be: the helper only ever sends *keyboard* input, never mouse input, so there was no loop to guard against. It is gone from the mouse side and kept on the keyboard side, where the loop is real.

It also explains why this could differ from one night to the next — the house mouse and your own need not deliver their side buttons the same way.

### The shortcuts menu now says why it is not working

Every way this could fail used to end the same way: a row reading *not set*, and no explanation. Four different causes, one symptom, nothing to go on.

*PROTEL SHORTCUTS* now shows a status line, and it names the cause:

- **Running** — your bindings are live.
- **Ready, nothing bound yet** — no process exists because nothing needs one. This is normal, not a fault.
- **The helper file is not on this computer** — reinstall; if it goes missing again, security software is removing it.
- **Windows will not start the helper** — antivirus or a workplace policy is blocking it.
- **It starts and is shut straight back down** — it ran, and was refused the keyboard and mouse access the shortcuts are built on.

The raw detail is printed underneath so it can be copied or photographed if it needs sending on.

If you were wondering why *rc-tbind* was not in Task Manager: it deliberately does not start when nothing is bound, and 1.16.0 had just cleared the bindings that 1.15.0 corrupted. That was the expected state, not a second fault.

### The keystroke run is gone

The fixed *Enter, Enter, Right, Enter, Enter* run has been removed from the menu, as asked.

### Install

Download **RecCheck-Setup.exe** below (under *Assets*) and open it. It installs in a few seconds — no administrator password — and puts **RecCheck** on the Desktop and in the Start Menu. If an older RecCheck is running, the installer closes it and relaunches when done.

If Windows shows a blue *"Windows protected your PC"* screen: click **More info → Run anyway** (the app is unsigned, not harmful).

Existing installs update themselves: the app downloads this version in the background and offers it with the blue ↑ button — no reinstall by hand needed.
