## RecCheck 1.16.2 — Windows

Nightly POS receipt audit for the protel checkcharge1 report (.oxps). Everything runs locally — no data leaves the machine.

### Fix — the helper crashed on startup, so no shortcut could work

**Install this if your shortcuts do nothing.** This is the actual cause of the breakage that has run through 1.15.0, 1.16.0 and 1.16.1.

The status line added in 1.16.1 reported `exit=3762504530` — `0xE0434352`, the CLR's code for *an unhandled exception happened*. The helper was starting, throwing, and dying 53 ms later, every time.

The helper is compiled here on Linux against Mono's class library, and runs on your machine against .NET Framework, which is the smaller of the two. One line of the keystroke-run parser added in 1.15.0 — `body.Split(',')` — compiled to `String.Split(char, StringSplitOptions)`, an overload .NET Framework 4.8 does not have. Windows resolves every call in a method *before* running it, so that single line killed the whole of the bind parser on its first use — even though the branch containing it was never reached.

It was hidden for three versions because 1.15.0 also broke *storing* a binding, so nothing was ever bound, so the helper was never started in the mode that would have crashed. Fixing the storage in 1.16.0 and 1.16.1 is what finally let it run — and crash.

The call is now written so it can only bind to the overload that exists everywhere, and the build refuses to produce a helper that references anything outside a reviewed list of .NET Framework members.

### The helper now reports its own crashes

Rather than a hex exit code, an unhandled exception is written down and *PROTEL SHORTCUTS* shows what threw and where — the exception type, its message, and the method it came from. A crash while it is running no longer takes the shortcuts down for the rest of the night either; it is recorded and the helper keeps going.

### The keystroke run is back

*Invoice keystroke run* returns to the menu: **Enter · Enter · Right · Enter · Enter**, 25 ms apart, on one button. It was withdrawn in 1.16.1 while it was the suspect. It was not the cause — one line of its parser was, and that line is fixed.

### Install

Download **RecCheck-Setup.exe** below (under *Assets*) and open it. It installs in a few seconds — no administrator password — and puts **RecCheck** on the Desktop and in the Start Menu. If an older RecCheck is running, the installer closes it and relaunches when done.

If Windows shows a blue *"Windows protected your PC"* screen: click **More info → Run anyway** (the app is unsigned, not harmful).

Existing installs update themselves: the app downloads this version in the background and offers it with the blue ↑ button — no reinstall by hand needed.
