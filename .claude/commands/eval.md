---
description: Run an eval case against the labeled dataset and archive the result
---

Run the eval named in $ARGUMENTS (no argument = all applicable cases):

1. Read the case definition in `evals/cases/<name>.md` and the labels in
   `evals/datasets/`.
2. Ensure the dataset has been replayed through the system (replay it if the
   results are stale). **Grading and running are separate steps** — if there is
   no run to grade, say so and print how to produce one.
3. Pull actuals from the system of record, compare to labels per the case's
   method.
4. Write `evals/results/<YYYY-MM-DD>-<case>.md`: metrics vs threshold, per-item
   diffs, PASS/FAIL verdict.
5. If this eval gates a story currently in progress, update that story's
   `.tests.md` row for this case with the verdict and a link to the result file.
6. **On FAIL: diagnose the top failure pattern and file a BUG card; do not tune
   the labels to fit the output.**

If a single run and a re-run disagree, report the spread, not the better run.
