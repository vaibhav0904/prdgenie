# BUG-040: C1 is not settled — T1 recall crosses its floor one run in three

**Severity:** major (as a *reporting* fact) · **Filed:** 2026-09-04, by the first real spread
**Found by the instrument built to find it** (E2-S4), on its first honest run.

## What the three runs say

`evals/results/2026-09-03-spread.md`, three full produce-and-grade rounds, prompt
`7f9c3916173e`, model `gpt-4.1-mini`:

| fixture | metric | min | median | max | floor | |
|---|---|---|---|---|---|---|
| T1 | recall | **73.3%** | 93.3% | 93.3% | 80% | **STRADDLES** |
| T1 | precision | 78.6% | 93.3% | 93.3% | 75% | |
| N1 | recall | 83.3% | 100% | 100% | 80% | |
| E1 | recall | 80.0% | 80.0% | 80.0% | 80% | **exactly on it, all three runs** |

**C1's verdict itself moved: PASS ×2, FAIL ×1.**

## Why this is a card and not a failure

Nothing regressed. The prompt is unchanged, the labels are unchanged, and the median is
comfortably above the floor. What changed is **what may be said out loud**: until now C1 has
been quoted from single runs, and a single run of T1 has a one-in-three chance of landing
below the line.

**No figure from C1 may be published without this range beside it** (docs/reporting.md rule 6).
That applies to the deck, the video, the charter and any quoted result file.

## Two separate findings, and the second is quieter

1. **T1 recall varies by twenty points between runs.** Same prompt, same document,
   temperature 0. That is the extraction of one long argumentative transcript being genuinely
   unstable, not measurement noise in the grader — the grader is deterministic (C3, and
   `verify-grading` 12/12).
2. **E1 recall is exactly 80.0% in all three runs, and the floor is 80%.** It does not
   straddle, so nothing flags it — but a metric resting *on* its floor is one missed
   requirement away from failing, and it has no headroom at all. It is named here so that a
   future run failing E1 is not read as a surprise.

## What must NOT happen

- **The floor does not move.** Ever, and especially not to accommodate a range discovered
  after the fact (`CLAUDE.md`, hard rules).
- **The labels do not move.** T1's answer key was written before any tuning.
- **A wider spread is not a fix.** Running it five times and quoting the median is the same
  lie with a bigger denominator.

## The investigation, when this is taken

1. Read the three T1 result files side by side and identify which labelled requirements were
   missed in the failing run and not in the others. `evals/results/2026-09-03-C1-run*.md`.
2. If the misses are the same one or two items, this is a known-hard-item problem and belongs
   with BUG-023's territory (a commitment inside an argument). If they are different items
   each time, it is instability and the honest response is to say so in the deck rather than
   to chase it.
3. Only then decide whether anything is worth changing. **PRD-E2's iteration budget applies:
   three attempts per diagnosis, then stop and file the pattern.**

## Verified by
- three consecutive full runs, produced and graded by `evals/harness/spread.mjs`
- the same instrument, on prepared results, detects a straddle it was given
  (`SPREAD_INJECT` control) and reports none when there is none

## Decided and diagnosed, 2026-09-04 — publish the range, change nothing

Vaibhav delegated this decision. **The verdict is option A: publish the range, do not chase
it, and do not run it again until it looks better.**

### The investigation the card asked for, performed

Steps 1 and 2 of "The investigation, when this is taken", against
`evals/results/2026-09-03-C1-run29/30/31.md`:

| run | T1 recall | missed |
|---|---|---|
| 29 | 93.3% pass | `T1-R15` |
| 30 | 93.3% pass | `T1-R15` |
| 31 | **73.3% FAIL** | `T1-R15`, `T1-R07`, `T1-R10`, `T1-R11` |

**The misses are not the same set, and that settles which branch this is.** One item —
`T1-R15`, the constraint restating the two-second chart budget at Northwind's forty-one-million-row
scale — is missed in **every** run. It is a restatement of an existing NFR under a different
kind, which is BUG-023/030/037's family: the kind-confusion territory this project already
knows it spends its prompt budget on.

The other three appear only in the failing run: the CSV export, role-scoped data access, and
the audit log. Three items that are present twice and absent once is **instability**, and the
card is explicit about what that means: *"the honest response is to say so in the deck rather
than to chase it."*

### Why publishing beats fixing, in one line each

- **The floor does not move**, and a floor adjusted after seeing the range is not a floor.
- **The labels do not move.** T1's answer key predates every prompt.
- **A wider spread is not a fix** — five runs and a median is the same claim with a larger
  denominator hiding it.
- **Chasing three unstable items would be tuning to a single run.** PRD-E2's iteration budget
  exists to stop exactly that, and nothing here has been diagnosed to a cause worth three
  attempts.

### What the deck says, and it is not a hedge

> C1's T1 recall is **73.3 / 93.3 / 93.3** against a floor of 80 — **PASS twice, FAIL once**.
> One requirement is missed every time; the other three misses come and go. We are reporting
> the range because a single run is a diagnostic and only a range is a number, and because the
> floor was written before the measurement and does not move to meet it.

**This is the strongest slide in the deck, not the weakest.** A project that shows a metric
straddling its own floor, with the instrument that found it and the rule that stops it being
tuned, demonstrates more than one showing only green.

### Consequently

- Closed as **diagnosed and decided**, not as fixed. Nothing in the pipeline changed.
- `T1-R15` is recorded as a **known stable miss** and belongs with the kind-confusion family
  if anyone works it later. It is not worked here.
- The reporting rule that produced this — *a single run is a diagnostic, only a range is a
  number* — is already `docs/reporting.md` rule 6 and needed no change.
