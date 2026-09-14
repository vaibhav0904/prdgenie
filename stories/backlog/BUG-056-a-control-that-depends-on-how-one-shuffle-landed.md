# BUG-056: A control that depends on how one shuffle landed

**Severity:** minor as a defect · the finding is that a control's verdict is a coin toss
**Found:** 2026-09-04, `verify-strata` TC19c red inside a sweep and green alone, minutes apart
**Area:** `review-ui/scripts/verify-strata.mjs` TC19b/TC19c

## What happens

```
FAIL  TC19c  CONTROL: walked in stratum order, the same 8 items collapse toward one stratum
             — 3 stratum/a in the first 8
```

Run alone, immediately afterwards: **PASS**, same wording.

TC19b takes the newest real judge sweep, looks at the first 8 items of its **shuffled** draw and
requires them to span more than one stratum. TC19c is its control: the same items sorted into
stratum order must span fewer.

```js
say('TC19c', J.stratumRuns(inStratumOrder) === distinct && oldPrefix < prefixStrata, ...)
```

`prefixStrata` is a property of **one particular shuffle of one particular sweep**. WF6 runs on
cron, so the sweep this reads changes underneath it, and a shuffle that happens to put few strata
in its first 8 makes `oldPrefix < prefixStrata` false. Nothing is wrong with the sampler when
that happens — the draw was simply unlucky.

## Why it matters more than one flaky row

The claim being controlled is *shuffling stops a partial answer from collapsing into one
stratum* (E7-S6, BUG-042). That is a claim about a **distribution**, and it is being tested with
a single sample. A single sample cannot support it in either direction: the green runs are as
uninformative as the red one.

This is the same disease as BUG-045 in a different organ — **a verdict that depends on ambient
state rather than on the code** — and the same lesson the clause control learned the hard way
(BUG-048): *a stochastic claim needs several runs, and re-rolling until it agrees is how a
control becomes decoration.*

## The fix

1. **Build the draw, do not find it.** Construct a known set of items across known strata and
   shuffle *that*, so the fixture is the same every run.
2. **Assert over several shuffles, not one.** With a fixed corpus the expected number of strata
   in a prefix is computable; assert the average, or assert that the shuffled ordering beats the
   stratum ordering in *most* of N runs, with N and the threshold stated.
3. If a seed is used, **say so and pin it** — `JUDGE_SHUFFLE_SEED` already exists. A seeded run
   is reproducible, which is the opposite of what this row currently is.

## Not a fix

Loosening TC19c to `oldPrefix <= prefixStrata`. That would make the control pass on exactly the
draws that prove nothing.
