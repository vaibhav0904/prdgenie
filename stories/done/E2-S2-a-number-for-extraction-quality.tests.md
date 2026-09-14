# Test cases: E2-S2 A number for extraction quality

Written before any build work, per gate G3.
The instrument's own checks are re-runnable as
`.\run.cmd evals/harness/verify-grading.mjs`;
the case itself runs as `.\run.cmd evals/harness/grade.mjs C1`.

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | With no run in the database, the harness says so and prints the command to produce one | Names `produce.mjs`, exits non-zero, **no stack trace and no success** | **Pass** | exit=1, names `produce.mjs`, no stack trace |
| TC2 | Case C1 exists and is complete | Threshold, auto-fail rule stated separately, gated stories, `Automated? YES`, `Re-run when:` | **Pass** | `evals/cases/C1-extraction-quality.md`; `Re-run when:` has 8 entries incl. the BUG-007 addition |
| TC3 | Matching is span overlap and nothing else | No string similarity, no embedding, no distance, no tuned constant in the matcher | **Pass** | No similarity, distance, embedding or stemming in `match.mjs`, `grade.mjs`, `cases/C1.mjs` |
| TC4 | **Over-splitting counts as one match plus one false positive** | Two extracted requirements overlapping one label → matched=1, false positives=1 | **Pass** | Synthetic: `match=1 over_split=1 recall=1 precision=0.5`. TC4b/TC4c cover the other three verdicts and the unplaceable-quote case |
| TC5 | T1 and T3 are reported separately, never as one average | Two score blocks, two verdicts | **Pass** | Two table rows, two per-item diff sections, no combined figure anywhere |
| TC6 | The result file carries what a reader needs to argue with it | Dataset size, graded version, score vs threshold, per-item diff naming every miss and every false positive, `## Verdict:` | **Pass** | Every result file carries all six; the degraded control named all 17 misses individually |
| TC7 | Result files are never overwritten | A second run on the same date writes a new file and leaves the first intact | **Pass** | 7 → 8 files; the first is byte-identical afterwards |
| TC8 | The harness never calls a model provider, for any purpose | No provider host, no credential, no network call to a model anywhere in the stranger | **Pass** | No provider host, credential or endpoint in any of the three instrument files |
| TC9 | **Negative control** — C1 can go red | Degrade extraction deliberately; C1 fails naming the missed requirements; restore | **Pass** | Prompt clause restricting extraction to "requirements that mention email": T1 recall 92.9% → **14.3%**, T3 100% → **16.7%**, 17 misses named. Restored; version back to `7267c39b005e` |
| TC10 | A failing case is a failing exit code | `grade.mjs` exits non-zero when any case fails | **Pass** | Verdict read from the run's own output, not assumed: case failed and exit=1 |
| TC11 | Coverage is asserted (BUG-003) | Fixtures graded vs fixtures the case names; a gap fails the case rather than being reported as a footnote | **Pass** | T3 removed from the manifest → exit=1 and the result says `**NOT GRADED: T3**` |
| TC12 | **C1 passes** | Recall ≥0.80 and precision ≥0.75 on both T1 and T3 | **Pass** (2026-09-02; was FAIL) | 3 of 3 runs, prompt unchanged: T1 **93.3%** recall / 93.3–100% precision, T3 **100%** / **77.8%**. It went green on a corrected answer key, not a better extractor — see below |

## Notes

- **TC4 is tested with synthetic input, not with a live run.** The matcher is a pure
  function and the over-split case may simply not occur in a given extraction; a row that
  can only pass when the model happens to misbehave is not a check. `verify-grading.mjs`
  hands the matcher two fabricated requirements overlapping one label and asserts the
  arithmetic.
- **TC8 matters more than it looks.** A single provider call inside the stranger would make
  the headline accuracy figure a model's opinion about a model — the exact thing this
  project refuses everywhere else (ADR 0004, ADR 0008).
- **`kind` must agree for a match** (E2-S2 acceptance criteria). That is strict: a
  requirement correctly extracted and correctly cited but labelled `nonfunctional` where
  the answer key says `constraint` scores as a miss *and* a false positive. If C1 fails on
  kind disagreements, that is the diagnosis and it goes to a BUG card — the rule does not
  get softened to make the number look better.
- On failure, PRD-E2's decision governs: **at most three prompt iterations**, then a BUG
  card naming the failure *pattern*. The threshold never moves; labels are never edited.
- The harness reads the database and never re-runs the pipeline (`evals/README.md` rule 3).

## Evidence

`.\run.cmd evals/harness/verify-grading.mjs` → **9/9 passed**
(TC1, TC3, TC4, TC4b, TC4c, TC7, TC8, TC10, TC11).
`.\run.cmd evals/harness/grade.mjs C1` → **PASS**, exit 0, three consecutive runs (TC12).

**12 of 12 rows Pass, as of 2026-09-02.** TC12 was a FAIL for the whole of E2 and is now a
Pass. *How* it turned matters more than that it turned, so it is written out rather than
left as a green cell:

| | T1 recall | T1 precision | T3 recall | T3 precision |
|---|---|---|---|---|
| 2026-09-01, four runs | 78.6% – 92.9% | 84.6% – 92.9% | 100% | **66.7%**, four of four |
| 2026-09-02, three runs | **93.3%** | 93.3% – 100% | 100% | **77.8%**, three of three |

**The prompt version did not change and the model's output did not change.** What changed is
the answer key: Vaibhav's label review turned one false positive per fixture into a match
(T3-R07, the tablet cut, which was a real scope decision we had labelled as an unsettled
argument; T1-R15, the forty-one-million-row scale constraint). T3 went from 6-of-9 matched
to 7-of-9. That is the entire improvement.

So this row is honest as a Pass — the instrument is correct and the threshold is met against
ground truth a human has now checked — and it would be dishonest as a claim that extraction
improved. It did not. The arithmetic is in `evals/results/README.md`.

**C1 passes and still contains BUG-007.** T3's two remaining false positives are both sides
of T3-Q01, the auth argument that ends *"I'm not settling that in this meeting."* A
threshold met is not a defect absent, and E3-S4 is still the fix.

### What three prompt iterations bought

| | T1 recall | T1 precision | T3 recall | T3 precision |
|---|---|---|---|---|
| `e1s4` — E1's untouched prompt | 64.3% | 60.0% | 100% | 85.7% |
| iteration 1 — kind ordering, no double-emit, dispute rule | 64.3% | 64.3% | 100% | 66.7% |
| iteration 2 — quality-attribute categories, fact contrast | 78.6% | 78.6% | 100% | 85.7% |
| iteration 3 — external-thing tie-break, deadlines are requirements | **78.6% – 92.9%** over four runs | 84.6% – 92.9% | 100% | **66.7% in all four** |

Iteration 1 made T3 *worse* — the rule telling the model to stay silent about unsettled
disagreements made it surface more of them, not fewer. That reversal is what eventually
produced BUG-007's diagnosis, and a single-run measurement would have read it as noise.

### Why it is left failing

Three iterations is the cap PRD-E2 set, and it was reached. Per that decision the next step
is a BUG card naming the *pattern*, not a fourth attempt and not a lowered bar:
**BUG-007 — an unsettled argument has nowhere to go, so it becomes a requirement.**

T3's three false positives are the same three items in all four runs, and they are exactly
the disputed positions from two of T3's three labelled conflicts. The extractor is finding
the argument correctly and filing it in the only drawer that exists. The fix is E3-S4, which
gives conflicts a destination — not more prohibition in a prompt.

### The number that is not yet a number

T1's recall over four runs of the **identical** prompt is 78.6%, 92.9%, 92.9%, 92.9%. The
threshold is 0.80. **The range straddles it.** Three of those runs would have let this
story report "T1 passes at 92.9%"; the fourth is the reason that sentence is not in this
file. `evals/results/README.md` carries the full ledger, including which two result files
are re-grades rather than independent samples.
