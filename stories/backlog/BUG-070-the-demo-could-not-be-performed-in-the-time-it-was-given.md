# BUG-070: The demo could not be performed in the time it was given, and the second run would have had no sign-off button

**Severity:** major · the recording would have failed, twice over, in ways only visible while doing it
**Found:** 2026-09-07, checking readiness for the two demo runs Vaibhav asked about
**Area:** the run sheet · `review-ui/public/review.html`

## Two findings, both about state rather than code

### 1. Sign-off takes 25 clicks and demo 1 is forty-five seconds

Sign-off is refused until **every** requirement and story has a decision. That is the product
working exactly as designed (E4-S3). On the demo version it means **25 decisions** — 13
requirements and 12 stories — and there is **no bulk-decide anywhere in the review UI.**

The run sheet said *&ldquo;sign off&rdquo;* as though it were one click. It is twenty-five, in
silence, on camera, inside a forty-five-second beat.

### 2. The rehearsal eats the recording's version

The run sheet named `?version=1431`. The rehearsal signs it off, which **approves** it — and an
approved version has no sign-off button and cannot be signed off again. The second run, the one
being kept, would have opened a screen missing the thing it was there to show.

**A hard-coded version in a run sheet is a trap that springs exactly once, on the take you keep.**

## Why neither was caught before

Both are properties of *running the thing twice*, and until now it had been run once. Every check
in this repository looks at a file, a row, or a response; none of them models a person doing a
sequence in order, under time pressure, and then doing it again. The run sheet had been reviewed
for accuracy and never for **performability**.

## Fixed the same day

- **`deliverables/demo-readiness.mjs`** — one command, GO or NO-GO. Node, both services, all five
  doors, the provider binding, the callback key being *enforced*, the two on-camera commands, a
  graded result to re-grade — and with `--live`, **a real document through the whole pipeline**.
  It **picks the version from the rows and prints the URL**, preferring `PRD-forgesight` so the
  delta's spoken line — *&ldquo;the PRD I just approved&rdquo;* — stays true. Run it again before
  the recording and it names a different one, because the first is now approved.
- **`deliverables/demo-prep.mjs`** — decides everything but three, **keeping an amber one**, so
  the counter reaches zero on camera. Through the real endpoint, with a reason recorded on every
  decision saying it was demo setup. There is no `--undo`, and the script says why: decisions are
  append-only, and a review history you can erase is not a review history.
- The runbook opens with the two-run warning, the window table no longer names a version, and
  recovery covers both *&ldquo;the button will not enable&rdquo;* and *&ldquo;there is no button&rdquo;*.

## What is still open

**Nothing here is checked by anything.** These are two more scripts whose correctness rests on
having been run once, by me, today — which is precisely the criticism above. A check that a run
sheet is *performable* would have to model a sequence, and this repository has no instrument for
that. The nearest real one is still **E9-S2's open gate**: a person following the document
literally, on a clean machine, twice.
