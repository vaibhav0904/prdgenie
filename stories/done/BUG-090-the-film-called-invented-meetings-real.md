# BUG-090: The film called invented meetings real

**Severity:** major · the README says *"No real company, no real person, no real meeting"*, and the
film that goes out beside it said the opposite twice — once on screen and once out loud. In a project
whose whole argument is that it does not overclaim, that is the one sentence that must not be wrong
**Found:** 2026-09-15, reading the contact still of slide 8 after re-rendering the film
**Area:** `deliverables/deck/slides.mjs` — slide 2's narration and slide 8's first row

## What happened

- Slide 8, on screen: *"The right answers were written by hand first **for ten real meetings**, before
  the AI ever tried."*
- Slide 2, spoken: *"I will show you each step on the real thing, **with a real meeting**."*

Every meeting in the fixtures is written for the project: ForgeSight, Marcus, Priya, Dana, Wei and Tom
are fictional, and `docs/assumptions.md` says how they were written. "Real" was reaching for
*realistic* — a full meeting rather than a toy example — and said something false instead.

## Why nothing caught it

Nothing reads the deck for claims. The count guard reads numbers; the film's storyboard check counts
spoken lines. A true count in a false sentence passes both. The sentence was read many times — the deck
rewrite, the narration QA, which checks that the voice said the words, not that the words are true.

## Fixed

- Slide 8: *"for ten **invented** meetings"*.
- Slide 2: *"with a **sample** meeting"*. "On the real thing" stays: the product on screen is the real
  running application, which is true.
- The deck rebuilt; the one changed narration line re-recorded (narration is cached by content, so no
  other line was sent again) and passed the speech-to-text check; the film re-rendered.

A search of the deck for every other use of *real* found only true ones: real runs, real documents
through the pipeline, a real contradiction, the real thing.

## Still open

No check reads a claim against `docs/assumptions.md`. It is the kind of error only a reader catches,
and the reader has to be looking for it.
