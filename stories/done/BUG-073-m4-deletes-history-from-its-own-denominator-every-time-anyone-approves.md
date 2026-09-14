# BUG-073: M4 deletes history from its own denominator every time anyone approves

**Severity:** major · a published metric that silently shrinks, and it is on slide 7
**Found:** 2026-09-07, when one rehearsal moved the figure from 1.81 min to 0.00
**Area:** `review-ui/metrics.mjs` — M4, and M5 by the same join

## The defect

M4 is the median minutes from `ingested` to `approved`, over versions **whose state is now
`approved`**:

```sql
WHERE v.state = 'approved'
```

Approving a version **supersedes** every other approved version of that PRD — correctly, in the
same transaction (E6-S3). Those rows become `superseded`, so they leave M4's population. The
approval that just happened does not add one row and remove none; it adds one and removes every
earlier one for that PRD.

**A cycle-time metric that forgets a version the moment a newer one is approved.** The healthier
the version chain, the smaller the denominator.

## Measured, not argued

One rehearsal — sign off `v1431`, send T2 at `PRD-forgesight` — superseded 20 versions:

| | before (2026-09-05) | after one rehearsal |
|---|---|---|
| M4 across everything | 0.02 min, n=118 | **0.00 min, n=108** |
| M4 across the pipeline | 1.81 min, n=36 | **0.00 min, n=17** |
| M5 across the pipeline | $0.0023, n=36 | $0.0019, n=17 |

The pipeline population more than halved and the median went to zero, from **one** demo run. M5
shares the join and moves with it.

## Why this is the same disease as BUG-065, one level down

BUG-065 found that the population was wrong — most approved versions were minted by verifiers.
The fix was to publish both populations and derive membership from whether a model was called.
That fix is intact and correct.

**This is the other half: the population is not only mixed, it is unstable.** It changes when
nothing about the past changed. A figure that moves because of an unrelated approval is not a
measurement, and the two-population split cannot save a denominator that leaks.

## Fixed — 2026-09-07

The definition already said it: *"over versions that **reached** approved"*. Every one of these
sites already joined the `approved` **event**, which is the fact that it happened and never stops
being true, and then filtered on `state='approved'` **as well** — a second, different question
bolted onto the first. The join was always the filter. The extra clause was the bug.

So the clause is gone from all seven sites, and the rule it encoded is named once:

```js
export const REACHED_APPROVED = (v = 'v') =>
  `EXISTS (SELECT 1 FROM events e
     WHERE e.name = 'approved' AND e.detail = 'prd_version_id=' || ${v}.prd_version_id)`;
```

**No definition changed and `docs/metrics.md` needed no edit** — which is the test of whether this
was a fix or a tuning. A metric whose published definition has to be rewritten to make a checker
green is a metric being bent to its output. This one was brought back to the definition it already
had.

| | before the fix | after |
|---|---|---|
| M4 across everything | 0.00 min, n=111 | **0.02 min, n=131** |
| M4 across the pipeline | 0.00 min, n=17 | **2.00 min, n=37** |
| M5 across the pipeline | $0.0019, n=17 | **$0.0026, n=37** |
| minted by verifiers | 94 of 111 (84.7%) | 94 of 131 (71.8%) |

### The same mistake was in four implementations, and the fourth is why it was found

`review-ui/metrics.mjs` shipped it. `recompute-metrics.mjs` had it in M5 but **not** in M4 —
its M4 reads the events alone — and that single difference is the entire reason this defect is
known. Two derivations, one of them right, and the disagreement is the alarm.

`verify-populations` TC5 and `verify-metrics` TC3 each carried their own copy and each had to be
corrected: TC3 was demanding that M4 forget every superseded version, which is to say **the case
written to catch this class of error had the error in it.**

That is the shape worth remembering: *an independent implementation is only independent where it
actually differs.* Three of the four agreed, and three of the four were wrong.

## It was carded before it was fixed, and that order mattered

The first response to this was a card and a slide saying the sweep was 70 of 73 and why —
**not** an edit. That was right at the time: `recompute-metrics` prints *"A DISAGREEMENT IS A BUG
CARD, NOT AN EDIT. Two derivations differing means one of them is wrong, and which one is a
question to answer before either number is shown to anybody"*, and the question had not been
answered yet.

Answering it is what made the edit legitimate. The state column says *what is current*; the event
says *what happened*; M4 asks a question about history and was reading a column about the present.
Once that is written down, the change follows from the diagnosis instead of from the red check —
and the test of the difference is that **no published definition had to move**.

## Blast radius, checked

- **M1, M2, M3** do not join on `prd_versions.state` and were not affected. They moved on the day
  only because the rehearsal added 27 real review actions, which is them working correctly.
- **M5** shares M4's join and was fixed with it.
- `uncomfortable`'s "PRD versions that never reached approved" read the state column too, and so
  counted every **superseded** version as one that never got approved — the opposite of what
  happened to it. Fixed with the same predicate.
- Slide 7 has been refreshed and its callout now carries both population findings.

## Still open, and the reason to keep reading this card

**No control fails on this.** Nothing plants `state='approved'` back into the M4 SQL and requires a
checker to go red. Four implementations agreeing is evidence, not a guarantee, and three of them
agreed while being wrong less than an hour ago. This belongs with the **19 of 51 checkers that
have no control** (slide 8).
