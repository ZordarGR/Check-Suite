## RecCheck 1.17.14 — Windows

Nightly POS receipt audit for the protel checkcharge1 report (.oxps). Everything runs locally — no data leaves the machine.

### A read-only look at what a protel window is made of

In **DEBUG → What the window in front is built from**. Press it, bring the protel window you care about forward, and it prints the control tree: class, id, size, caption, and for list controls **the number of rows the list holds — including the ones scrolled out of sight**.

That last number is the point. It decides whether anything built on live reading could ever know a *whole* list, or only the part on screen. If nothing comes back, these lists are painted rather than built from controls, and the answer is that this approach cannot work.

**Read-only in the strict sense.** Every message is a getter — a length, a caption, a count. Nothing is written, no key is sent, no window is moved or changed, and protel holds exactly what it held before.

**It is not free, and it says so.** Asking a control a question runs code on protel's own UI thread. So the report ends with **how many questions it asked and how long the sweep took**. If protel feels slower while it runs, that line is what did it — and it is the number this feature will be kept or removed on.

It runs once, only when you press the button. It installs nothing, watches nothing, and writes nothing to disk.

### Install

Download **RecCheck-Setup.exe** below (under *Assets*) and open it. It installs in a few seconds — no administrator password — and puts **RecCheck** on the Desktop and in the Start Menu. If an older RecCheck is running, the installer closes it and relaunches when done.

If Windows shows a blue *"Windows protected your PC"* screen: click **More info → Run anyway** (the app is unsigned, not harmful).

Existing installs update themselves: the app downloads this version in the background and offers it with the blue ↑ button — no reinstall by hand needed.
