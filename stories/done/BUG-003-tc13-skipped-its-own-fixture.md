# BUG-003: TC13 reported PASS while silently skipping the one fixture it exists to check

**Found while:** E1-S3, running TC13 for the first time
**Severity:** major

## Repro

1. `.\run.cmd evals/harness/produce.mjs` — all nine fixtures ingest.
2. `.\run.cmd evals/harness/verify-labels.mjs --stored`

## Expected / Actual

- **Expected:** all nine fixtures checked — especially **H2**, since TC13 exists to prove
  labels still resolve after the door rewrites text, and H2 is the PII fixture where
  redaction actually rewrites it.
- **Actual:** `PASS  TC13 … 8 fixtures checked; 0 broken`. Green, and H2 was never checked.

## Root cause

`verify-labels.mjs` matched an authored fixture to its stored row by comparing the first
60 characters of `raw_text`. For eight fixtures that works. For H2 it cannot: redaction
replaces an email address inside those first 60 characters, so the stored text no longer
starts with the authored text, the match fails, and the loop skips it.

The check then reported success over the remaining eight. **A skipped case and a passing
case were indistinguishable in the output**, which is the same defect as BUG-001 wearing
different clothes: the check could not fail in the situation it was written for.

## Fix

Two changes, one structural and one about honesty:

1. **`produce.mjs` writes a run manifest** — `evals/results/.last-run.json`, mapping each
   `fixture_id` to the `doc_id` and `trace_id` it became. Grading and label-checking join
   on that instead of guessing from text. Identifying a run by inspecting its content was
   always going to be fragile; the run should say what it is.
2. **`verify-labels.mjs --stored` fails when a fixture cannot be checked.** Coverage is
   asserted, not assumed: if fewer than nine fixtures resolve, the row goes red and names
   the missing ones. "Checked 8 of 9" is now a failure, not a footnote.

## Lesson

**A check that can silently skip its subject is a check that cannot fail.** BUG-001 was
the same shape — a script that repaired what it verified — and the lesson was recorded as
"run the negative control". That was necessary and not sufficient: TC13's negative control
would have passed too, because corrupting a *checked* fixture's quote does go red. What
was missing is the second question.

The rule, now in CLAUDE.md: **a check must assert its own coverage.** Report how many
subjects were examined, compare that to how many exist, and fail on the gap. Anything that
reports only "0 broken" is hiding its denominator — and the denominator is where the
skipped case lives.

Worth noting where this would have gone: H2 is the fixture behind C2's 100% PII floor.
Had this survived, that floor would have been computed over a fixture nothing ever
verified, and the number would have looked perfect for the wrong reason.
