# E8-S1: Five numbers, and the queries behind them

**As a** sponsor
**I want** every figure on the Metrics page to be produced by a query I can run myself
**So that** believing the number does not require believing the person who rendered it

## Acceptance criteria

- [ ] M1–M5 each computed by a **named, standalone query** in `review-ui/scripts/query.mjs`,
      runnable on its own and printing the rows it aggregated.
- [ ] **M4 is a median over `ingested` → `approved`**, and the check is performed in this
      order: read the definition, read the SQL, confirm **both** the endpoints and the
      statistic match. This row exists because a median in the doc and a mean in the SQL
      both look finished.
- [~] Each metric is **hand-recomputed once by a human** against the rows, and matches.
      **A discrepancy is a BUG card, not a silent correction.** — **PARTIALLY MET, and the
      shortfall is stated rather than rounded up.** See "How this closed" below.
- [ ] **Guardrail pairs render adjacent** and cannot be separated: M2 never without C1 recall,
      M4 never without M3, M5 never without the quality figure it bought. Verified by trying
      to find a screen where one appears alone, and failing.
- [ ] The page shows **aggregates with a drill-down** list of review sessions and their action
      counts — the decision on the PRD. A session that was forty seconds of `approve` must be
      findable.
- [ ] Three uncomfortable numbers are rendered rather than dropped: versions that never
      reached `approved`, the ungrounded-override count, and dead-letter totals.
- [ ] The caveat line is **computed from `baseline_status`**, never typed.
- [ ] **Run every query twice** and compare (BUG-021).

## Depends on
- E4-S1 (per-item decisions produce the review actions M2 and M3 count)

## Eval gate
- None. The gate here is the hand-recomputation, which is a UAT step, not a case.

## How this closed, 2026-09-04 — and what it does not close

Vaibhav delegated the open decisions rather than performing this one, so it was closed the
only honest way available: **a second, independent derivation instead of a human.**

`review-ui/scripts/recompute-metrics.mjs` recomputes all five from raw rows in JavaScript —
no GROUP BY, no joins where a Set will do — and compares against the shipped SQL. **6 of 6
agree.** The strategies differ on purpose, so a fan-out, a NULL, or an IN-clause that
de-duplicates as a side effect shows up as a disagreement rather than being reproduced.

**It can fail, and the control proves it.** M5-C recomputes the cost the wrong way — per
version, so every trace shared by several versions is counted more than once — and asserts the
two answers differ. They do: `$0.001608` against `$0.0014` over 34 versions on 27 distinct
traces. That was a real mistake made by hand on this very metric before the check existed.

**And the check found a defect on its first run — in itself.** M3 reported a disagreement of
0.0005. Both derivations had computed 0.13253012048; the shipped metric publishes 3 decimals
and the checker was comparing at 4. **The checker was wrong, not the metric**, and the fix was
to derive the comparison precision from the published value rather than typing one per metric.

### What is still open, and it is the half that mattered most

**Both derivations read the same definitions.** They agree on the arithmetic and are silent on
whether the definitions are right — is `approve_ungrounded` an approval? is a median the right
statistic for cycle time? A wrong definition is now agreed on twice, confidently.

That judgement is what a human recomputation was for, and **no amount of second implementation
substitutes for it.** The deck and the metrics page must therefore say *"two independent
derivations agree"* and must NOT say *"hand-verified"*. The distinction is the point of the
story.

## Technical notes

- `docs/metrics.md` names the query for each metric. **Read the definition and the
  implementation together, not separately** — that pairing is the whole point of the story.
- The model touches none of this. Every figure is SQL (CLAUDE.md hard rule).
- A metric that needs instrumentation which does not exist **does not ship**; it goes back
  to being a plan, and the row says so.
