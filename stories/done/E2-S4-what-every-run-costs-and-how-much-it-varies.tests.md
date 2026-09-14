# Test cases: E2-S4 — what every run costs, and how much the answer varies

```
.\run.cmd review-ui\scripts\verify-cost-telemetry.mjs   13/13  the row, its fields, and what may not be null
.\run.cmd review-ui\scripts\drill-retry-attempts.mjs    12/12  a bad answer is retried once and BOTH tries are logged
.\run.cmd evals\harness\spread.mjs                      3 full produce-and-grade rounds; the range, not the run
.\run.cmd review-ui\scripts\query.mjs cost-per-prd             the figure, hand-recomputed from the rows
```

**Two different claims live in this story, and only one of them is about money.** The first is
that every model call leaves a row nobody can bypass. The second is that a number quoted from
one run is not a number — the same case run three times has a range, and the range is what
gets published.

**The sharp one was the attempt.** `docs/traceability.md` has claimed since E1 that a call
writes `attempt` 1 or 2 and that the **attempt-2 rate is the drift signal** for a model
returning malformed JSON more often. Until this story that retry did not exist: a parse
failure parked immediately, and the one retry that did happen — n8n's, at the HTTP node — was
invisible to the telemetry and covered transport failures only.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **Every WF0 call writes an `llm_calls` row** carrying all its fields | all present | **Pass** | TC1a/TC1b: 14 columns, 10 required, every one filled on every row of the newest run |
| TC2 | The field list is **derived from the schema**, not typed in the check | derived | **Pass** | `PRAGMA table_info`; the four nullable columns are declared with reasons that print, and a declaration naming a dropped column fails |
| TC3 | Token counts are **the provider's**, never a character estimate | provider-reported | **Pass** | TC3a: read from `usage.*` (OpenAI) and `usageMetadata.*` (Gemini). TC3b: nothing in WF0 divides a length by four. TC3c: no successful call loses a count. TC3d: **3255 of 3267** successful calls report tokens above zero |
| TC4 | Cost is priced from a **local table** and every row says so | labelled | **Pass** | TC4a: 6/6 `estimated`. TC4b: every model the workflow can call is priced — **and the check reports three archived models that are not**, whose rows read as $0, rather than failing forever on the past |
| TC5 | `prompt_version` identifies **the exact bytes the model was sent** | 12 hex, matches | **Pass** | TC5a format; TC5b: all 8 shipped prompts have run at their current hash. **Deviation, stated:** the card asks for a git short hash; a content hash is strictly stronger — an uncommitted edit cannot be attributed to the last commit's prompt |
| TC6 | **DRILL: a malformed answer is retried once, and BOTH attempts are logged** | 2 rows | **Pass** | drill rounds A1/A2: `1:needs_review 2:ok`, two rows, in that order |
| TC7 | The retry is for **a bad answer only** — no answer is not retried | 1 row, no retry | **Pass** | round C (control): an empty balance writes **one** row and parks `llm_no_credit` immediately. Asking again would spend money on a condition that cannot pass |
| TC8 | If the second attempt succeeds, **the run continues** | continues | **Pass** | attempt 2 `ok`, and the run does not park on `llm_malformed_json` (it parks `no_requirements_found` — G1's correct answer) |
| TC9 | If the second attempt also fails, the run parks with **the same reason** | parks | **Pass** | round B: two rows, then `needs_review/llm_malformed_json` — the retry adds an attempt, never a different answer |
| TC10 | Both drill rounds give the same answer (BUG-021), and WF0 is restored byte-for-byte | 2 of 2 | **Pass** | identical both rounds; restored by hash |
| TC11 | **`spread.mjs` runs produce and grade three times** and reports min, median, max | range | **Pass** | `evals/results/2026-09-03-spread.md` — three full rounds, five cases, ~5½ hours of wall clock and about $1 of model spend |
| TC12 | **A range that straddles a threshold is called out by name** | says so | **Pass** | **T1 recall 73.3 / 93.3 / 93.3 against a floor of 80 — STRADDLES THE FLOOR**, and C1's verdict itself moved (PASS ×2, FAIL ×1). Filed as **BUG-040** |
| TC13 | **CONTROL: a straddle is detected when one exists** — forced | detected | **Pass** | `SPREAD_INJECT` with prepared rounds: the real reporting code finds the moving verdict and the crossed floor and names both |
| TC14 | The spread report states its own denominator | stated | **Pass** | runs, prompt versions, models, which cases gave numbers (1) and which gave a verdict only (4, named) |
| TC15 | **`cost-per-prd` is hand-recomputed from the rows** | matches | **Pass** | see the arithmetic below — **$0.009161 / 30 = $0.000305**, and M5 prints $0.0003 |
| TC16 | Telemetry still cannot stop a run | continues | **Pass** | the catch is asserted in `server.js`; drilled for real in E8-S4 |
| TC17 | The existing provider verifiers stay green after WF0 changed | green | **Pass** | `verify-degradation` **76/76**, `drill-provider-failures` **26/26** (re-run after the retry landed), `verify-grading` **12/12** |

## The hand recomputation (TC15)

Done from the rows, deliberately **not** with M5's own SQL — start at the approved versions and
work outwards:

```
approved versions                                     30
distinct traces behind them                           23   ← 30 versions, 23 traces
traces with any model spend                            5

  trace 41407260   4 calls   $0.003077
  trace 1580899b   1 call    $0.001365
  trace 6753d1c6   1 call    $0.001573
  trace 64528361   1 call    $0.001573
  trace ec5bbff9   1 call    $0.001573
                             ─────────
  sum over DISTINCT traces   $0.009161   / 30 = $0.000305  →  $0.0003   ✓ matches M5
```

**The first attempt at this got a different answer, and the difference is the point.** Summing
*per version* rather than per distinct trace gives **$0.015176 / 30 = $0.000506** — because
seven of the thirty approved versions share a trace with another, and their spend gets counted
twice. That is exactly the defect E8-S1 found and fixed in the implementation; doing the
arithmetic by hand reproduced the bug and then confirmed the fix. A hand-check that agrees
with the code on the first try proves less than one that disagrees for a reason you can name.

## Outcome: the attempt column started moving, and the range stopped being a rumour

```
verify-cost-telemetry.mjs   13/13
drill-retry-attempts.mjs    12/12
verify-degradation.mjs      76/76      drill-provider-failures.mjs  26/26
spread.mjs                  3 rounds -> evals/results/2026-09-03-spread.md
```

**WF0 retries a bad answer once, and only a bad answer.** The second ask is the same bytes with
`attempt: 2` stamped on it, both attempts write their own row, and the condition is
`attempt == 1` — so the retry is bounded by the attempt itself rather than by a counter
somebody has to maintain. An auth failure, an empty balance or a rate limit is **not** retried:
asking again spends money on a condition that cannot pass, which is the same distinction
BUG-028 drew between a bad answer and no answer, one layer down.

**What the retry actually buys is stated in the workflow, not implied:** at temperature 0 a
second ask is not a fresh sample — it buys the small non-determinism the provider has left. The
durable value is the *rate*, which is now a number that can move (0.13% of 3,858 calls today).

**The spread found something on its first honest run, which is the whole reason to build it.**
T1's recall is 73.3% in one run of three and 93.3% in the other two, against a floor of 80 —
so **C1's verdict moved between runs** and no C1 figure may be published without that range
beside it. Filed as **BUG-040**, with a second, quieter finding recorded there: E1's recall is
exactly 80.0% in all three runs, resting on its floor with no headroom, and nothing flags a
number that is *on* the line rather than across it.

**Three defects in my own new code, each now a check:**

1. **`grade.mjs all` is not a case**, so the first spread graded nothing for a whole round —
   and the loop swallowed the exit code as "a FAIL is a result". A round that grades nothing
   now **aborts the spread** rather than contributing an empty set. *A loop that treats a
   non-zero exit as data cannot tell a failure from an absence.*
2. **The JSON sidecar leaked into the archive** from `verify-grading`'s own sub-runs, which
   cleaned up the report it created and knew nothing about the file beside it. Cleanup now
   removes both.
3. **An existing check broke on the new artefact**: `S2-TC7` counted every file matching the
   case and saw +2 where it expected +1. It now counts reports and sidecars separately and
   asserts both — a better check than before it broke.

**And one operational note worth keeping:** a verifier run *while* the spread was producing
reported 11/12, then 12/12 when re-run quietly. **A verification that shares a database with a
producing run measures the race, not the system.**
