# BUG-021: `verify-refusal` fails on its second run, because it reads its own leftovers

**Found while:** E3-S4, running the existing verifiers as a regression sweep
**Severity:** major — a verifier that reports FAIL on a working system is the BUG-017
disease, and this one reports it on *every run but the first*

## Repro

```
.\run.cmd review-ui/scripts/verify-refusal.mjs      11/11 passed
.\run.cmd review-ui/scripts/verify-refusal.mjs       9/11, REFUSAL VERIFICATION FAILED
```

Nothing changes in between. Running it twice is the repro.

## Expected / Actual

- **Expected:** 11/11, repeatably. G1 parks; the check says so.
- **Actual:** on the second run, TC1 reports `park_reason=null, kept=1` and TC1b reports
  `document_subject=undefined` — as though the refusal had stopped working.

**It has not.** The pipeline parks G1 correctly every time. The verifier is looking at the
wrong version.

## Root cause

TC1 finds its subject like this:

```js
const parkedVersion = (docId) => get(
  `SELECT ... FROM prd_versions
   WHERE trace_id = (SELECT trace_id FROM source_documents WHERE doc_id = ?)
   ORDER BY prd_version_id DESC LIMIT 1`, [docId]);
```

**"The most recent version on this trace"** — and later cases in the same file create more
versions on that same trace. TC2 drives a contradiction through `/internal/assemble`, and
another case assembles G1 with a forced `concerns_product: true`, which produces an
`in_review` version. On the next invocation, TC1 picks *that* up.

Seven versions now sit on the fixture's trace, alternating park, park, in_review:

```
 88 draft     no_requirements_found   {"parked":true,"requirements":[]...      <- the real one
 90 draft     no_requirements_found   ...requirements":[{"req_id":"REQ-001"    <- TC2's
 91 in_review null                    {"product_id":"forgesight"...            <- TC8's, and what TC1 now reads
205 draft     no_requirements_found   ...
206 in_review null                    ...
208 draft     no_requirements_found   ...
209 in_review null                    ...
```

It also reads a **stale manifest**, `evals/results/.bug004.json`, whose `prd_version_id` is
`null` — written before BUG-017 taught `park()` to return its version id. So even the
manifest could not have told it which version to look at.

## Why it matters

**This is BUG-001's family, and the third member.** BUG-001: a check that repaired what it
checked, so it could never fail. BUG-017: a check that could not observe success, so it could
never pass. This one: **a check whose own later steps change what its earlier steps read.**

All three come from the same place — the check and the thing checked disagreeing about where
the truth is, or about who is allowed to touch it.

And it hid the same way BUG-001 did: **nobody ran it twice.** It reported 11/11 when it was
written, the story was promoted on that, and the second invocation was three weeks of work
later.

## Fix — not yet applied

Address the version **by id, from the run manifest**, exactly as C2 was taught to after
BUG-017 — and read `.last-run.json` rather than a manifest frozen at one story. A version id
is unambiguous; "the newest row that shares this trace" is a guess that other code can
invalidate.

The stronger form, worth considering while it is open: **the cases that create versions
should say so**, and the file should assert at the end that it created exactly as many as it
meant to. A verifier that writes to the database it is inspecting needs to account for what
it wrote.

**Re-run when:** any change to `assemble.mjs`'s park path, and **twice in a row, every time**.

## Lesson

**Run every check twice.** Once proves it can pass. Twice proves it does not disturb what it
measures. The negative-control rule this project already has says run it in the failing
direction; this adds the cheaper sibling — run it again, unchanged, and require the same
answer.

## Fix applied — 2026-09-02

`verify-refusal.mjs` now reads **`.last-run.json`**, not a manifest frozen at BUG-004, and
addresses versions **by id**:

- TC1 uses `G1.prd_version_id` from the current run — available because BUG-017 taught
  `park()` to return it.
- TC3 uses the id **TC2's own envelope returned**, rather than "the newest version on this
  trace", which is what it was really trying to say.

`ORDER BY prd_version_id DESC LIMIT 1` is gone from the file.

**Controlled by repetition, which is this bug's own test:** three consecutive invocations,
**11/11 every time.**

## And then the same sweep found a second one

Every verifier in the project was run twice and its output compared. Eleven were identical.
One was not:

```
verify-signoff.mjs    run 1: 9/9 passed     run 2: 8/9 passed
```

`TC11` asserted *"an approved event is written on the version trace_id"* as
`events.length === 1`. But `events` has **no version column**, several versions can share one
`trace_id` — `verify-refusal` leaves `in_review` siblings on the fixture's trace — and so the
assertion was about the whole history of that trace rather than about the sign-off it had
just performed. One sign-off ever: pass. Two: fail.

Fixed by counting before and after and asserting the **delta is exactly one**, which is what
the row always meant. Three consecutive runs now report `0 before, 1 after`, `1 before,
2 after`, `2 before, 3 after` — **9/9 each time**.

**Two of twelve verifiers had it.** Neither was found by writing tests; both were found by
running what already existed a second time.

## Lesson

**Run every check twice.** Once proves it can pass. Twice proves it does not disturb what it
measures, and that what it measures is this run rather than the accumulated history of the
database.

The project already had the harder half of this rule — run the negative control, prove the
check can fail. This is the cheaper half, it takes seconds, and it caught two live defects
in instruments that had been reporting green for weeks.
