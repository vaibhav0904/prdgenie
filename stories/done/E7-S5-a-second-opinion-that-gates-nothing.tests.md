# Test cases: E7-S5 — a second opinion that gates nothing

```
.\run.cmd review-ui\scripts\verify-judge.mjs             35/35  the sampling, the lock, the rules, the controls
.\run.cmd review-ui\scripts\verify-judge-isolation.mjs   PASS   76 gate files, derived; the judge is in none of them
.\run.cmd review-ui\scripts\negative-control-judge.mjs   4/4    plant a judge reference in a gate: the check goes red
.\run.cmd review-ui\scripts\drill-judge-unavailable.mjs  18/18  the judge taken away, twice, with an answering control
.\run.cmd review-ui\scripts\judge-sweep.mjs                     a real sweep, through the real door, against real Gemini
```

**The judge gates nothing, so the interesting tests are not about its scores.** They are about
the four things that could make it dishonest: a sample that is not random, a sweep that counts
rows twice, a judge that has seen the answer key, and a failure that looks like a pass. Every
one of those is forced here rather than argued.

**Two floors this story must not cross.** The judge is a *different vendor* from the doer, and
its output reaches *no* gate. Both are asserted from artefacts of real runs — the `llm_calls`
rows a sweep wrote, and a derived scan of every file a gate is computed in — not from a
sentence in an ADR.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | The sample is **bounded and drawn in SQL**: at most 2 PRD versions and 20 requirements per sweep | ≤2 / ≤20 | **Pass** | verify-judge TC1a/TC1b: 2 versions, 20 requirements, `ORDER BY RANDOM()` over unjudged rows |
| TC2 | The sample is drawn **only from rows not yet judged** — a second sweep never re-draws a row the first one scored | no overlap | **Pass** | TC2: 0 overlapping items between two consecutive sweeps of the same database |
| TC3 | Every sweep stores **`trigger_source`** and **`sample_size`**; a manual sweep is stored as `manual` and never reported as random | both stored | **Pass** | TC3a–TC3d: `manual`/22 stored on the row; a cron sweep records `cron` |
| TC4 | **A manual trigger is refused while a sweep is in flight** — by the service, and through the webhook door | 409, no second sample | **Pass** | TC4a–TC4c: `sweep_in_flight`, sweep count unchanged, refusal names the blocking sweep. Live: sweep #9's trigger while #8 ran was refused the same way |
| TC5 | An **abandoned** in-flight sweep does not block every future sweep: it is released with a recorded reason | released, recorded | **Pass** | TC5a/TC5b: released as `sweep_abandoned`. **And it happened for real** — sweep #11 died mid-loop and the release picked it up |
| TC6 | **The cron door is tested through itself** — the schedule fires the workflow, proven live, and the file is then restored | fires | **Deferred, and named** | Not performed. The nightly cron is **disabled in the shipped file** (see TC7) and the free tier cannot pay for a nightly sweep at all (`docs/assumptions.md`) — so firing it would prove a door this deployment has decided not to open. Recorded here rather than quietly skipped |
| TC7 | The shipped workflow is **manual-only for the demo**, and that is a stated, visible state rather than an omission | stated | **Pass** | the schedule node ships `disabled: true` beside a sticky note saying why and how to enable it; PRD-E7 Q3 |
| TC8 | **Rubric version is stored with every score**, and it is the content hash of the rubric file the model was sent | hash matches | **Pass** | TC8a–TC8c: `26fca6c24a88` on every score, and the same string is what WF6's generated builder sends |
| TC9 | **The rubric is defensive: a flagged-ungrounded item can never be a violation** | not counted | **Pass** | TC9a: excluded, 0 disagreements. **TC9b is the control**: the same row, unflagged, IS counted 1/1 — the exclusion is doing the work |
| TC10 | **The judge never sees the labels** — checked against the runtime payload, not the prompt file | 0 label quotes | **Pass** | TC10a: no `label_id` anywhere in a real sample; `verify-prompt-hygiene.mjs` independently fails on any label quote in any prompt |
| TC11 | **Cross-vendor, from the record**: every model call a sweep makes names a Gemini model; the doer's appears on none | 0 doer calls | **Pass** | `llm_calls` for `component='judge'`: `gemini-3.8-flash` only. Drill TC12f asserts 0 non-Gemini judge calls in both rounds |
| TC12 | **Gemini unavailable on purpose → the sweep records that it was skipped**, with a reason from the closed set, and no same-vendor fallback | skipped, recorded | **Pass** | drill rounds 1 and 2: `skipped` / `llm_error (22 of 22 calls)` / provider's own words stored / 0 doer calls / 0 scores / lock released. **And it happened for real**: sweeps #10, #14, #15 hit the live free-tier wall and recorded `llm_no_credit` with Google's quota message |
| TC13 | The skip drill gives the **same answer twice** (BUG-021), and WF0 is restored byte-for-byte | 2 of 2 | **Pass** | TC13b identical both rounds; TC13a restored by hash |
| TC14 | **Judge scores are absent from every gate** — from a **derived** file list | 0 references | **Pass** | `verify-judge-isolation.mjs`: 76 gate-bearing files scanned, 0 references; 11 files declared as naming-but-not-reading, each with its reason printed |
| TC15 | **CONTROL: a planted judge reference in a gate file turns TC14 red and names the file** | fails, names it | **Pass** | `negative-control-judge.mjs` 4/4 — planted in `C1.mjs` and in `metrics.mjs`, red both times, named both times, tree unchanged after |
| TC16 | **A sweep writes only to the judge's own tables** | unchanged | **Pass** | TC16: 19 other tables, derived from the schema, unchanged across the whole verification |
| TC17 | **A BUG card opens automatically** on **>40% of comparable rows in one sweep** | card written | **Pass** | TC17a–TC17d: forced against real E1 output — 5/5 comparable rows disagree, rule fires, card written, and a second firing defers to the open card instead of filing twice. **TC17e is the control**: agreement fires nothing |
| TC18 | **A BUG card opens automatically** across **three consecutive sweeps** with disagreement | card written | **Pass** | TC18a/TC18b: three sweeps at 1/5 each — 20%, so the first rule cannot be what fired. **TC18c is the control**: one clean sweep in the three and nothing fires |
| TC19 | The auto-card **names both suspects** and asserts neither is right | both named | **Pass** | TC19a–TC19c: the card names the rule, weighs rubric and labels equally, and says out loud that nothing in it may change a label, a threshold or a gate |
| TC20 | A sweep with **too few comparable rows** does not fire the 40% rule, and says so | not evaluated | **Pass** | TC20: 1 comparable row — "the 40% rule was NOT evaluated: below the floor of 3" |
| TC21 | **A real sweep, end to end, against real Gemini**: scores stored, cost logged, sweep closed | stored | **Pass, and bounded** | Sweeps **#8 (5 scores)** and **#9 (3 scores)** against live `gemini-3.8-flash`: verdicts, three numbers and a comment stored per item, cost priced into `llm_calls`, closed with disagreement computed. Then the free tier ran out for the day (`docs/assumptions.md`) — so the **full** 22-of-22 path is evidenced by the drill's control, which stores 22 through the same door, workflow and service |
| TC22 | **The doer path still works after WF0 gained a second provider** | in_review | **Pass** | the OpenAI branch is byte-for-byte the node it was; `check-injection-layers` executes all 8 builders and `check-failure-routing` reads both provider nodes. The doer's own last full run is unchanged |
| TC23 | The existing workflow audits stay green with a sixth workflow present | all green | **Pass, with one carded exception** | injection layers PASS (8 builders, 42 fields), failure routing PASS, error routing PASS (5 live workflows → WF4), prompt sync clean, `verify-metrics` 51/51, `verify-weekly` 44/44, `audit-render` 74/74. **`check-spine.mjs` is red and was already red before this story** — filed as **BUG-038**, not fixed here |

## Outcome: the judge answers, and nothing waits on it

```
.\run.cmd review-ui\scripts\verify-judge.mjs             35/35
.\run.cmd review-ui\scripts\verify-judge-isolation.mjs   PASS   (76 gate files, derived)
.\run.cmd review-ui\scripts\negative-control-judge.mjs   4/4
.\run.cmd review-ui\scripts\drill-judge-unavailable.mjs  18/18
```

**WF0 now holds two providers and one classifier.** The doer's branch is byte-for-byte where it
was; the judge's sits beside it behind a router, and both land on the same "Parse or park",
which normalises two error shapes and runs the *same* copy of the classifier over them. One
door, one cost row, one closed set of reasons — and no path from the judge back to the doer.

**The sample is honest because opening a sweep IS the lock.** Sampling and locking are one
operation, so two triggers cannot draw the same rows; a second trigger is refused with
`sweep_in_flight` and draws nothing. A sweep that dies holding the lock is released after
thirty minutes **and the release is recorded** — which stopped being theoretical when sweep
#11 died mid-loop.

**The judge never sees the answer key, and the answer key is still the judge of the judge.**
Disagreement is computed afterwards by the same matcher that grades C1; an item the system
already flagged ungrounded is excluded before counting, and the control proves that exclusion
is doing work rather than describing a row that was uninteresting anyway.

**Three things this story got wrong first, and what they cost:**

1. **A pacing Wait node dropped the caller's connection**, and the sweep died holding the lock.
   The abandoned-sweep release — written before it was needed — is what made that visible
   instead of permanent. Pacing is now a sleep inside a Code node, and the run stays continuous.
2. **A close that bound one parameter short updated nothing and returned `ok`.** Caught because
   the next test failed oddly, not because the close complained. `TC3c` now reads the ROW, not
   the return value: *a function that reports success is not a function that did something.*
3. **The model was named in two places and they disagreed** — a sweep was recorded as
   `gemini-3.7-flash` while `3.8-flash` answered it. The sweep now stores what actually
   answered, read off the call, exactly as `rubric_version` already was.

**And one honest limit, which is not a defect:** the judge runs on a free-tier key. It answered
8 items today and then the day's allowance was gone. `/api/judge` prints the 993 versions and
6,758 requirements that have never been judged on every page load, because a page showing
scores without showing what it has *not* looked at is a coverage claim nobody made.
