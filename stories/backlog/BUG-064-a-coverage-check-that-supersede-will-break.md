# BUG-064: A coverage check that the first real supersede will break

**Severity:** minor today, and a guaranteed red row the moment the chain is used
**Found:** 2026-09-05, during E6-S3, from a red sweep whose cause turned out to be something else
**Area:** `review-ui/scripts/verify-metrics.mjs` TC3 · `docs/metrics.md` M4

## What happens

M4 is cycle time from `ingested` to `approved`, and its coverage row reads:

```js
ok('TC3', 'M4 counts every approved version, not every trace',
  mins.length === get("SELECT COUNT(*) AS n FROM prd_versions WHERE state='approved'").n, ...
```

M4's observations come from `approved` **events**. The comparison is against versions currently
in **state** `approved`. Those two agreed for the whole life of the project because nothing had
ever left that state.

E6-S3 makes versions leave it. A superseded version keeps its `approved` event — it *was*
approved, and being superseded later does not unapprove it — but drops out of the state count.
So the first PRD that reaches a second approved version turns this row red, and the message it
prints will say M4's coverage is wrong when M4 is fine.

Today `superseded` is 0, so it is green. That is the only reason.

## Which side is wrong

**The check.** M4's population is right: a version that was approved and later replaced still had
a cycle time, and dropping it would make the median describe only the PRDs nobody has revised —
the flattering half. The comparison should be against versions that have **ever** been approved:

```sql
WHERE state IN ('approved', 'superseded')
```

## The fix

1. Compare against `state IN ('approved','superseded')`, with the sentence saying why: a
   supersede is not an un-approval.
2. Say the same thing in `docs/metrics.md` beside M4, because a reader of the figure needs to
   know whether replaced PRDs are in it. They are.
3. Ask the same question of every other metric whose population is a **state** rather than an
   event — M1, M2, M3 and M5 all count something, and `superseded` is a new value for all of
   them. Derived, not eyeballed: one query per metric, listing which states its denominator
   admits, printed in the check.
4. A row that forces it: supersede something and assert the metric does not move. A coverage
   check that only ever runs on data with no superseded rows in it is a check that has not been
   tested against the state machine it describes.

## Not a fix

Excluding superseded versions from M4. That would make the cycle-time median describe only PRDs
that were never revised — and the whole point of E6 is that PRDs get revised.
