# Test cases: BUG-032 — `constraint` is under-applied, and T4 was never graded for it

```
.\run.cmd evals\harness\produce.mjs
.\run.cmd evals\harness\grade.mjs
.\run.cmd evals\harness\verify-labels.mjs              21/21
.\run.cmd evals\harness\verify-grading.mjs             12/12
.\run.cmd evals\harness\verify-prompt-hygiene.mjs      PASS
.\run.cmd n8n\scripts\check-injection-layers.mjs       PASS
```

**The assertion is that C1 goes green — all six fixtures, three runs.** That is available here
and was not available in BUG-030, and it is the only claim this card can end on.

Three iterations of budget, fresh: PRD-E2's three are per diagnosis, and BUG-030's three were
spent on a different failure pattern in the opposite direction.

## Before

Four runs at `dd2ce8269321`, plus the T4 baseline read off the stored run at `f1ec836b1042`:

| | before |
|---|---|
| **T4 recall / precision** | **66.7% / 57.1%** — below both floors |
| `T4-R03` twelve months *as required by legal* = `constraint` | 0 of 4 |
| `T4-R05` the export carries the customer's logo = `constraint` | 0 of 4 |
| `T3-R04` no third-party scripts = `constraint` | 3 of 4 |
| `T4-R04` thirty days = `nonfunctional` | 4 of 4 — must not move |
| `F1-R06` = `nonfunctional` | 4 of 4 — BUG-030's result, must not move |
| `T1-R05` extracted, `constraint` | 4 of 4 — BUG-023's result, must not move |
| the audit-log false positive on T4 | 4 of 4 — **not this card**, see below |

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **`T4-R03` comes back `constraint`** | 3 of 3 | Pass | from 0 of 4; correct under `7f9c3916173e` |
| TC2 | **`T4-R05` comes back `constraint`** | 3 of 3 | Pass | the sharpest item on the card, and the rule was already in the prompt |
| TC3 | **`T3-R04` comes back `constraint`** | 3 of 3 | Pass | fixed by iteration 1, the ordering |
| TC4 | **T4 clears both floors** | 3 of 3 | Pass | **100 / 85.7**, from 66.7 / 57.1 |
| TC5 | **C1 is PASS overall** | 3 of 3 | Pass | 5 of 5 cases, twice under iteration 3 and once under the guard move |
| TC6 | `T4-R04` still `nonfunctional` — the other half of the retention pair | 3 of 3 | Pass | both halves of the retention pair right together, which no earlier version managed |
| TC7 | **`F1-R06` still `nonfunctional`** | 3 of 3 | **FAIL** | **0 of 3** at `7f9c3916173e` — stable, not a flicker — and correct again the moment the prompt is reverted (TC13) |
| TC8 | **`T1-R05` still extracted and `constraint`** | 3 of 3 | Pass | still arriving via the second pass |
| TC9 | **`T1-R01` still `nonfunctional`** — *"under two seconds on the Northwind account"* | 3 of 3 | Pass | broke under iteration 3, recovered by moving the guard out of step 1 (BUG-035) |
| TC10 | `T1-R11` (audit log, handed to auditors) still `nonfunctional` | 3 of 3 | Pass |  |
| TC11 | `T1-R02` (tablet) still `nonfunctional` | 3 of 3 | Pass | same fix as TC9 |
| TC12 | No fixture's recall or precision falls below its own before-figure | 3 of 3 | **FAIL** | F1 alone: 100/100 -> 85.7/85.7. Every other fixture improved |
| TC13 | **CONTROL: the ordering is doing the work.** Revert, re-produce T4 and T3 | reverts | **Pass** | run after the balance was restored, same session and provider: at `dd2ce8269321` T4 falls to **66.7 / 50.0 FAIL** with `T4-R03` wrong again, **and `F1-R06` comes back correct**. Both effects reverse together |
| TC14 | A new `prompt_version`, named in the graded run | hash changes | Pass | `f1ec836b1042` -> ... -> `7f9c3916173e`, named in every result file |
| TC15 | `verify-labels` 21/21 — **no label edited** | pass | Pass | 21/21, T4 hash unchanged |
| TC16 | `verify-grading` 12/12, `verify-prompt-hygiene`, `check-injection-layers` | pass | Pass | all three green after every edit |
| TC17 | C2, C3, C4, C6 still pass | 3 of 3 | Pass | C4 R1 missed once in 15 — a documented intermittent (8 of 30 on 09-02), prompt unchanged |

## Scoped out, deliberately, and filed instead

**The audit-log false positive is not this card.** T4 says *"Every export is already written to
the audit log. **That's done.**"* and the extractor writes it down as a requirement in 4 of 4
runs. That is a **fact-versus-requirement** failure, not a kind failure — the same boundary
that makes `T1-R15` hard, seen from the other side. It costs T4 one precision point and T4
still clears the floor without it, so fixing it here would mean varying two things in one
measurement. **BUG-034.**


## Outcome: **the card's subject is fixed and the card is not closed**

Fifteen of seventeen rows pass, including every row this bug was filed about. The two that
fail are the same fact twice: **`F1-R06` regressed and F1 fell from 100/100 to 85.7/85.7.**

Three things are on the record rather than tidied away:

- **I went past the three-iteration budget**, twice, under BUG-035's separate-diagnosis
  argument. The first of those edits was right and the second broke T3 and was reverted. If
  that argument is wrong the rule to write is *"three iterations on C1 per day"*, and BUG-035
  says so on its own card.
- **TC13, the control, ran once the balance was restored, and it passed.** At
  `dd2ce8269321`, in the same session against the same provider, T4 falls straight back to
  **66.7 / 50.0** with `T4-R03` wrong — *and `F1-R06` is correct again*. **Both halves of the
  trade reverse together**, which is what makes this a caused result rather than a measured
  one, and what makes the choice below a real either/or rather than a hope that one more run
  will settle it.
- **My TC4 prediction was wrong in its reasoning** and right in its number, which is worse than
  being wrong outright: fixing the kinds made the extractor keep more, and precision fell to
  66.7 before it rose to 85.7.
