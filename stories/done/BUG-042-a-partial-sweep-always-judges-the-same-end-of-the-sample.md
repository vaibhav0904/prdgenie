# BUG-042: A partial sweep always judges the same end of the sample

**Severity:** major — it silently defeats the point of E7-S6
**Found:** 2026-09-04, sweep #22, while proving BUG-041's fix through the real path
**Area:** WF6 `Pace the calls` / the order `openSweep` returns items in

## What happened

Sweep #22 got a partial answer from the provider: **8 of 22 calls succeeded, 14 were refused.**
Every one of the 8 came from the **`uniform`** stratum.

```
-- scores, by stratum, sweep #22 --
{"stratum":"uniform","verdict":"supported","n":8}
```

Not one ungrounded row, not one `approved_anyway` row — the exact rows E7-S6 exists to reach.

## Why it happens

`openSweep` returns items grouped: versions first, then requirements **in stratum order**, and
`uniform` is last because it is the stratum that absorbs unfilled quota. WF6 then walks that
list in order. So when the provider is only partly available, **whichever end of the list the
available quota happens to land on is the only stratum that gets an opinion.**

On sweep #22 the early calls were refused and the later ones succeeded (the quota window reset
partway through — the stored detail says `Please retry in 43.1s`), so the tail won. It could as
easily have been the head. The defect is not *which* end wins; it is that **the sample's order
is a stratum ordering, so a truncated sweep is never a subset of the draw — it is one stratum.**

This is worse than it looks, because the sweep reports honestly at every step. It recorded
`llm_no_credit (14 of 22 calls)`, stored 8 real scores, and closed `complete`. Nothing lied.
The coverage page will simply show `uniform` growing and `ungrounded 0 of 108` never moving,
and the reason will not be visible anywhere near it.

## Repro

Any sweep against a provider with partial quota. Or deterministically: allow the stand-in
provider to answer only the last *n* of 22 calls and observe that
`SELECT DISTINCT stratum FROM judge_scores WHERE sweep_id = ?` returns one row.

## Suggested fix, not applied

**Shuffle the item list after drawing it, before WF6 walks it.** The strata decide *which rows
are in* the sample; they must not also decide *what order they are asked in*. A truncated sweep
then degrades to a random subset of the draw, which is the only degradation that keeps the
per-stratum coverage numbers meaning what they say.

Two things the fix must not do:

1. **Do not order the valuable strata first.** It is tempting — spend scarce quota on the rows
   that matter — but then a partial sweep systematically *over*-represents them, and the
   per-stratum coverage figures start describing the provider's mood rather than the corpus.
2. **Do not shuffle inside `judge_sample`.** The stored draw is the record of what was asked
   about; the shuffle belongs to the asking, not to the record.

The test is a partial sweep that touches **more than one stratum** — asserted from
`judge_scores`, with a control that forces the old ordering and shows a single stratum.

## Not fixed here

Found while closing BUG-041 inside E7-S6. Filing rather than folding in — and it is **major**
rather than minor because it defeats the whole point of the story that exposed it: the sample
now reaches the hard cases, and a partial sweep quietly un-reaches them.

Related: **BUG-041** (the truncated detail) is what made this visible at all — without the
metric name in the record it would have looked like ordinary quota noise.

## Fixed, 2026-09-04 — the draw is stratified, the asking is shuffled

**Option 1 from "Suggested fix" shipped**, unchanged: the item list is shuffled after it is
drawn and before WF6 walks it. `judge_sample` still stores the draw in stratum order, because
that is the record of what was asked about; the shuffle belongs to the asking.

Both warnings on the card were honoured. The valuable strata are **not** ordered first — that
would over-represent them whenever quota is short, and the per-stratum coverage figures would
start describing the provider's mood rather than the corpus. Random is the only order that
degrades into a subset of the draw.

### Measured, not asserted

`verify-strata.mjs`, on a real 22-item sweep:

```
TC19   18 stratum changes across 22 items, 7 strata present   (stratum order gives 7)
TC19b  the first 8 items — the size sweep #22 stopped at — span 6 strata
TC19c  CONTROL: the same 8 in stratum order span 3, and the list has exactly 7 runs
TC19d  seeded shuffle is deterministic, so this is a measurement and not a lucky draw
```

**TC19c is the load-bearing row.** It reproduces the pre-fix ordering on the same items and
shows the collapse, so TC19b is measuring the fix rather than a coincidence. And `stratumRuns`
is the metric rather than an eyeball: "looks shuffled" is not a check.

`JUDGE_SHUFFLE_SEED` makes the shuffle deterministic for tests. **Nothing but the tests sets
it**, and TC19 asserts the unseeded path is not in stratum order — a seeded shuffle in
production would be a fixed order wearing a random one's name.

### What is still owed: a live partial sweep

The confirming observation is **a real sweep answered in part that touches several strata**.
Sweep #24, run immediately after the fix, was refused 22 of 22 on the free-tier quota and
scored nothing, so it shows neither the old behaviour nor the new one. **The next partially
answered sweep is the evidence**, and it needs no new work — the per-stratum scores are already
stored on every sweep, so it will either show several strata or it will not.

Closed on the deterministic checks rather than held open for the provider, because the ordering
is entirely ours and the controls exercise both sides of it. Recorded here so nobody later
reads "fixed" as "observed in the wild".
