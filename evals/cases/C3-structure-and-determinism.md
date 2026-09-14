# C3 — structure and determinism

**Automated?** YES — `evals/harness/cases/C3.mjs`, run by `.\run.cmd evals/harness/grade.mjs C3`
**Fixtures:** every fixture that produced a version — all ten on a full run
**Gates:** E3-S1, E3-S2, E3-S3, E3-S5
**Written:** 2026-09-02

## What this case measures

Two things, and the second is why it exists.

**1. Every link resolves.** Story → feature, feature → epic, acceptance criterion →
requirement, feature's `req_ids` → requirement, factors → feature. **Threshold 100%, no
partial credit.** An orphan is a row pointing at something that is not there, and a document
full of them looks complete until somebody clicks.

**2. Every stored `priority_score` equals RICE recomputed from its stored factors.**
**Threshold 100%.** A mismatch is not a rounding argument — it is the signature of some other
code path having written a score, and *"the model never writes a number that ships"* is the
single strongest claim this product makes.

The arithmetic in the case is **written out again**, not imported from `structure.mjs`. A case
that called the function it grades would agree with itself by construction — the disease
BUG-001 was filed for. Nine characters of duplication buy an independent check.

## What this case deliberately cannot see

**C3 checks that the structure is well-formed. It says nothing about whether it is any good.**

A clusterer that puts one requirement into each of thirty features produces a perfectly linked
document with no grouping in it, and every check above passes.

So the result file prints, **with no threshold attached**:

- requirements · features · epics
- **requirements per feature**
- features per epic

**A ratio near 1.0 requirement per feature means the grouping is nominal** — the structure
exists and does no work. That is a **BUG card, not a threshold**: a cap on feature count would
be a number chosen to make the fixtures look grouped, and E3-S1 says so in as many words.

This paragraph was written into the case **before its first real run**. On that run the ratio
was **1.00**, and it is now BUG-026.

## Verdict rules

| Outcome | When |
|---|---|
| **FAIL** | any orphan · any score that does not recompute · a version whose content cannot be read · coverage gap · **zero factors stored** |
| **PASS** | everything resolves and every score matches |

**Zero factors is a FAIL, not a pass.** "Every score matched" over no scores is not a result,
and this case has one job that only exists when there is something to recompute.

## Negative control

`.\run.cmd evals/harness/negative-control-c3.mjs`, both directions, 6 of 6.

One stored score is changed by **0.1** in the database; C3 must go red, **name the feature**,
and print both the stored and the recomputed value. The score is restored in a `finally` and
the value compared, because a verifier may not leave a row another verifier reads as a defect.

Observed: `FAIL` naming `603-FEAT-001`, *stored 2.7, recomputed 2.6*; restored; `PASS`.

## Re-run when

- `n8n/prompts/cluster-epics-features.md`, `draft-stories.md` or `extract-priority-factors.md`
  changes
- `review-ui/structure.mjs` or the assembly path changes
- Anything writes to `features`, `stories`, `epics` or `priority_factors`
- BUG-026 is worked on
