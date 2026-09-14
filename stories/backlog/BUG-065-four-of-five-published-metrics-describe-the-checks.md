# BUG-065: Four of the five published metrics mostly describe the checks

**Severity:** major · every figure is correctly computed, and most of them are about the wrong population
**Found:** 2026-09-05, counting the metric denominators for a status report
**Area:** `review-ui/metrics.mjs` · `docs/metrics.md` · the deck (E9-S3) and the video (E9-S4)

## What happens

```
approved versions:                           107
  of which are check / control fixtures:      87   (81.3%)
  the real ForgeSight corpus:                 20
```

`M2` (accepted-unedited), `M4` (cycle time) and `M5` (cost per approved PRD) all have
**`state='approved'`** or the `approved` event in their denominator. Four fifths of that
denominator is versions a verifier minted and signed off seconds later.

The figures say so if you read their own rows, which is the metrics page working as designed:

| Metric | Value | The row underneath it |
|---|---|---|
| M4 cycle time | **0.02 min** | *"approved with NO review action recorded: 37"* — a median of 1.2 seconds |
| M5 cost per approved PRD | **$0.0006** | *"of those, with NO model spend on their trace: 73"* |
| M2 accepted-unedited | 76.14% | 285 actions, most of them from `verify-review-gate` fixtures |

M4's median is **1.2 seconds to approval**. No human approved anything in 1.2 seconds. It is the
correct median of a population that is mostly machines.

M1 (grounding rate, 97.29% over 8,253 requirements) is the least affected — it counts
requirements rather than approvals — but it is drawn from the same pool.

## Why it has not been caught

Because nothing is wrong with the arithmetic, and this project has spent a lot of effort making
sure of that. `verify-metrics` recomputes every figure from its own rows and agrees; E8-S1's
whole subject was that the numbers are right. **A number can be right about the wrong thing**,
and every guard here was pointed at the first half of that sentence.

BUG-055 already found one instance and fixed it locally — M5 gained the companion row *"of those
the pipeline actually produced, cost each: $0.002"*. That was the same defect, seen once, in one
metric.

## Why it matters now rather than later

E9-S3 puts these numbers on a slide and E9-S4 says them out loud. **A metric that is 81%
test debris, presented as what the product does, is the one thing this project has spent eleven
epics refusing to do.**

## The fix has to decide

1. **Whether the metrics exclude check-created versions**, and on what derived signal — a
   product-id prefix is a naming convention, not a fact. Candidates: no `llm_calls` on the trace
   (the pipeline never ran), no review session, or an explicit `origin` column written at insert.
2. **Or whether they are reported as two populations side by side**, which is the shape BUG-055
   chose and the one that hides nothing: *"across everything the database holds"* beside
   *"across runs the pipeline actually produced"*.
3. **What the deck publishes.** Whichever is chosen, the slide carries the denominator.

## Not a fix

Deleting the fixture rows to make the numbers look right. They are the record of what the checks
did, and a metric that only reads well after the inconvenient rows are removed is not a metric.

## Not a fix either

Leaving it and adding a caveat. The page already carries caveats and they did not stop a median
of 1.2 seconds being the headline cycle time. **A caveat beside a wrong population is a footnote
apologising for the number above it.**
