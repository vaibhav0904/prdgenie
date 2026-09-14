# BUG-071: The run-it-yourself README shipped a command with a carriage return in it

**Severity:** major · it is the *first* command a stranger runs to test the headline claim, and it
does not run
**Found:** 2026-09-07, while rewriting the run sheet for someone non-technical
**Area:** `deliverables/RUN-IT-YOURSELF.md` line 141 · `review-ui/scripts/check-readme-links.mjs`

## What shipped

The README's section 2 — *the gate, from outside the application* — is the step that proves the
project's single loudest claim. Its command block held this:

```
.<CR>un.cmd review-ui/scripts/prove-the-gate.mjs
```

A literal carriage return, byte `0x0D`, where `\r` of `.\run.cmd` should have been. In most
renderers it looks like `.un.cmd`, or like a line that wraps oddly, or — in a terminal — like
`un.cmd` with the `.` overwritten. **Copy it and nothing runs.**

It was written into the file by a patch script: the string `'.\run.cmd'` inside single quotes,
where `\r` is a carriage return in JavaScript and in `sed` and in almost everything else. That is
already a documented gotcha in `CLAUDE.md` — *bash eats `$(`, backticks and `\`* — and it still
got through, because the gotcha is about writing code and this was writing prose.

## Why no check caught it

`check-readme-links.mjs` has a case that asserts **every command goes through `.\run.cmd`**. It
passed. It was matching on `run.cmd`, which is present in `.<CR>un.cmd` — the corruption sits in
the part of the string the check does not look at.

**A check that asserts a substring is present cannot see a character inserted before it.** The
case was written to catch a command invoked as bare `node`, and it does catch that. It was never
written to catch a command that is *malformed*, because nobody imagined one.

## Fixed

`deliverables/RUN-IT-YOURSELF.md` line 141 now reads `.\run.cmd`, and the repair was verified by
reading the file back and counting both forms — 0 corrupted, 15 correct — rather than by the
write returning without an error.

## Still open — the reason this is a card and not a footnote

`check-readme-links.mjs` **still cannot fail on this.** The fix repaired the artefact and not the
checker, which is the disease this project has a rule about: *a green check is not a fix*
(BUG-046, and slide 9 flaw 04).

What it needs is a case that scans every fenced block in the README for control characters —
`0x00`–`0x1F` other than newline and tab — and a negative control that plants one and requires the
case to go red. That is small, and it belongs to whoever next touches E9-S2.

**Do not close this card by re-reading line 141.**

## Blast radius, checked

Every tracked `.md`, `.mjs`, `.js`, `.cmd`, `.json` and `.html` file was scanned for the same
pattern. `RUN-IT-YOURSELF.md` was the only one. The decks are generated from `slides.mjs`, where the
same string is written `'.\\run.cmd'` and renders correctly.

## It happened again, in the hour, while this card was being written

Writing the STATUS.md entry for **this defect** put a second carriage return into a second file —
the same string, the same cause, the same invisible result. It was caught only because the output
was read back character by character rather than glanced at.

That settles what kind of defect this is. It is **not a typo in one file**; it is a property of
writing `\r` through any tool that resolves escapes, which is every tool used here. A repaired
artefact does not reduce the chance of the next one at all.

**So the fix is not in the file, it is in the check.** Until `check-readme-links.mjs` can go red on
a control character inside a fenced block, this will keep landing in whichever document was edited
last — and the documents being edited last, right now, are the ones a stranger reads first.
