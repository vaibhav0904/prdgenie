# BUG-087: The decision count counted the template

**Severity:** minor · one wrong number, but it sits in the README and on the slide whose job is
*why you should believe the previous slide*, and anyone can falsify it with `ls docs/adr`
**Found:** 2026-09-15, re-checking every figure the README quotes before it is linked publicly
**Area:** `README.md` · `deliverables/deck/slides.mjs` slide 8 · `deliverables/deck/build-deck.mjs`

## What happened

Both said **"11 recorded decisions"**. `docs/adr/` holds eleven files, and one of them is
`0000-template.md`, which records nothing. The project has **ten** decisions, ADR 0001 to 0010.

The number arrived with the deck rewrite on 2026-09-10 and was copied into the README from the
slide.

## Why nothing caught it

The deck already refuses to build when a count on a slide disagrees with the folders — for
*stories done*, *bug cards closed* and *open bug cards*. The decision count sat in the same sentence
as two of those and was not one of the claims the guard reads. **A guard over a sentence protects
the numbers it names, not the sentence.**

## Fixed

- The README and slide 8 say **10 recorded decisions**.
- The count guard in `build-deck.mjs` gains the claim: `recorded decisions` is the number of files in
  `docs/adr/` named `NNNN-*.md`, excluding `0000-template.md`. The deck now refuses to build on a
  wrong decision count exactly as it does on a wrong bug count.

This extends a guard inside the deck build; it adds no checker, so the checker counts quoted in the
README do not move.

## Still open

The README repeats the slide's counts and nothing compares the two. It is corrected by hand here.
