# E2-S2: A number for extraction quality, produced by arithmetic and nothing else

**As a** builder
**I want** recall and precision against the labels, computed with no model and no tuned parameter anywhere in the instrument
**So that** the headline quality claim is arithmetic over stored rows rather than an opinion

## Acceptance criteria

- [ ] `npm run eval` grades every implemented case and **exits non-zero when one fails** —
      proven by deliberately degrading extraction and watching the command go red, then
      restoring.
- [ ] With no run in the database, the harness prints the exact `npm run produce` command
      needed and exits non-zero. It does not throw a stack trace and does not report
      success.
- [ ] Case **C1** exists at `evals/cases/C1-extraction-quality.md` with its threshold
      (recall ≥0.80, precision ≥0.75), its auto-fail rule stated separately, the story ids
      it gates, `Automated? YES`, and a *re-run when:* list.
- [ ] Matching is by **span overlap** (ADR 0008): an extracted requirement matches a label
      when one of its citation spans overlaps a labeled region and the `kind` agrees. No
      string similarity, no embeddings, no model, no threshold in the matcher.
- [ ] Two extracted requirements overlapping one label score as one match and one false
      positive — over-splitting is a real defect and is counted as one.
- [ ] C1 grades **T1 and T3** (requirements only; T3's conflicts wait for E3), reporting
      each fixture separately rather than as one average.
- [ ] The result lands in `evals/results/YYYY-MM-DD-C1.md` with the dataset size, the
      graded version, score vs threshold, a per-item diff table naming every miss and every
      false positive, and a `## Verdict:` line. Result files are never overwritten.

## Depends on
- E2-S1

## Eval gate
- **C1** — this story builds it and must leave it passing. Per PRD-E2: if it fails, at most
  **three prompt iterations**, then file a BUG card naming the *failure pattern* — what
  kind of requirement is being missed, not "recall is low". The threshold never moves and
  labels are never edited.

## Technical notes

- **The harness must not call a model provider, for any purpose including matching**
  (ADR 0004, ADR 0008). A single provider call inside the stranger would make the headline
  accuracy figure a model's opinion — the exact thing this project refuses everywhere else.
- Grading reads the database; it never re-runs the pipeline. Separation is the rule
  (`evals/README.md` rule 3).
- A label lists **every** region its requirement was stated in (E1-S3), so a correct
  extraction citing the second mention still matches. If recall looks bad, check label
  alignment before diagnosing extraction — labels written against pre-redaction text would
  misalign silently.
- **Run the negative control once** and record it: degrade extraction deliberately, confirm
  C1 goes red, restore. An untested check is an assumption (BUG-001).
- Quality iteration belongs here, not in E1-S4. This is the first story where a change to
  the extraction prompt can be judged rather than guessed at.

---

## Outcome — promoted 2026-09-02

**12 of 12 test rows Pass.** The instrument works and its own verification (`verify-grading`)
is 9/9 including three negative controls. C1 passes on both graded fixtures, three
consecutive runs at prompt `7267c39b005e`: T1 93.3% recall / 93.3–100% precision, T3 100% /
77.8%.

**Signed off by Vaibhav on 2026-09-02**, on the recommendation that E2-S2 promote and E2-S3
hold. C1's judgment half — *is this ground truth correct?* — was answered in the same sitting
through the E1-S3/S4/S6 review page, which is the G6 criterion this story needed.

### What this story actually delivered, and what it did not

**Delivered:** a measurement nobody can argue their way out of. Span-overlap matching with no
similarity metric, no embedding, no threshold and no model anywhere in the stranger; per-fixture
reporting rather than an average that hides a failure; a per-item diff naming every miss and
every false positive by id; result files that are never overwritten; a non-zero exit; and a
coverage assertion so a skipped fixture fails the case instead of vanishing (BUG-003).

**Not delivered: a better extractor.** TC12 turned green on a corrected answer key, not on
improved output. Three prompt iterations before that moved T1 from 64.3% to ~93% and left T3
stuck at 66.7% precision in every run. The label review then showed that one of T3's three
false positives was never an error — the model was reporting a scope decision correctly and
being scored as inventing it.

### The lesson this story is worth remembering for

**Three prompt iterations were spent tuning against a number that was measuring the wrong
thing.** The card's own instinct was right — *"the extractor is finding the argument correctly
and filing it in the only drawer it has"* — and the count was wrong, because the answer key
had never been read against the transcript by a human.

The review that caught it took one sitting. It could have been run before any of the three
iterations. **A label review is cheaper than a tuning cycle and strictly more informative** —
and this story is the evidence, because it paid for both and only one of them told the truth.

### Known-open at promotion, deliberately

- **BUG-007** — C1 is green and still contains the defect it was built to name. T3's two
  remaining false positives are both sides of T3-Q01. **E3-S4 is the fix** and is next.
- **BUG-016** — requirement wording restates the room instead of specifying the build.
  Invisible to C1 by construction: matching is by span, so wording cannot move the score.
- **T1-R05** has never been found, in eight graded runs of the current prompt.
