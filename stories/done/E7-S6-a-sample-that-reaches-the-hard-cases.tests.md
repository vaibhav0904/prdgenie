# Test cases: E7-S6 — a sample that reaches the hard cases

```
.\run.cmd review-ui\scripts\verify-strata.mjs             23/23  the quotas, the shortfalls, the rule that moved
.\run.cmd review-ui\scripts\negative-control-strata.mjs   6/6    three planted spine breaks, and one benign plant
.\run.cmd review-ui\scripts\verify-judge.mjs              35/35  E7-S5's rows, still green
.\run.cmd review-ui\scripts\verify-judge-isolation.mjs    PASS   83 gate files; the judge still reaches none
.\run.cmd review-ui\scripts\negative-control-judge.mjs    4/4    that check can still go red
.\run.cmd review-ui\scripts\judge-sweep.mjs              #19     a real sweep — and the quota that stopped it
```

**Stratifying a sample is the easiest way to lie with one.** Over-sample the hard rows, pool
the verdicts, and the monitor reports a disagreement rate that belongs to a draw chosen for
being difficult. Most of these rows exist to stop that, not to prove that quotas work.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | The sample is drawn **by quota across named strata**, and the quotas sum to `MAX_REQUIREMENTS` | sums to 20 | **Pass** | TC1, **derived not typed**: `ungrounded:4 approved_anyway:2 human_edited:2 nonfunctional:3 constraint:3 uniform:6 = 20 of 20`. `judge.mjs` throws at import if they ever disagree |
| TC2 | **`uniform` is never zero** — a sample of only interesting rows is not a sample | ≥1 | **Pass** | TC2: quota 6, and it is asserted to be *not* one of the targeted strata. TC2b: every stratum carries the reason it costs a slot, in the code beside it |
| TC3 | **Every judged row carries its stratum**, stored at draw time rather than carried through the model | 0 unknown | **Pass** | TC3: 22 items, 7 strata. TC3b: `judge_sample` holds the draw — `approved_anyway:2 constraint:3 nonfunctional:3 ungrounded:4 uniform:8 version_approved:1 version_in_review:1` |
| TC4 | The **ungrounded** stratum actually draws ungrounded rows | ≥1, grounded=0 | **Pass** | TC4: 4 drawn of 108 available. TC4b: all four really are `grounded=0`, checked on the rows not on the label |
| TC5 | **A stratum that cannot fill reports its shortfall** — wanted *n*, got *m* — and the slots flow to `uniform` | printed, total still 20 | **Pass** | TC5, and it happened for real on the first draw: `human_edited wanted 2 got 0`, uniform absorbed the two, total still 20. Stored on the sweep row, not just printed |
| TC6 | **CONTROL: an unmeetable quota is visible, not silent** | named | **Pass** | TC6: a planted `cannot_match` stratum reports `wanted 4 got 0`; TC6b: the sweep still fills 20 of 20 |
| TC7 | **The disagreement rule stops reading rows drawn for being hard** | targeted excluded | **Pass** | TC7: the same four contradictions, drawn as `ungrounded`, give `0/0 comparable, rule=null`. TC7b: every excluded row names the stratum that excluded it |
| TC8 | **CONTROL: those same rows, drawn uniformly, DO fire the rule** — the change is load-bearing, not cosmetic | pooled fires | **Pass** | TC8: `4/4 comparable`, `over_40_percent` fires. **One thing varied — the stratum — and nothing else** |
| TC9 | Targeted strata are reported **as counts per stratum, never a pooled rate** | no rate | **Pass** | TC9: `{"judged":4,"supported":0,"unsupported":4,"cannot_tell":0}` — asserted to carry no `rate` key |
| TC10 | **No stratum reads `source_channel`, `doc_type` or `authorship`** — derived from the sampler's SQL | 0 references | **Pass** | TC10: 6 strata scanned against 3 forbidden columns. Every stratum is an *outcome* property |
| TC11 | **The stratum never reaches the model** | not forwarded | **Pass** | TC11 reads the **shipped** WF6 node (4,942 chars): the builder forwards `trace_id, doc_id, artefact, source_text` and neither `stratum` nor `grounded`. Telling a judge what we already suspect ends its independence as surely as showing it the labels |
| TC12 | **CONTROL: the stratifier disabled reproduces E7-S5's uniform draw** | uniform | **Pass** | TC12: 20 rows, all `uniform` |
| TC13 | Coverage is printed **per stratum** (judged / total), not one corpus-wide percentage | per stratum | **Pass** | TC13, and live on `/api/judge`: `ungrounded 0/108 · approved_anyway 0/10 · human_edited 0/0 · nonfunctional 7/1574 · constraint 9/2035 · uniform 27/7099` |
| TC14 | **Opening a sweep is still the lock** | 409 | **Pass** | TC14: `sweep_in_flight`, and E7-S5's TC4 still green |
| TC15 | A sweep still writes **only to the judge's own tables** | unchanged | **Pass** | TC15 + verify-judge TC16: 19 other tables unchanged across the same operations |
| TC16 | **E7-S5's suite is still green** | all green | **Pass** | 35/35, isolation PASS over 83 gate files, control 4/4. `audit-render` 74/74 with the new API field homed; `verify-gate` 9/9, `verify-metrics` 51/51, `verify-weekly` 44/44, `verify-signoff` 9/9, `verify-review-gate` 23/23, `verify-grounding` 14/14, `verify-structure` 31/31 |
| TC17 | **A real sweep judges at least one ungrounded row** — which has never happened | ≥1 | **Pass — 4 of 4** | Sweep **#23**: all four `ungrounded` rows answered, plus one approved PRD version. It took four sweeps (#19–#23) and a bug fix to get there; #19–#21 recorded `llm_no_credit` on nearly every call, and **BUG-041's fix is what turned that from noise into a diagnosis** — the stored detail now names `generate_content_free_tier_requests, limit: 20`. Quota still throttles a sweep (#23 scored 5 of 22), so coverage grows a few rows at a time, which is what the per-stratum figures are for |
| TC17b | **The judge's first opinion on ungrounded rows is worth having** | informative | **Pass, and it earned its keep** | **3 of 4 unsupported, agreeing with our grounding code** — all three are the statement *"Charts paint instantly"* against a source that says *"the first chart paints in under two seconds"*, and the judge says so in those words. **The 4th is the interesting one**: `775-REQ-003`, a constraint about a separate aggregation store, which our citation matcher could not locate but the judge finds stated outright in the source. That is the **first measured instance** of the paraphrase-brittleness this project declared in its honesty ledger on day one — reported ungrounded, which is the safe direction, at a cost in PM effort |
| TC17c | **None of it counts as a violation, and none of it moves a rate** | 0 comparable | **Pass** | Those four rows are excluded twice over — by the defensive rule (`grounded_at_judge_time = 0`) and by the sampling rule (drawn from a targeted stratum) — and sweep #23 reports `0 disagreement(s) of 0 comparable`. **The judge just produced its first genuinely useful observation and it still gates nothing** |
| TC18 | **Cost is unchanged** | ≤22 calls | **Pass** | TC18: 22 items against a ceiling of 22. Lifetime judge spend **$0.036 over 384 calls**; sweep #19 cost **$0.0009** — the 21 refusals carry no tokens, which is why they price at zero honestly |
| TC11b | **CONTROL: the spine check on the sampler can go red, per column** | red ×3 | **Pass** | `negative-control-strata.mjs` NC2/NC3/NC4: a planted `doc_type`, `source_channel` and `authorship` stratum each turns TC10 red and names the stratum. **NC5 is the counter-control**: a stratum on `r.confidence` is accepted — the scan reads the columns, not novelty. NC6: nothing was written to disk |

## Outcome: the money now buys the rows that can surprise us

```
verify-strata.mjs             23/23
negative-control-strata.mjs   6/6
verify-judge.mjs              35/35     (unchanged)
verify-judge-isolation.mjs    PASS      (83 gate files, derived)
```

**The sweep was already random. It was not reaching anything.** Twenty-seven requirements had
been judged and not one of them was ungrounded, against a rubric whose central clause is about
ungrounded rows. The quotas cost nothing extra — same 22 calls, same ~$0.03 — they change
which rows the money is spent on.

**The interesting engineering is the rate, not the quotas.** A stratified sample pooled into
one number lets the sampler manufacture its own alarm. TC7 and TC8 are the same four
contradictions on the same four rows, differing in one thing: uniform fires the 40% rule,
`ungrounded` does not. Exclusion is by *targeted* stratum, so a row of unknown provenance still
counts — if the design must err, it errs toward the alarm firing.

**One shortfall, and it is honest.** `human_edited` drew 0 of 2 — every edit in the corpus so
far is on a `pm_authored` requirement, which the sampler excludes by design (E4-S6). It prints
as short, its slots go to `uniform`, and it will fill the first time a PM edits a
system-extracted requirement.

**The payoff arrived on sweep #23, and it was not the one I expected.** The four ungrounded
rows finally got an opinion. Three of them are *"Charts paint instantly"* against a source that
says *"the first chart paints in under two seconds"* — the judge calls them unsupported and
quotes the difference, independently corroborating the grounding code on exactly the rows it
flags. The fourth says the opposite: a constraint our citation matcher could not locate, which
the judge finds stated plainly in the source. **That is the paraphrase-brittleness this project
declared in its honesty ledger before it had a single measurement, now with one.**

**And it still gates nothing.** Those four rows are excluded from the disagreement rate twice
over — once by the defensive rule, once by the sampling rule — so the monitor produced its
first genuinely useful observation without a single number moving. That was the whole design.

**Two cards came out of getting here, neither folded in.** **BUG-041** (fixed, in `done/`): the
stored provider message was truncated one word before the metric name, and the first attempt at
the fix shipped a worse bug — a shell ate a backslash, the node ran `/s+/g`, and every letter
*s* became a space. **BUG-042** (open, major): a partially-answered sweep walks the sample in
stratum order, so it judges one stratum's worth of rows rather than a subset of the draw.
Sweep #22 scored 8 and all 8 were `uniform`.
