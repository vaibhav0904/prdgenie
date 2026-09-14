# BUG-068: Closing BUG-040 did not settle C1 — the straddle moved to a different fixture

**Severity:** major as a *reporting* fact · the eval case that gates extraction quality still
cannot be published as settled
**Found:** 2026-09-05, by the dress rehearsal (E9-S5), the night before release
**Area:** `evals/cases/C1` · `n8n/prompts/extract-requirements.md` · the deck and the video

## The two spreads, side by side

```
2026-09-03  (BUG-040, since closed)        2026-09-05  (this card)
  T1 recall    73.3 | 93.3 | 93.3   80      T1 recall    86.7 | 93.3 | 93.3   80    settled
  T1 precision 78.6 | 93.3 | 93.3   75      T1 precision 86.7 |100.0 |100.0   75    settled
  E1 recall    80.0 | 80.0 | 80.0   80      E1 recall   100.0 |100.0 |100.0   80    settled
                                            T4 precision 62.5 | 85.7 | 85.7   75    STRADDLES
                                            T4 recall    83.3 |100.0 |100.0   80

  C1 verdict:  PASS x2, FAIL x1              C1 verdict:  PASS x2, FAIL x1
```

**The verdict instability is identical. The fixture causing it is not.**

T1 and E1 — the two fixtures BUG-040 was about — are now comfortable. T4, which was comfortable
then, now drops to **62.5% precision** on one run in three against a 75% floor.

## Why this is a different card

BUG-040 read as a T1 problem and was closed as one. This is the same measurement saying something
narrower and worse: **C1 is not unstable in a fixture, it is unstable in a run.** The doer is
non-deterministic, the floor is evaluated per fixture per run, and *some* fixture will land under
it about one run in three. Fixing the fixture that happened to be under it last time moves the
straddle; it does not remove it.

That is the difference between a defect and a property, and this project had been treating it as
a defect.

## What must not happen

- **Do not re-run until it passes and publish that run.** That is the exact thing
  `spread.mjs` was built to make impossible, and `evals/README.md` rule 4 forbids it by name.
- **Do not tune the prompt tonight.** A prompt change requires a graded re-run, a graded re-run
  the night before release is how a working system gets broken, and tuning to make a floor
  pass is tuning to output (CLAUDE.md hard rule).
- **Do not lower the floor.** Obviously.

## What was done instead, on the night

The **deck says it**. Slide 9 — the honest-limitations slide that survives any cut — now leads
with this, because a release that shows its own eval case moving between runs is worth more
than one that quotes a median and hopes nobody re-runs it.

`deliverables/RELEASE.md` records the spread verdict as **PASS ×2, FAIL ×1**, not as PASS.

## The real fix, for after the release

Three candidates, in the order they should be tried:

1. **Report C1 as a range by construction.** The stranger currently emits a per-run verdict; the
   publication unit should be the spread, so a single run cannot be quoted at all.
2. **Ask whether a per-fixture floor is the right instrument.** A floor that some fixture
   crosses one run in three, with a median far above it, may be measuring variance rather than
   quality — and `evals/README.md` has no rule yet for what a *straddle* means for a gate.
3. **Only then** look at the prompt, with labels untouched and the spread as the gate.
