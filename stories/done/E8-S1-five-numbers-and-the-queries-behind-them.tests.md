# Test cases: E8-S1 — five numbers, and the queries behind them

```
.\run.cmd review-ui\scripts\query.mjs m1            (also m2 m3 m4 m5)
.\run.cmd review-ui\scripts\query.mjs cycle-time    the name docs/metrics.md uses
.\run.cmd review-ui\scripts\query.mjs cost-per-prd
.\run.cmd review-ui\scripts\verify-metrics.mjs
```

**The gate here is the hand-recomputation, not a case.** A metric nobody has recomputed by
hand is a number that has never been checked by anything except the code that produced it.

## Checked before writing a line, because the card says a metric without instrumentation does not ship

| | exists? | evidence |
|---|---|---|
| M1 — `grounded`, `pm_authored` | yes | 6,510 requirement rows |
| M2 / M3 — review actions | yes | 33 sessions, 39 actions: `approve`=19, `approve_ungrounded`=10, `edit`=10 |
| M4 — `ingested` and `approved` events | yes | 30 approved versions, 30 `ingested`→`approved` pairs |
| M5 — `llm_calls.cost_usd` | **yes** | 3,045 calls, all costed, $5.06 total — **I assumed this was empty and was wrong** |
| the caveat — `baseline_status` | **yes** | a `schema_meta` row, seeded `none`. My first probe searched table *names* and missed a *row* |

**All five ship.** Nothing goes back to being a plan.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | Each of M1–M5 runs **standalone** from `query.mjs` and prints the rows it aggregated, not just the figure | 5 of 5 | **Pass** | 5 of 5 — each prints its SQL and its rows |
| TC2 | The command names `docs/metrics.md` already publishes — `cycle-time`, `cost-per-prd` — both work | 2 of 2 | **Pass** | `cycle-time` and `cost-per-prd` are aliases of m4/m5, one implementation |
| TC3 | **M4 is a median, and its endpoints are `ingested` → `approved`.** Read the definition, read the SQL, confirm **both** | pass | **Pass** | **found a defect:** the SQL was per-trace, 23 observations for 30 approved versions |
| TC4 | **M4 forced:** an even-length set returns the mean of the middle two, and an odd-length set the middle one | pass | **Pass** | even set -> 2.5 not 3; empty -> null not 0; input not mutated |
| TC5 | **Every figure hand-recomputed once against the rows**, and matching | 5 of 5 | **automated; the human half is open** | the arithmetic is asserted from each metric's own printed rows — Vaibhav's recomputation is the UAT |
| TC6 | **The page and the CLI cannot disagree** — one module, imported by both; no second copy of any query | pass | **Pass** | no SQL in `server.js` or the page; each `M*_SQL` appears exactly once |
| TC7 | **Guardrail pairs are structurally inseparable**: M2 carries C1 recall, M4 carries M3, M5 carries the quality figure it bought — in the *data*, not the layout | 3 of 3 | **Pass** | 3 of 3 carry `partner_value` in the payload |
| TC8 | **CONTROL:** delete a partner from the payload and the renderer refuses rather than drawing a lone number | refuses | **Pass** | **forced**, not inspected: `allMetrics({c1: null})` marks M2 and M5 unrenderable and leaves M4 alone |
| TC9 | The drill-down lists review sessions with their action counts, and **a forty-second all-approve session is findable** | pass | **Pass** | 19 sessions under a minute; the fastest is **0s with 1 action** — a rubber stamp, found |
| TC10 | Three uncomfortable numbers render: versions that never reached `approved`, ungrounded overrides, dead letters | 3 of 3 | **Pass** | 1162 never approved · 10 overrides · 13 dead letters, each with why it is shown |
| TC11 | **The caveat line is computed from `baseline_status`**, never typed | pass | **Pass** | **forced**: 4 statuses give 4 distinct caveats |
| TC12 | **CONTROL:** set `baseline_status` to a value that is not `none` and the caveat changes accordingly | changes | **Pass** | an unknown status still renders a caveat saying it is unknown |
| TC13 | **Every query run twice, same answer** (BUG-021) | identical | **Pass** | 5 of 5 identical on a second run |
| TC14 | `schema-check` and the existing `trace` command still work | pass | **Pass** | `schema-check` green; 10 other verifiers re-run, 0 failures |
| TC15 | **The model touches none of it** — no provider call, no import of anything that makes one | pass | **Pass** | no provider host, endpoint or fetch in the metrics path |
| TC16 | M1's stated exclusion is real: **editing a requirement removes it from M1** | pass | **Pass** | 10 edited, 10 excluded, sets identical — editing cannot raise M1 |

## What I expect to be uncomfortable, written before I look

- **M2 will be low**, because `approve_ungrounded` is not `approve` and there are 10 of them
  against 19 plain approvals. The definition in `docs/metrics.md` is literal and the SQL will
  match it literally — but "accepted unedited" arguably describes an ungrounded approval too.
  **The count goes on the page beside M2 so the choice is visible rather than buried**, and if
  Vaibhav reads the definition differently that is a decision, not a bug fix.
- **M4 will be meaningless in magnitude**: the 30 approvals are mine, made in seconds during
  verification, not a PM reading a PRD. The number is real; what it measures is a test harness.
  That belongs on the page in words.


## Result: **46/46 in `verify-metrics.mjs`**, and three defects found on the way

```
.\run.cmd review-ui\scripts\verify-metrics.mjs      46/46
ten other review-ui verifiers re-run                 0 failures
```

**Reading each definition against its implementation is the whole method, and it worked three
times** — all three in my own first implementation, all three caught before anything shipped:

| | the definition | my first implementation |
|---|---|---|
| M4 | "over PRDVersions that reached approved" | grouped by `trace_id`: **23 observations for 30 approved versions** |
| M5 | "divided by the number of approved PRDVersions" | counted the denominator inside the join: **8**, not 30 |
| M5 | sum of cost over contributing traces | **double-counted** any trace with two approved versions: $0.0127 for a true $0.0079 |

The M4 one is the mistake `docs/metrics.md` warns about by name, arriving in a shape the
warning did not quite describe: **not a mean under a median, but the right statistic over the
wrong population.** Nothing about the number looked wrong — 23 observations reads as fine
until you know there are 30 approved versions.

## Two checks I wrote were green for the wrong reason, and both were replaced

- **One could not fail at all.** TC11 built a `Set` of booleans and asserted `.size >= 1`,
  which is true for every possible input. It now pushes four statuses through the real
  `caveat()` and asserts four distinct strings.
- **One was simulated rather than forced.** TC8 hand-built an object with `renderable: false`
  and checked it was false. It now calls `allMetrics({ c1: null })` — the real code path — and
  asserts M2 and M5 come back withheld while M4, whose partner is M3, is untouched.

Both needed a seam in the module rather than a cleverer assertion, and neither seam changes
production behaviour: both default to exactly what they did before.

## What the numbers say about themselves

- **M5 = $0.0003 per approved PRD is almost meaningless**, and the metric prints the reason as
  one of its own rows: **22 of the 30 approved versions were created by hand during
  verification and cost nothing**. The honest cost figure is per *run* and belongs to E2-S4.
- **M2 = 48.7%**, because `approve_ungrounded` is not `approve` — 19 plain approvals against
  10 overrides and 10 edits. The definition is literal and the SQL matches it literally. If
  Vaibhav reads "accepted unedited" as including an ungrounded approval, **that is a decision
  and the number becomes 74.4%**; the count sits on the page beside it either way.
- **M4's median is 0.31 minutes and the mean is 3.84.** Both are printed, adjacent, labelled —
  and the magnitude means nothing yet, because those 30 approvals are mine during verification
  rather than a PM reading a PRD. The page says so in words.

## Still open: the human half of TC5

The card's gate is *"hand-recomputed once by a human"*, and that is Vaibhav's, not mine. The
arithmetic is laid out for it on the decision page, one line per metric.
