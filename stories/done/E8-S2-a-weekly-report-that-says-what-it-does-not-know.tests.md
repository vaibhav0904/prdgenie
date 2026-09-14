# Test cases: E8-S2 — a weekly report that says what it does not know

```
.\run.cmd review-ui\scripts\weekly-report.mjs [YYYY-MM-DD]   write one week's report
.\run.cmd review-ui\scripts\verify-weekly.mjs                the instrument check
.\run.cmd review-ui\scripts\verify-metrics.mjs               must stay 46/46 (E8-S1)
```

**The test that matters is the caveat that removes itself.** Any prose can be added to a
report. A sentence that *disappears when the world changes*, with nobody editing anything, is
the thing being built — so it is forced in both directions, not observed in one.

## The figures are not re-implemented

`docs/metrics.md`'s definitions live in `review-ui/metrics.mjs` and E8-S1 asserts each appears
**exactly once**. A week-scoped copy of M2 would be a second implementation of a definition —
the precise failure that story exists to prevent. So the metrics take an **optional window**
and default to all-time, and `verify-metrics.mjs` staying at 46/46 is part of this story's
gate rather than a courtesy.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | A report is written to `reports/weekly-YYYY-MM-DD.md`, named for the **Monday** of its week | pass | **Pass** | named for its Monday; the file on disk was written by the cron, not by hand |
| TC2 | Every figure comes from SQL; the file contains no number the database did not produce | pass | **Pass** | all five metrics carry the SQL that produced them |
| TC3 | **Guardrail pairs are adjacent in the file**: M2 with C1 recall, M4 with M3, M5 with the approved count | 3 of 3 | **Pass** | **the check was wrong first** — a byte-distance proxy matched the summary table; now asserts same-section |
| TC4 | The three uncomfortable numbers appear: never-approved, ungrounded overrides, dead letters | 3 of 3 | **Pass** | and they are **this week's** — they were lifetime totals until a draft was read under a weekly heading |
| TC5 | **The baseline caveat renders while `baseline_status = 'none'`** | pass | **Pass** |  |
| TC6 | **CONTROL — the caveat DISAPPEARS on its own** when the status becomes `recorded`, with no prose edited | vanishes | **Pass** | **forced both ways**: `none` -> the line renders, `recorded` -> it is gone from the file |
| TC7 | **The small-denominator caveat fires on a week with fewer than three approved PRDs** | pass | **Pass** | fires on the empty week, 0 approved |
| TC8 | **CONTROL — and does not fire** on a week with three or more | absent | **Pass** | and not on the full week, 30 approved |
| TC9 | **The model never writes a number.** Commentary containing a figure is rejected by code | rejected | **Pass** | refused whole, never repaired; the documented `one` exception behaves as documented |
| TC10 | **CONTROL — a planted figure the model would want to round** is caught, not merely a bare digit | caught | **Pass** | 5 of 5 refused: a digit, "ninety-eight percent", "Three… half", "per cent", a bare year |
| TC11 | Clean commentary passes through unchanged | pass | **Pass** | clean prose passes through unchanged, not rewritten |
| TC12 | **A model failure ships the report anyway**, with *"Narrative unavailable this week"* | ships | **Pass** | absent, empty and null narratives all ship a 2,529-byte report with every figure |
| TC13 | **Run twice on the same week, byte-identical except the generated-at line** | identical | **Pass** | byte-identical; the generated-at line is the only thing that may differ |
| TC14 | Trend against the prior week, with **absolute counts beside every percentage** | pass | **Pass** | a trend cell per figure, absolute counts beside the rates |
| TC15 | `verify-metrics.mjs` still 46/46 — the window did not fork a definition | 46/46 | **Pass** | 46/46 — the window did not fork a definition |
| TC16 | WF5 exists, is on a cron, is tagged, and its error path is WF4 | pass | **Pass** | active, tagged, WF4-routed, `field=weeks` asserted so it cannot be left fast |
| TC17 | The prompt reaches the model through WF0 only, inside the fence, with a closed schema | pass | **Pass** | a 7th builder in the injection audit, fenced as `SOURCE FIGURES`, WF0-only |
| TC18 | An empty week produces a report that **says it is empty** rather than one full of zeros presented as findings | pass | **Pass** | the empty week says so in words; the busy week does not carry that section |

## What I expect to be uncomfortable

- **The prior week is empty.** Every approval in this database is in one calendar week, so
  every trend figure will read "no prior week to compare". That is the correct output and the
  report has to say it in words rather than print a green arrow against zero.
- **"30 approved PRDs this week" is mostly test data** — 22 were created by hand during
  verification. The report inherits E8-S1's honesty rows rather than repeating the claim.


## Result: **42/42**, and the cron door was opened through itself

```
.\run.cmd review-ui\scripts\verify-weekly.mjs      42/42
.\run.cmd review-ui\scripts\verify-metrics.mjs     46/46   (the refactor's whole risk)
check-injection-layers · check-failure-routing · check-error-routing · verify-prompt-hygiene   all PASS
```

**WF5 ran on its own schedule.** n8n's CLI cannot execute against a running instance, so rather
than assert the cron from its JSON, the schedule was temporarily set to every minute; the
workflow fired, called WF0, and wrote a real report in about fifty seconds. Monday 07:00 was
restored, re-imported, and `verify-weekly` asserts `field=weeks` so it cannot be left fast by
accident.

**The narrative behaved on its first live run.** The prompt asks the model to name measures and
never state their values, and it wrote:

> *"More PRDs were approved than last week… The grounding rate held steady… Efficiency figures
> are illustrative due to the absence of a week-zero baseline, so caution is needed when
> interpreting the cost per approved PRD, cycle time to approval, accepted-unedited rate, and
> edits per requirement."*

Four measures named, no value stated, and the code check passed it rather than dropping it —
939+90 tokens, $0.0005, logged as `weekly_narrator` like every other call.

## Three things this story got wrong first

- **The uncomfortable numbers were lifetime totals under a weekly heading** — 1,162 versions,
  10 overrides, 13 dead letters, printed beside figures for one week. Caught by reading the
  rendered file rather than the code. `uncomfortable()` now takes the same window.
- **M3's numerator was windowed and its denominator was not**, so an empty week returned
  `0.000 edits per requirement` — which reads as *no edits* and means *no data*. A weekly
  report would have printed that as a finding.
- **TC3 was a proxy.** It measured "adjacent" as a byte distance and used `indexOf`, so it
  matched the summary table instead of M5's own block and failed on a report that was correct.
  It now asserts the property rule 5 actually states: **the same section**.

## And one thing I keep getting wrong

Bash ate my backslashes for the third time today, corrupting a string in
`check-failure-routing.mjs`. CLAUDE.md already says *patch from a file* — this was not a missing
rule, it was me not following one, and the fix was to stop reaching for `node -e` through a
shell for anything containing a quote.
