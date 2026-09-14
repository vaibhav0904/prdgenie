# BUG-017: C2 cannot recognise the refusal it exists to check

**Found while:** BUG-004, immediately after the fix worked — checking what C2 would make of it
**Severity:** major — the case that gates E2-S3 would have failed the system for behaving
correctly, and the obvious response would have been to "fix" the working code

## Repro

1. Ingest and generate **G1**, with the BUG-004 fix in place. It correctly parks:
   `park_reason = no_requirements_found`, zero requirements.
2. Grade C2.

## Expected / Actual

- **Expected:** C2's refusal rule passes. Zero requirements from a requirement-free document
  is the entire point of the rule.
- **Actual:** it fails.

C2 computes:

```js
const g1Version = g1?.prd_version_id ? ctx.version(g1.prd_version_id) : null;
const g1Count   = g1?.prd_version_id ? ctx.requirements(g1.prd_version_id).length : null;
const g1Parked  = g1Version?.park_reason ?? null;
const g1Clean   = g1Checked && g1Count === 0 && g1Parked === 'no_requirements_found';
```

The manifest records `prd_version_id: null` for a park. So `g1Count` is `null`, `null === 0`
is false, and `g1Clean` is false **however correct the behaviour was**.

## Root cause

`assemble.mjs`'s `park()` wrote a `prd_versions` row and did not return its id. The park
envelope carried `reason` and `requirements_kept` but no `prd_version_id` and no `state`, so
`produce.mjs` — which reads exactly those fields — recorded `null`, and C2 had nothing to
look the version up by.

Every park since E1 has been recorded this way. It was invisible because **until today no
fixture had ever parked in a passing run**: G1 always produced requirements, which is the bug
C2 was watching for, so the failure path was always failing for the *other* reason.

## Why it matters more than it looks

**A green case that cannot go green for the right reason is worse than a red one.** Had this
not been checked before the run, C2 would have reported FAIL on the refusal rule, on a run
where the refusal was perfect. The natural next move is to go and look at the *fix* — and the
fix was fine. That is an hour spent doubting working code because the instrument could not
see it.

It is also the mirror image of BUG-001. There, a check repaired what it checked and so could
never fail. Here, a check cannot observe success and so can never pass. Both come from the
same place: **the check and the thing checked disagreeing about where the truth is stored.**

## Fix (applied in BUG-004)

`park()` now returns the version it created, and the envelope carries `prd_version_id`,
`state` and `total` alongside `reason`. `produce.mjs` needed no change — it was already
reading those fields and getting nothing.

A park is an outcome like any other: it creates a version, and a caller that cannot name that
version cannot check it.

## Negative control

**Run, both directions — `.\run.cmd evals/harness/negative-control-refusal.mjs`, 7 of 7.**

```
G1 in this run: prd_version_id=382, park_reason=no_requirements_found, total=0
  PASS  the park recorded its version id (the BUG-017 fix)
  PASS  the park names the right reason
  PASS  C2's refusal rule passes in 2026-09-02-C2-run39.md (exit 0)
  PASS  with the version id removed, C2 fails the refusal rule again (2026-09-02-C2-run40.md)
  PASS  and the report says "null" — the tell that it could not see the version, not that
        the system misbehaved
  PASS  evals/results/.last-run.json restored byte-for-byte (2588 bytes)
  PASS  the refusal rule passes again (exit 0)
```

The control edits the manifest in place and restores it in a `finally`, then byte-compares —
and it reads the verdict out of the **result file**, newest by modification time, because
sorting result filenames puts `-C2.md` after `-C2-run9.md` and would have read the oldest
file in the set. A control that reads the wrong file asserts nothing, which is the disease
this card is about.

**Card closed on this run.** It was fixed inside BUG-004 and had been sitting on the only
thing it still needed.

## Lesson

**A pass condition that has never once been met is not a tested pass condition.** Every rule
in C2 had been exercised in its failing direction — hallucinated citations, surviving PII,
requirements from nothing — and the refusal rule's *passing* direction had never happened, so
nothing had ever verified that it could.

Worth generalising: `evals/README.md` rule 6 says a failing case must fail loudly. The
corollary this bug adds is that **a case must be shown to pass for the right reason at least
once**, and a rule whose success has never been observed should be treated as unverified
rather than as working.
