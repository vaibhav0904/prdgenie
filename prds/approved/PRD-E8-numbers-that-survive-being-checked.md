# PRD-E8: Numbers that survive being checked

**Status:** **Approved** by Vaibhav, 2026-09-02
**Date:** 2026-09-01 · approved 2026-09-02

## Problem

`docs/metrics.md` defines five metrics and names the query for each. `docs/reporting.md`
assigns them to four audiences. None of it is built, so all of it is a plan — and the
charter's success criterion 6, and every
claim in the deck about whether this works depend on it existing.

The specific risk this epic manages is not "we forgot to build a dashboard". It is the
failure the method's own audit found and wrote down: **a metric defined as one thing and
computed as another, with both sides looking finished.** The definition says median to
`approved`; the implementation quietly computes a mean to `draft_created`; the report
renders a plausible number; nobody notices for a month.

## Goals / Non-goals

**Goals**

- All five metrics computed by named, hand-runnable queries — and hand-recomputed once,
  by a human, against the rows.
- A Metrics page and a weekly report, each carrying a caveat line **computed from state**.
- Guardrail pairs rendered adjacent, so the flattering half cannot be quoted alone.
- The week-zero baseline recorded honestly, including what it does not permit.
- The observability drill actually performed and dated.

**Non-goals** — deferred deliberately, with reasons:

- **No charts.** A table with a prior-period column answers "is it getting better"; a chart
  is presentation work that changes no claim. If the deck needs a visual, that is E9.
- **No improvement percentage against human effort.** Forbidden by `docs/metrics.md`: the
  only available PM has seen the fixtures and the labels. This is the single most tempting
  number in the project and it is not going to be produced.
- **No outcome tracking past `approved`.** The state machine ends at sign-off; the buyer's
  currency is Tier 2 in `docs/roadmap.md`. The deferred audience in `docs/reporting.md`
  stays deferred, in writing.
- **No alerting.** The Needs-attention queue from E7 is the operator surface; email or
  Slack alerts are a delivery problem the pilot does not own.
- **No metric that cannot be traced to rows.** If a number needs instrumentation that
  isn't built, it does not ship — it goes back to being a plan.

## Who this is for

The **owner/sponsor** persona, whose question is "is this working, is it getting better,
and what did it cost"; the **operator**, who needs today's spend and today's failures; and
the **builder**, who needs to see drift.

## Proposed scope → stories

- **E8-S1:** The five metric queries in `review-ui/scripts/query.mjs`, each runnable
  standalone, plus the Metrics page rendering them with guardrail pairs adjacent.
- **E8-S2:** WF5 weekly insights — figures from SQL, the model writing commentary only,
  "Narrative unavailable this week" on failure, computed caveat line, output to
  `reports/weekly-YYYY-MM-DD.md`.
- **E8-S3:** The `baseline_status` control-plane row and the caveat it drives; the timed
  hand-written PRD recorded as a labeled anecdote.
- **E8-S4:** The render/query audit and the observability drill — every number the queries
  produce is either rendered or deleted, and the telemetry path is killed mid-run to prove
  the product survives it.

## Success criteria

1. Each of M1–M5 is hand-recomputed once from the rows by a human, and the result matches
   the rendered figure. **Any discrepancy found is a BUG card, not a silent correction** —
   the point of hand-recomputing is that it catches something, and if it catches nothing
   the recomputation was probably not done properly.
2. M4 is verified to be a **median** over `ingested` → `approved`. The specific check:
   read the definition, then read the SQL, then confirm the endpoints and the statistic
   both match. This is written into the test plan because it is the known trap.
3. M2 never renders without C1's recall beside it; M4 never without M3; M5 never without
   the quality figure it bought. Verified by trying to find a screen where one appears
   alone, and failing.
4. The weekly report carries "*Efficiency figures are illustrative: no week-zero baseline
   exists*" automatically while `baseline_status = 'none'` — and that line disappears on
   its own when the row changes, without anyone editing prose.
5. Three specific uncomfortable numbers are rendered, not dropped: versions that never
   reached `approved`, the ungrounded-override count, and dead-letter totals.
6. The observability drill is performed and **dated** in `docs/traceability.md`: the
   logging path is stopped mid-run, the run still reaches `in_review`, and nothing else
   notices.

## Technical constraints (confirmed during exploration, not assumptions)

- **The definition/implementation pair must be re-read together**, not separately. The
  warning note already sits in `docs/metrics.md` under M4; E8-S1's test plan carries a row
  for it. A median in the doc and a mean in the SQL both look done.
- **The model may phrase figures and may not produce, round or "fix" them**
  (`docs/reporting.md` rule 2). WF5 hands it computed numbers as text and takes back
  commentary; if the narrative call fails, every figure still ships.
- **The caveat line is computed from state, never remembered.** It reads
  `baseline_status`, the parked/degraded flags on the version, the last judge sweep
  timestamp and the `estimated` vs `provider_reported` split on cost rows.
- **A median over two data points is not a median.** The report adds a small-denominator
  caveat when fewer than three PRDs were approved in the period — likely to be the normal
  case during the pilot, which is exactly why it must be automatic.
- **Cost rows carry `usage_source`.** Estimated rows are labeled so a later correction sits
  beside them instead of overwriting them (`docs/traceability.md`).
- **Telemetry writes are parallel and continue-on-failure.** E7-S3 built this; E8-S4
  proves it by drill rather than by reading the code.

## Decisions — 2026-09-02, all four closed

Three came back as the leaning; one Vaibhav answered directly. Recorded here so none of
them is re-litigated inside a story.

**1. The week-zero baseline is recorded — and refused in the same breath.** Vaibhav sits
and hand-writes a PRD from T1, timed, and the timing is stored **labelled**:
*single-subject, not blind, illustrative only.* **No percentage is derived from it, ever.**
A recorded-and-refused number is more honest than a missing one, and it shows the
reasoning; `docs/metrics.md` already forbids the improvement claim and this does not
reopen it. E8-S3 owns it.

**2. The Metrics page shows aggregates *with* a drill-down** — a list of review sessions
and their action counts, not per-action detail. Aggregates alone would hide the session
where every action was `approve` in forty seconds, and `docs/traceability.md` names that as
the signal to look for. E8-S1 owns it.

**3. The weekly report covers a calendar week**, and the small-denominator caveat does the
work. This early that means mostly-empty reports, which is the honest output: a
"last 10 runs" window would make the trend column compare two arbitrary spans and quietly
stop meaning anything. E8-S2 owns it.

**4. The render/query audit lives in E8-S4's Outcome**, as a checklist naming each query,
its columns, and where each column is rendered — so the next person repeats it instead of
re-deriving it. Taken as proposed; nothing turned on it.

**What is still forbidden, restated because approval is when it gets tempting:** no
improvement percentage against human effort, no outcome tracking past `approved`, no
charts, and no metric that cannot be traced to rows.
## Open questions (all four now decided above)

- **Does the baseline get recorded at all, given it cannot support a claim?** Leaning yes:
  record the timing, label it *single-subject, not blind, illustrative only*, and state in
  the same breath that no percentage is derived from it. A recorded-and-refused number is
  more honest than a missing one, and it shows the reasoning. *Decided by Vaibhav at
  E8-S3.*
- **Should the Metrics page show per-session detail or aggregates only?** Aggregates hide
  the session where every action was `approve` in forty seconds — which is the signal
  `docs/traceability.md` says to look for. Leaning aggregates with a drill-down list of
  sessions and their action counts. *Decided by Vaibhav.*
- **What period does the weekly report cover during a build with bursty usage?**
  Calendar week produces mostly-empty reports. Leaning calendar week anyway, with the
  small-denominator caveat doing the work — inventing a "last 10 runs" window would make
  the trend column meaningless. *Decided at E8-S2.*
- **Where does the render/query audit live once done?** Proposed: a checklist in the
  story's Outcome naming each query's columns and where each is rendered, so the next
  person can repeat it rather than re-derive it.
