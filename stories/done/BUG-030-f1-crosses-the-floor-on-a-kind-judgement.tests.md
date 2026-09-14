# Test cases: BUG-030 — F1 crosses the C1 floor on a kind judgement

```
.\run.cmd evals\harness\produce.mjs                    x4
.\run.cmd evals\harness\grade.mjs                      C1 C2 C3 C4 C6
.\run.cmd evals\harness\verify-labels.mjs              21/21
.\run.cmd evals\harness\verify-grading.mjs             12/12
.\run.cmd evals\harness\verify-prompt-hygiene.mjs      PASS
.\run.cmd n8n\scripts\check-injection-layers.mjs       PASS
```

**The assertion is not "F1 passes".** F1 has passed 23 times out of 26 *while carrying this
exact error*, so "F1 passes" is satisfied by changing nothing. The assertion is that
**`F1-R06` comes back `nonfunctional`**, which it had never once done, **and that `T1-R05`
still comes back `constraint`**, which BUG-023 spent a whole story recovering.

Three iterations, which is all three PRD-E2 allows. Four runs, because a kind is a judgement
and one run of a judgement is an anecdote.

## Before, so the after means something

| | before |
|---|---|
| `F1-R06` correct (`nonfunctional`) | **0 of 26** |
| `F1-R04` correct (`functional`) | 23 of 26 |
| `T1-R05` extracted at all | 3 of 3 since BUG-023 |
| F1's best recall/precision in **32** archived results | 85.7% / 85.7% |
| T4 recall / precision | **66.7% / 57.1%** — below both floors, BUG-032 |

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **`F1-R06` comes back `nonfunctional`** — the whole bug, in one row | 4 of 4 runs | **Pass** | **0 of 26 -> 4 of 4.** Took all three iterations; 1 and 2 both failed it |
| TC2 | **`T1-R05` still extracted and still `constraint`** — BUG-023's win, which this change points a gun at | 4 of 4 runs | **Pass** | matched as `P2-00x` every run: still arriving via the second pass, unchanged |
| TC3 | `F1-R04` comes back `functional` | 4 of 4 runs | **Pass** | fixed by iteration 1 and held by 2 and 3 |
| TC4 | F1's fixture total clears both floors | 4 of 4 runs | **Pass** | **100% / 100% four times**, against a previous best of 85.7% in 32 results |
| TC5 | **No other fixture's kind moves.** T1, T3, N1, E1 item-for-item | no new `wrong_kind` | **Pass** | T1 and E1 zero all four runs. T3 once — and `f1ec836b1042` did it too, so not new |
| TC6 | **`T4-R04` stays `nonfunctional`, `T4-R03` no worse** | no regression | **Pass, with a loss recorded** | `T4-R04` correct 4 of 4. `T4-R03` correct under iterations 1 and 2, **wrong under 3** — an accidental gain given back, no worse than baseline, written onto BUG-032 as its lead |
| TC7 | The prompt's third worked example — *"retained for ninety days"* as a `constraint` — still agrees with the rule above it | consistent | **Pass** | stronger than before: the new rule now **quotes** that example as its own case |
| TC8 | **CONTROL: the rule is doing the work, not the run.** Revert, re-produce F1 | reverts | **Pass** | reverted to `f1ec836b1042` in the same session, same n8n, same model — `F1-R06` came straight back as `constraint`. Restored and re-checked after |
| TC9 | `sync-prompts.mjs` wrote a new `prompt_version`, and the graded run reports it | hash changes | **Pass** | `f1ec836b1042` -> `543f13d27aa3` -> `5e44745bab49` -> **`dd2ce8269321`**, named in all four result files |
| TC10 | `verify-prompt-hygiene` green | pass | **Pass** | 130 quotes x 6 prompts — **no new example quotes a labelled fixture**, which is the property they were written for |
| TC11 | `check-injection-layers` green | pass | **Pass** | 6 builders |
| TC12 | `verify-labels` green — **no label was edited** | 21/21 | **Pass** | answer key byte-identical; T4's hash `3bac9d940f97d88c` unchanged |
| TC13 | `verify-grading` green — the matcher was not touched | 12/12 | **Pass** | **failed once first, and it was right to**: it needs a full run in the manifest and the last produce had been the TC8 control. Re-produced, 12/12 |
| TC14 | C2, C3, C4, C6 unchanged | pass | **Pass** | all four PASS on every full grade |
| TC15 | **C1's coverage half is derived** — a labelled fixture neither graded nor declared fails the case | fails | **Pass** | forced by deleting the `H2` declaration: *"**UNDECLARED: H2**"*. Restored |
| TC16 | C1's overall verdict is **FAIL, on T4 only**, and the result file says so | FAIL | **Pass** | stated before the work started; T4 is BUG-032 |

## Two things this story caused, both filed rather than absorbed

- **BUG-033** — a nice-to-have (*"autocomplete would be nice, not required"*) is written down
  as a requirement on N1, 2 runs in 4. Caused by the exact sentence in iteration 3 that stopped
  the model dropping `F1-R06`. N1 still clears both floors; the string appears in 2 of 86
  archived results and both are mine.
- **`T4-R03` regressed between iteration 1 and iteration 3** — recorded on BUG-032 with the
  per-version table, because it is that card's strongest lead and would have been lost.

**Checked and *not* mine:** E1 at 80% (3 of 4) and T3 at 85.7% (1 of 4) both occur in every
earlier prompt version, E1 3 of 16 and 3 of 7. Verified against the archive rather than
assumed, because "it was probably always like that" is how a regression gets kept.

## What this story does not claim

**C1 does not go green here, and it was never going to.** T4 entered the case in this story
and fails it, for a defect older than today (BUG-032). The claim available is *"every fixture
C1 graded before today passes, and the two items BUG-030 named are right"* — and that is the
claim written down.
