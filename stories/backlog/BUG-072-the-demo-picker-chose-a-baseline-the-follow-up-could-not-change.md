# BUG-072: The demo picker chose a baseline the follow-up could not change

**Severity:** blocker · demo 3 would have produced an empty delta on camera, in the take being kept
**Found:** 2026-09-07, auditing the demo end to end rather than reading the run sheet
**Area:** `deliverables/demo-readiness.mjs`

## What would have happened on camera

`demo-readiness.mjs` picked **v1432** for demo 1. Vaibhav signs it off, which makes it the
approved version of `PRD-forgesight`. Demo 3 then sends **T2**, the follow-up meeting, at that
PRD.

**v1432 was itself built from T2.** Its requirements already carry every change T2 makes: the
four-second render time, the aggregation store, the PDF-or-CSV schedule, the pinned comment. The
delta would have compared T2 against a PRD that already contains T2 and correctly reported that
nothing changed — on the slide whose headline is *"The second meeting does not create a second
PRD."*

The product would have been working. The demo would have been dead.

## Why the picker allowed it

It filtered on `amber >= 1 AND reqs >= 8 AND stories >= 5` — every property **demo 1** needs, and
none that **demo 3** needs. It had no idea which document a version came from.

**32 of the 39 versions that passed the filter were built from T2.** It was not a near miss; the
odds were 4 in 5 against the demo working, and the version it actually chose sat one row above a
correct one (v1431, from T1) in its own ordering.

## The rule that was missing

**The baseline has to be a document the follow-up can change.** Stated that way it is obvious, and
stating it that way is the whole fix — it was never written down anywhere, in the picker or the
run sheet, because whoever built each demo built it alone.

Fixed by filtering candidates whose stored source text equals the follow-up fixture's, read from
`evals/datasets/docs/T2.json` rather than typed, so re-recording against a different follow-up
moves the rule with it. The check prints its own denominator:

```
ok    the baseline will be one T2 can actually change
      32 of 39 candidates were built from T2 itself and were skipped
```

## Proven by performing it, not by reading it

v1431 was signed off through the real endpoint and T2 sent at `PRD-forgesight` through the real
door. 8.0 seconds, one model call, and the delta returned two `modified`, one **`contradicted`**
and two `added`.

## What this cost, and what it bought

**It also corrected a wrong conclusion of mine.** Before running it I had concluded from three
archived runs that the delta *never* emits `contradicted` — and had rewritten slide 5 to admit a
mislabelling that does not happen. Those three runs used a baseline that made a contradiction
impossible. **Reading three archived results was not evidence; performing it once was.** That is
BUG-041's rule — *verify the artefact that ships, not a copy* — applied to a demo.

## Still open

Nothing checks the invariant except `demo-readiness` itself, and `demo-readiness` has no negative
control: no script plants a T2-derived version at the top of the ordering and requires the picker
to skip it. Until that exists this is a fix, not a guarantee — and **19 of 51 checkers already
have no control** (slide 8). Do not close this card by re-running the picker and seeing v1431.
