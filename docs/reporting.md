# Reporting surface

Which numbers this product owes which audience, and where each one is computed.
`metrics.md` defines the measures; this file assigns them to reports. A metric
that appears in neither is a plan, not a metric.

Start from the people, not the schema. Each audience has one question; a report
is the answer to it, delivered on the channel that audience already reads.

## Audiences

| Audience | Their one question | Channel they already read |
|---|---|---|
| **The PM** (Vaibhav, using the product) | Is the draft I'm about to review any good, and where did each line come from? | The review UI itself — the only surface a PM opens |
| **The operator** (Vaibhav, keeping it running) | What needs a human right now, and what is this costing? | The Needs-attention queue in the UI |
| **The owner / sponsor** (the NeuronForge leadership persona) | Is this working, is it getting better, and what did it cost? | A weekly markdown report in `reports/` — in a real org, an email |
| **The builder** (Vaibhav, changing prompts) | Is quality drifting, and why? | `evals/results/` archive plus the Metrics page |
| **The pilot participant** (a second PM, once there is one) | Did the thing I approved last week actually get built from? | **Deliberately deferred.** No outcome tracking past `approved` exists — the system's knowledge of a PRD ends at sign-off. Named here as a scope call, and it is the first item in `roadmap.md`'s Tier 2 for exactly this reason. |

An audience with a question and no report is a gap. List every audience even if
their report is deliberately deferred — a deferral written down here is a scope
call; one that isn't is a hole.

## The reports

### Review screen (the PM's report — it is a report, not just a form)
- **Audience / cadence / channel:** PM · per PRDVersion · review UI.
- **Numbers it carries:**
  - Grounding rate for this version — *computed by* the M1 query, run server-side per
    version, never in the browser.
  - Requirement count by kind, and count of OpenQuestions by kind — *computed by*
    `SELECT kind, COUNT(*) … GROUP BY kind`.
  - Per requirement: its citations, rendered as clickable chips that highlight the span
    in the source pane — *computed by* the stored `citations` rows, with the offsets the
    grounding check rewrote, not the ones the model returned.
- **Caveat line:** computed from state, rendered above the tree whenever any of these
  hold — this version was parked `needs_review` (with the reason code shown); its
  grounding rate is below 100%; any requirement was approved via the ungrounded override;
  or the run used a fallback attempt. Never written as prose, never remembered.
- **Trend:** grounding rate for this version against the previous version of the same PRD.
  A single figure answers "what happened"; the pair answers "is it getting better".

### Needs attention (the operator's report)
- **Audience / cadence / channel:** operator · continuous · UI queue.
- **Numbers it carries:** count and list of `dead_letter` runs with reason code and
  `trace_id` — *computed by* `SELECT * FROM dead_letters WHERE resolved_at IS NULL`;
  count of versions parked `needs_review` by reason — *computed by* the same grouped
  by reason; today's spend — *computed by* `SELECT SUM(cost_usd) FROM llm_calls WHERE
  date(created_at)=date('now')`.
- **Caveat line:** shown when the judge sweep has not run in over 48 hours, or when any
  `llm_calls` rows for the period are labeled `estimated` rather than provider-reported.
- **Trend:** today against the trailing 7-day daily average.

### Weekly insights (the owner's report) — WF5
- **Audience / cadence / channel:** owner · weekly, Monday · `reports/weekly-YYYY-MM-DD.md`.
- **Numbers it carries:** M2 with C1 recall **adjacent** (guardrail pair); M4 with M3
  **adjacent** (guardrail pair); M5 with the PRDs-approved count; the count of versions
  that never reached `approved`, stated beside M4 rather than hidden by its exclusion rule.
- **Caveat line:** computed from state. Renders "*Efficiency figures are illustrative:
  no week-zero baseline exists*" while `baseline_status = 'none'`; adds a line when the
  week contains fewer than three approved PRDs, because a median over two is not a median.
- **Trend:** every figure against the prior week, with the absolute counts beside the
  percentages — a rate over a small denominator moves for uninteresting reasons.
- **The model's role:** it writes the commentary paragraph from the computed figures and
  nothing else. If the narrative call fails, the report ships with "Narrative unavailable
  this week" and every figure intact.

### Eval archive + Metrics page (the builder's report)
- **Audience / cadence / channel:** builder · per eval run · `evals/results/` and the UI
  Metrics page.
- **Numbers it carries:** every case's score against its threshold with per-item diffs;
  the **spread** across the three runs, not the best one; grounding match-kind
  distribution (exact vs whitespace-normalized) from `docs/traceability.md`; attempt-2
  rate; `prompt_version` for the run.
- **Caveat line:** on the Metrics page, computed — rendered when the newest result file
  is older than the newest prompt file's git timestamp, meaning the archive no longer
  describes what is running.
- **Trend:** this run against the previous dated result file for the same case.

## Built 2026-09-03 (E8-S2)

WF5 runs Mondays at 07:00, is active, is tagged `prdgenie`, and names WF4 as its error
workflow. It writes `reports/weekly-YYYY-MM-DD.md` named for the Monday of its week.

**The cron door was tested through itself** (CLAUDE.md: a door never opened is not a door).
The schedule was temporarily set to fire every minute, the workflow produced a real report
with a real narrative in about fifty seconds, and the Monday schedule was restored and
re-imported — a check asserts `field=weeks` so it cannot be left fast by accident.

**The narrative is the only model call in this system allowed to fail quietly**, and it is
declared as such with its reason. Its first live run named four measures and stated none of
their values, which is what the prompt asks for and what code enforces:

> *"More PRDs were approved than last week… The grounding rate held steady… Efficiency figures
> are illustrative due to the absence of a week-zero baseline, so caution is needed when
> interpreting the cost per approved PRD, cycle time to approval, accepted-unedited rate, and
> edits per requirement."*

**The figures are not re-implemented.** `metrics.mjs` gained an optional window and every
metric defaults to all-time, so the weekly report, the Metrics page and `query.mjs` share one
definition each — `verify-metrics.mjs` staying at 46/46 through that refactor was part of this
story's gate rather than a courtesy.

Two things the report says that a weekly report usually does not: an **empty week is described
as empty in words**, because zeros presented as performance are lying by arithmetic; and the
three uncomfortable numbers are **this week's**, not lifetime totals, which they were until a
draft was read under a weekly heading and the lifetime figure looked like a week.

## Rules

1. **Definition and implementation must not drift.** Every metric row in
   `metrics.md` names its *computed by*; every report number here points back
   at a metric. Review the pair whenever either file changes — a median in the
   definition and a mean in the SQL both look done. M4 carries an explicit warning note
   in `metrics.md` for this reason.
2. **The model writes the commentary, never a figure.** Hand it the computed
   numbers; it may phrase them and may not produce, round, or "fix" them. If
   the narrative call fails, ship the report with a fixed "narrative
   unavailable" line — figures never depend on the model.
3. **Audit render against query.** Anything the query computes that the page
   does not show is either rendered or deleted. What silently falls out is
   usually the uncomfortable numbers — here, specifically: the count of versions that
   never reached approval, the ungrounded-override count, and `dead_letter` totals.
   Those three are named so that dropping one is a visible choice.
4. **Log the reason, not just the decision.** Every human override carries a
   why, even one click's worth, on *every* channel that accepts the decision —
   not only the convenient one. Reject, edit, and the ungrounded "approve anyway" all
   require a reason; if a second approval channel is ever added, it inherits the
   requirement or it does not ship.
5. **Guardrail pairs travel together.** M2 never appears without C1 recall beside it;
   M4 never appears without M3 beside it; M5 never appears without the quality figure it
   bought. Same report, adjacent — never split across surfaces where one can be quoted
   alone.
6. **A single run is a diagnostic; only a range is a number** (E2-S4). Before any figure
   reaches the deck, the video, the charter or a quoted result file, it is measured
   `.\run.cmd evals/harness/spread.mjs` — three full produce-and-grade rounds — and it is
   published **with its range**, never with the flattering run. Two things make a spread
   report say "not settled" rather than reporting a median: a **verdict that moved between
   runs**, and a **range with a floor inside it**. Both are named in the report by fixture and
   metric. A straddle is not a failure and not a pass; it means quote the range, or run it
   more times and quote the wider one.
7. **The denominator of a spread is part of the figure.** A range over two runs is written as
   a range over two runs, and a `--grade-only` spread — the same produced run graded
   repeatedly — measures the *stranger's* stability, not the system's, and says so in its own
   header. Neither is presented as the other.
