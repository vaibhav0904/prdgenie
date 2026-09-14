# BUG-055: M5's control can no longer tell a wrong derivation from a right one

**Severity:** major — a published figure whose checker cannot fail is an unchecked figure
**Found:** 2026-09-04, `recompute-metrics.mjs` M5-C going red during BUG-054's sweep
**Area:** `docs/metrics.md` M5 · `review-ui/metrics.mjs` · `review-ui/scripts/recompute-metrics.mjs`

## What happens

```
PASS  M5    cost per approved PRD (USD)  — mine 0.001 · shipped 0.001
            $0.0683 over 71 version(s) on 58 distinct trace(s)
FAIL  M5-C  CONTROL: the double-counting derivation gives a different answer, so this check
            can fail — wrong way $0.001217  vs  right way $0.001
```

The control exists to prove `recompute-metrics` **would notice** a wrong derivation. It plants
the double-counting version of M5 and requires a different answer.

The two answers *are* different — **$0.001217 against $0.000962, a 26% error.** They stop being
different when rounded to the precision M5 is published at. Three decimals cannot hold the
distinction, so at the published figure the right and wrong derivations are the same number.

**A check that cannot fail is not checking anything**, and that is now true of M5 — not because
the checker weakened, but because the figure shrank until its own precision swallowed the
difference.

## The second half, which is worse

M5 is *cost per approved PRD*. Its denominator today:

```
approved versions   71
of those ZERO-COST  37   (no llm_call on their trace at all)

   20  forgesight            <- the actual product
   51  verify-* / control-*  <- fixtures built by the checks
```

**Fifty-one of seventy-one approved versions are verification artefacts**, and more than half of
all of them cost nothing to produce. The figure divides a real spend by a denominator that is
72% test scaffolding, so it falls every time the suite runs and has nothing to do with what a
PRD costs.

E8-S1 disclosed a version of this — *"22 of the 30 approved versions were hand-made during
verification and cost nothing"*, printed as one of the metric's own rows. That disclosure is
still there and is still honest. **What has changed is the ratio**: 22 of 30 was a caveat, 37 of
71 with 51 fixtures is a different number wearing the same name.

And BUG-045 named this exact question and deliberately left it: *"whether the metrics corpus
should contain verification runs at all... is a question for E8, not a bug."* It is a bug now,
because the control that guarded the figure has stopped working.

## The fix has to decide two things

1. **What M5 counts.** Either it excludes versions whose product is a verification fixture — the
   product ids are unmistakable and derivable — or it stops being *per approved PRD* and becomes
   per approved PRD **of a real product**, named that way. Excluding by product id is a filter on
   provenance, which is the sort of thing this project normally refuses; the argument for it here
   is that the fixtures are not PRDs anybody asked for.
2. **What precision it is published at.** A figure quoted to three decimals cannot be checked to
   better than a tenth of a cent. Either publish enough digits for the control to bite, or state
   the figure with its own resolution beside it.

**Do neither by adjusting the control.** Loosening M5-C so it passes would be tuning a check to
output, and the number it protects is one that appears in the deck.

## What is NOT wrong

`recompute-metrics` and `metrics.mjs` still agree, and both are still right. This card is about a
figure that can no longer be *proved* right, not one that is wrong.

## Outcome — 2026-09-04

**The control bites again**, and the diagnosis was narrower and more interesting than the card
guessed.

```
PASS  DP     every metric declares the precision it is published at — M1:2dp M2:2dp M3:3dp M4:2dp M5:4dp
PASS  M5     cost per approved PRD (USD) — mine 0.0009 · shipped 0.0009
PASS  M5-C   wrong way $0.001168  vs  right way $0.0009
PASS  DP-C   CONTROL: accepted at 1dp, refused at 4dp
8/8 agreed
```

### It was one type conversion

M5 **already** rounded to four decimals. `Number((0.000962).toFixed(4))` is `0.001` — JavaScript
drops the trailing zero — and the checker inferred its tolerance by *stringifying the value*. So
it compared at three decimals and a 26% error became invisible.

**The precision was declared and then discarded by the conversion.** `DP = { M1: 2, M2: 2,
M3: 3, M4: 2, M5: 4 }` is now the single place those digits live: the rounding, the `decimals`
field published beside each value, and the metrics page all read it. The checker takes the
declaration and, if a metric ever fails to declare one, says so out loud before falling back.

### The row that would have been skipped

Every other row passes when the two derivations agree. **None of them would notice a tolerance
that had gone slack** — and a tolerance is exactly the thing that widens quietly, because
widening it makes everything greener. **DP-C** declares M5 at one decimal, requires the
comparison to accept a difference forty times its resolution, and requires the real declaration
to refuse the same number. Without it, *"the checker reads the declaration"* and *"the checker
ignores precision"* look identical from the outside.

### The denominator: decided, and deliberately not changed

40 of 74 approved versions cost nothing, and 51 belong to `verify-*` and `control-*` products.
Filtering them out would produce a cleaner figure. **A metric re-defined because a control went
red is tuning wearing a better suit**, so the definition stands — and the number a reader
actually wants now sits beside it with its own denominator:

```
    74  approved versions (the denominator)
    40  of those, with NO model spend on their trace
 0.002  of those the pipeline actually produced, cost each (USD)
```

Two populations, two figures, both named. `docs/metrics.md` carries the decision so it is not
re-litigated, and the computed `provisional` block that already said all this is untouched.

### One improvement that fell out

The metrics page now prints each figure **at its declared resolution**, so `0.0020` no longer
displays as `0.002` and leaves the reader guessing how much of the number is real. The render
audit went from 5 unhomed fields to **79 homed, 0 with no home** — the `decimals` fields earn
their place by being used, not by being declared consumed.

### The sweep

**57 of 58 in 78 seconds.** The only red is **BUG-046**, open. BUG-056 and BUG-057, both filed
during BUG-054, passed on this run — which is what their cards predict: one is a stochastic
control, the other a contention that clears on its own.
