# BUG-059: A check that writes real sweeps, and a control that runs it six times

**Severity:** minor as a defect · major as noise — it produces a red row with a true message and a wrong cause
**Found:** 2026-09-04, `negative-control-strata` NC6 red in a sweep and red again alone, while `verify-strata` was green three times running
**Area:** `review-ui/scripts/verify-strata.mjs` · `review-ui/scripts/negative-control-strata.mjs`

## What happens

```
PASS  NC1   the check passes on the real sampler                      — exit=0
PASS  NC2   a stratum branching on doc_type turns the check RED       — exit=1
PASS  NC3   ... source_channel ...                                    — exit=1
PASS  NC4   ... authorship ...                                        — exit=1
PASS  NC5   CONTROL: a stratum on an outcome column is accepted       — exit=0
FAIL  NC6   and the tree is unchanged afterwards                      — exit=1
```

NC1 and NC6 are **the same command**. It passes at the top of the control and fails at the
bottom, having been run six times in between. Run on its own immediately afterwards,
`verify-strata` passes three times out of three.

## The mechanism, as far as it is established

`verify-strata` does not only read. It **opens real judge sweeps** — that is how it exercises the
sampler — so six invocations leave six sweeps in the database. A later run then meets state its
earlier selves created: a sweep still holding the lock, quotas already drawn, a newest sweep that
is one of the control's own.

**NC6 is not wrong.** Its claim is *"the plant was never written"*, and something plainly was.
What it caught is not the plant leaking but the check's own writes accumulating — a true failure
with a misleading name.

## Why it is the same disease with a new host

BUG-045: a check whose fixture is whatever the previous check left behind. BUG-054: two runs
tripping over each other. **This is a check tripping over itself**, six times, inside the control
written to prove it works. The exclusive lock does not help — these runs are sequential, and each
one is entitled to the database.

## The fix

1. **`verify-strata` should exercise the sampler on a copy**, as `verify-delta`,
   `verify-apply-delta` and `verify-routing` all do. A check that writes real judge sweeps into
   the live database to prove a property of sampling is paying for its evidence with production
   rows.
2. **Then NC6's assertion becomes true again** — and it should say what it means: *the plant left
   nothing behind*, tested by comparing the sampler's declared strata before and after, not by
   re-running the whole check and hoping for exit 0.
3. **Count the sweeps this has already created.** `judge_sweeps` rows made by verification runs
   sit in the same table the judge coverage figures are computed from (`GET /api/judge`), which
   is the BUG-055 problem in a second place: a denominator quietly filling with test data.

## Not established

Whether the accumulation is the whole story. The reproduction is "run the control twice" and it
has not been narrowed further than that — stated so the next person does not inherit a guess as
a finding.

---

## New observation, 2026-09-05 — it is now **NC1** that fails, not NC6

```
FAILED:
  review-ui\scripts\negative-control-strata.mjs
      FAIL  NC1   the check passes on the real sampler  — exit=1
```

`verify-strata` run alone immediately afterwards: **27/27**.

NC1 is the control's **first** invocation. It failing means the tree was already dirty *before
the control started* — so the leavings do not merely accumulate within one control run, they
**survive between runs**. Two sweeps earlier today were green on this file; this one was not, and
nothing about the sampler changed in between.

That widens the card. The fix cannot be "reset between cases inside the control": whatever the
control leaves has to stop existing, or `verify-strata` has to stop writing real judge sweeps at
all. The second is the honest direction — the rows land in `judge_sweeps`, which is where the
judge coverage figures come from, and a check that writes into the table its own figures are
drawn from is the shape of BUG-001.
