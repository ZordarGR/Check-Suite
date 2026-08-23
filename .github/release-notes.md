## RecCheck 1.12.0 — Windows

Nightly POS receipt audit for the protel checkcharge1 report (.oxps). Everything runs locally — no data leaves the machine.

### New in 1.12.0

**Protel Shortcuts — its own menu.** The keybinding setup has moved out of *Customize overlay* (where it never belonged) into a **PROTEL SHORTCUTS** button on the home screen. Each shortcut now explains what it sends and *why it matters*, so anyone covering a shift can read the screen instead of being told.

**Alt + F4 can be bound.** Closes the receipt preview that pops up after every invoice is generated — one button instead of reaching for the mouse and finding the ✕ each time. It is sent as a real Alt+F4; any modifier you happen to be holding is released first so the combination arrives clean.

**Any key can be bound, not just a mouse button.** Side buttons are still the fastest option, but a keyboard combination such as `Ctrl+Alt+T` now works just as well — so colleagues without a multi-button mouse can work at the same speed. A warning appears if you bind a bare key, because that key is then swallowed everywhere in Windows while RecCheck is running.

**Profiles.** Create, rename and delete profiles freely; each keeps its own bindings, so handing the machine to whoever is covering your night off no longer means losing your setup. The home screen greets the active profile by name. Your existing binding is carried over automatically into a first profile.

**Home screen tidy-up.** The greeting now lives in the title, so the line underneath just states the working night and the clock.

### Fixes

- **The updater could get stuck checking forever.** If an update was already waiting, an early return left the "checking" flag raised and every later check — automatic or from the tray — was silently ignored until the app restarted.
- **A vanishing installer no longer re-downloads without end.** If something removed the downloaded setup between checks (an antivirus quarantining an unsigned 90 MB file is the usual cause), the app would fetch all 90 MB again on every launch, forever. It now gives up after a few attempts and offers the release page instead.
- **The Greek layout can no longer be left switched on.** If the τ shortcut failed midway, the layout restore could be skipped and every program was left typing Greek. The restore now always runs.
- **A rare race could still produce a plain `t`.** If the target window disappeared at the moment the shortcut fired, the layout check could read *this helper's* layout instead of the target's and report a successful hop that never happened.

### Install

Download **RecCheck-Setup.exe** below (under *Assets*) and open it. It installs in a few seconds — no administrator password — and puts **RecCheck** on the Desktop and in the Start Menu. If an older RecCheck is running, the installer closes it and relaunches when done.

If Windows shows a blue *"Windows protected your PC"* screen: click **More info → Run anyway** (the app is unsigned, not harmful).

Existing installs update themselves: the app downloads this version in the background and offers it with the blue ↑ button — no reinstall by hand needed.
