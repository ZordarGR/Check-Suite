## RecCheck 1.17.2 — Windows

Nightly POS receipt audit for the protel checkcharge1 report (.oxps). Everything runs locally — no data leaves the machine.

### The shortcuts belong to protel

A side button bound to the τ was bound *everywhere*. In a browser, in the file manager, in RecCheck itself — the helper took the press and protel never saw it, because protel was not the window in front.

*PROTEL SHORTCUTS* now has **Only while protel is in front**. Tick it, and the app asks you to bring protel forward for five seconds and reads the window itself — nothing is guessed about what protel is called on your machine. Anywhere else the button goes back to being an ordinary button; nothing is swallowed, so whatever it normally does, it does.

If it ever stops firing where it should, **DEBUG → What the last presses did** now says *"trigger ignored: protel was not in front"* along with what actually was in front, so a wrong window is something you can see rather than something you have to work out.

It stays off until you point it at protel, because a gate aimed at the wrong window would quietly cost you every shortcut in the middle of a shift.

### The room pills had nothing to show

A rate list was loading fine and the room movements panel stayed empty. The list carries a business date in its header, and the app could only read that date out of one exact header line — a list printed any other way parsed its rooms, loaded without a word of complaint, and recorded **not one stay**.

It now looks for that date in four places, and if the print never gave one it takes the newest arrival on the list, which on a list of in-house guests is today. Loading a rate list now says on the spot what went into the ledger, instead of leaving an empty panel to be found on the other screen an hour later.

**DEBUG → Why the room pills say what they say** prints the night the report is for, what the last rate list recorded, and every stay landing near that night — enough to see at a glance whether the panel is empty because nothing was recorded or because the dates do not line up.

### Install

Download **RecCheck-Setup.exe** below (under *Assets*) and open it. It installs in a few seconds — no administrator password — and puts **RecCheck** on the Desktop and in the Start Menu. If an older RecCheck is running, the installer closes it and relaunches when done.

If Windows shows a blue *"Windows protected your PC"* screen: click **More info → Run anyway** (the app is unsigned, not harmful).

Existing installs update themselves: the app downloads this version in the background and offers it with the blue ↑ button — no reinstall by hand needed.
