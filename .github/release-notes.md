## RecCheck 1.14.0 — Windows

Nightly POS receipt audit for the protel checkcharge1 report (.oxps). Everything runs locally — no data leaves the machine.

### New in 1.14.0

**The overlay finishes the night for you.** Tick the last task and the overlay fills green from the bottom up, lands a large white tick, and puts itself away for the rest of the night. At 07:00 the ticks clear and it comes straight back — as does unticking anything before then.

While that animation plays the overlay never catches the mouse, even if the last task was ticked on the overlay itself in interact mode. protel stays clickable underneath throughout.

**Asking for a finished overlay tells you so.** Once it has put itself away, the toggle shortcut briefly shows *All tasks are done for tonight* rather than appearing to do nothing. Under *Customize overlay* there is a **Remind me when the night is already finished** switch — turn it off and the toggle behaves like an ordinary on/off instead, so nobody who dislikes the interruption has to live with it.

Summoning the overlay with the tick shortcut still works on a finished night, so a task can be unticked; leaving tick mode puts it away again.

**The τ shortcut works, so its Test button is gone.** *PROTEL SHORTCUTS* is back to just the bindings. The diagnostic itself is still in the helper — if the shortcut ever misbehaves again the button can be restored in a small update, with no reinstall.

### Fixes

- **Update checks could see a stale version list.** The update manifest is cached for five minutes at each of GitHub's regional edges, so a freshly published version could stay invisible in one country while already live in another — the app would report "you are up to date" when it was not. Each check now forces a fresh read instead of accepting whatever that region had cached.

### Install

Download **RecCheck-Setup.exe** below (under *Assets*) and open it. It installs in a few seconds — no administrator password — and puts **RecCheck** on the Desktop and in the Start Menu. If an older RecCheck is running, the installer closes it and relaunches when done.

If Windows shows a blue *"Windows protected your PC"* screen: click **More info → Run anyway** (the app is unsigned, not harmful).

Existing installs update themselves: the app downloads this version in the background and offers it with the blue ↑ button — no reinstall by hand needed.
