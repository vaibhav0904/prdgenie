# BUG-033: a nice-to-have is written down as a requirement

**Severity:** minor · **Filed:** 2026-09-03, during BUG-030
**Caused by BUG-030's fix**, and by the specific sentence in it that stopped a different
failure. That is on the record here rather than absorbed into the story that caused it.

## What happens

N1 contains, in Wei's notes: *"autocomplete would be nice, not required"*. Under prompt
`dd2ce8269321` the extractor writes it down:

```
1198-REQ-006  false_positive  Autocomplete for dashboard name search is desirable but not required.
```

The statement is **honest** — it says "desirable but not required" — and the citation is
grounded. It is still a false positive: the answer key has six requirements for N1 and this is
not one of them, because a thing the room declined to require is not a requirement.

## How new it is

The string "Autocomplete" appears in **2 of the 86 archived C1 result files**, and both are
runs of `dd2ce8269321` from today. N1 scored 100.0% / 100.0% in all 27 graded runs before it,
across four prompt versions. Under this one: 100/100, 100/85.7, 100/100, 100/85.7 — **two runs
in four**, and the fixture still clears both floors.

## The cause, which is a sentence I chose

BUG-030's iteration 2 made the model stop extracting `F1-R06` altogether rather than give it
the wrong kind — the failure this project already had a name for: *a prohibition holds about
two runs in three; a redirect holds*. Iteration 3 fixed that by naming the destination and
adding, in as many words:

> *"A promise of this shape is a real requirement and belongs in `requirements` like any other
> — the kind is the only thing in question, never whether to write it down."*

It worked: `F1-R06` is correct 4 runs of 4, from 0 of 26. **And the model wrote one more thing
down.** The instruction is aimed at a sentence whose *kind* is in doubt and reads, two
paragraphs later, as encouragement in general.

**This is the cost side of a redirect, and it is worth naming as a pattern**: telling a model
where to put something it was dropping raises what it keeps, and the fixture that pays is the
one with a near-miss in it. A redirect is not free; it is cheaper than a prohibition.

## The candidate fix, and why it is not attempted here

Narrow the sentence's reach so it governs the paragraph it is in rather than the prompt — for
example by binding it to the period rule explicitly (*"a **period** of this shape is a real
requirement…"*) instead of "a promise of this shape". One word, and it is testable against
exactly this false positive.

It is not done today because **BUG-030's iteration budget is spent** — three of the three
PRD-E2 allows — and a fourth edit measured in the same breath as the third could not be
attributed to either.

## Verified by
- N1 back to 100% / 100% over three runs
- `F1-R06` still correct over the same three runs — the fix that caused this must survive its
  own repair, or the repair is a revert wearing a different name
