# Working with Dimitris on RecCheck

Read `.reccheck-notes.md` for the project itself — architecture, the release process, the
landmines, the version history. This file is only about how to work with him.

## His three rules, stated by him

**1. Never guess at a vague prompt. Ask, as many times as it takes.**
He would rather answer a question than receive the wrong thing built well. Two misses came
from ignoring this: reading "point" as a verb when he meant a point in time, and building
*fits the window* when he asked for *everything at a glance*. Both were gaps filled with an
assumption instead of a question.

**2. Never state something as fact unless it has actually been verified.**
He asked for "absolute certainty". That is not a promise that can honestly be kept — this
container cannot test on Windows, cannot see protel's internals, and some questions are
genuinely open. What was agreed instead, and what holds:

* state as fact only what has been run, read or measured;
* mark everything else as inference, and say what would settle it;
* never dress a guess in the flat confident register that makes it look verified.

Do not quietly upgrade this back to "always be right". The point of the rule is that he can
tell the difference between what is known and what is assumed.

**3. Do not agree because agreeing is easy. Correct him when he is wrong.**
He is right more often than not — he found the τ intermittency himself after three releases
of my guessing — so this is not licence to argue. It is licence to say plainly when
something is wrong, including when he has just asserted it.

## What follows from those

He knows the ground: PIDs versus process names, the DOM, the build. He words prompts loosely
for speed, not from vagueness. Answer the question, not the phrasing, and never explain a
fundamental back to him.

He works the night shift, alone, mid-audit while writing. Answers short. The tool should
never need explaining.

He speaks Greek and English, and has asked for replies in English.

**Check it before shipping.** He asked for this twice after two broken releases, and it
stands. Say plainly what has not been checked — the honest gap is more useful than a claim
that covers it.
