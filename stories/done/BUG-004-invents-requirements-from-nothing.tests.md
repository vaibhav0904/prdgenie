# Test cases: BUG-004 Extraction invents requirements from a requirement-free document

**This is not a fourth prompt iteration.** E2's three-iteration budget was spent and moved
G1 from 16 requirements to 14 — noise, not a trend. The fix under test is **structural**, and
it applies BUG-007's lesson: *suppression is the wrong shape of instruction; a model asked to
notice something and then stay silent about it will mention it roughly a third of the time.*
Give it a destination instead.

So the model is no longer asked to silently withhold. It is asked to **name what the document
is about** — a positive act, a required field — and **code** decides what follows. Same shape
as grounding: the model may judge, the code decides.

| Field | Where | Who sets it |
|---|---|---|
| `document_subject` | top level, required | model — one noun phrase, what the document is about |
| `concerns_product` | top level, required | model — does this document discuss the software product |
| `subject` | per requirement, required | model — what this requirement constrains |
| **the outcome** | `assemble.mjs` | **code** — `concerns_product: false` parks, whatever the model listed |

| # | Case | Steps | Expected | Status | Evidence |
|---|---|---|---|---|---|
| TC1 | **G1 yields nothing** | Ingest and generate G1 | **0 requirements**, version parked with `park_reason = no_requirements_found` | Pass | G1 parks, 0 requirements, in **3 of 3** full runs |
| TC2 | **Code decides, not the model** | Feed assembly a payload with `concerns_product: false` **and a non-empty requirements array** | Parks. The listed requirements are **discarded from the PRD**, not stored as requirements. A model that contradicts itself does not get the benefit of the doubt | Pass | verify-refusal TC2 — judgement wins, list discarded |
| TC3 | **The park keeps the work** | Inspect the parked version's `content` | The discarded requirements are still there under `parked: true`, for audit. A park names a reason and loses nothing (`docs/contracts.md` §3) | Pass | 1 requirement kept under parked:true with the subject recorded |
| TC4 | **No other fixture parks** | Run all nine | Only G1 parks. T1, T2, T3, N1, E1, F1, H1, H2 all produce requirements as before | Pass | only G1 parks; the other 8 produce requirements in all three runs |
| TC5 | **T1 is not damaged** | C1 on T1 | Recall ≥0.80 and precision ≥0.75, and **within the range already measured** (recall 86.7–93.3%). A fix that buys G1 by costing T1 recall is not a fix | Pass | T1 recall 86.7 / 93.3 / 86.7 — inside the range measured before the change |
| TC6 | **T3 is not damaged** | C1 on T3 | 100% / 77.8%, unchanged. T3's two false positives are BUG-007 and must **still be there** — if they vanish too, this change did something broader than it claims | **FAIL** → **Partial**, closed by BUG-018 | **T3 recall 85.7 / 71.4 / 100**, was 100 in every prior run. C1 fails 1 run in 3. Diagnosed: **BUG-018**, and it is not this change inventing a fault — see below. **Re-measured 2026-09-02 at prompt `47ac49c6330b`: 85.7 / 100 / 100, precision 75.0 / 77.8 / 77.8, C1 passes 3 of 3.** Two of three runs match this row exactly; run 11 does not |
| TC7 | **The schema refuses an incomplete response** | Post an extraction result missing `concerns_product` | Rejected at the boundary as `schema_invalid`. Not defaulted to `true`, not cleaned up — a missing judgement is not a positive one | Pass | four shapes of missing judgement, all refused as schema_invalid; absent is never true |
| TC8 | **NEGATIVE CONTROL: the gate can be bypassed** | Force `concerns_product: true` on G1 and re-run assembly | The fourteen requirements come back. This proves the gate is what is doing the work, and not some unrelated change in the same commit | Pass | forcing concerns_product=true makes the same payload assemble — the gate is what does the work |
| TC9 | **NEGATIVE CONTROL: the gate can fire wrongly** | Force `concerns_product: false` on T1 | T1 parks with zero requirements. Confirms the failure mode is real and would be caught — and is exactly why TC4/TC5/TC6 exist | Pass | forcing false on T1 parks it; the misfire mode is real and is why TC4/TC5 exist |
| TC10 | **`subject` is required and populated** | Inspect the extraction response for T1 at the assemble boundary | Every requirement carries a non-empty `subject`. An optional field the model may omit is not a forcing function. **Checked at the boundary, not in storage** — persisting it needs a schema column, and that belongs with E4, the screen that would show it. One structural change per attempt | Pass | every requirement in the T1 response carries a non-empty subject |
| TC11 | **Three runs, and the range is published** | Produce and grade three times | G1 = 0 in **all three**. G1's count was 14/16/14 before, so a single zero proves nothing — the instability is the reason this rule needs the spread (`evals/README.md` rule 4) | Pass | G1 = 0 in all three. Previously 14 / 16 / 14 |
| TC12 | **Coverage asserted** (BUG-003) | The check compares fixtures examined against fixtures in the manifest | 9 of 9. A run that skipped G1 must fail, not report success | Pass | 9 of 9 fixtures in every run |
| TC13 | **Eval gate** | `/eval` | **C2 PASSES** — all three auto-fail rules. C1 still passes. This is the card that closes C2, and with it E2-S3 | **Partial** | **C2 PASSES, 3 of 3 — the first time ever.** C1 fails 1 of 3 on T3 (BUG-018) |
| TC14 | **`prompt_version` moves and is recorded** | `sync-prompts.mjs`, then check `llm_calls` | A new content hash, stamped on the runs being graded. A result file naming the old version is grading something else | Pass | prompt_version 7267c39b005e -> **5ad1a07854f1**, stamped on the graded runs |

## What would make me stop and file rather than iterate

If G1 still produces requirements with `concerns_product` reported as `true`, **that is the
answer, not a prompt to try again.** It would mean the model cannot tell a document about
parking from a document about software even when asked directly — which is a finding worth
reporting honestly in the deck, and a much more interesting one than "we tuned it until it
passed". The card gets that result written into it and C2 stays red.

The budget for this attempt is **one structural change**, not three. If it fails, the failure
pattern is the deliverable.

## Out of scope

- **BUG-016** (requirement wording). `subject` may help it and that is a side effect, not a
  claim. It is measured by a human reading the output, not by this card.
- **BUG-007.** T3's two remaining false positives are unsettled-argument items and must
  survive this change untouched (TC6). E3-S4 owns them.

## Notes

- The gate lives in `assemble.mjs` beside `readiness()`, which is where park already lives
  and where derived state is computed at call time rather than stored.
- `no_requirements_found` is an existing park reason and needs no schema change; the
  contract already anticipated this outcome, which is a small piece of evidence that the
  original design was right and only the judgement was missing.

## Evidence

```
.\run.cmd review-ui/scripts/verify-refusal.mjs            11/11 passed
.\run.cmd evals/harness/negative-control-refusal.mjs       both directions, tree unchanged
3 x produce + grade                                        C2 PASS/PASS/PASS · C1 PASS/FAIL/PASS
```

**13 of 14 rows Pass. TC6 fails and is left failing** — it was closed the same day by BUG-018,
which narrowed the prompt clause that was suppressing `T3-R07`. C1 now passes 3 of 3; the row
is marked Partial rather than Pass because 2 of 3 runs match its figures and one does not.

### What worked

G1 produces **zero requirements in three runs of three**, and the model gets there by itself:
it returns `document_subject: "staff parking and office facilities"`, `concerns_product:
false`, and an empty list. The code gate never had to fire on the real path — it is the
backstop, not the mechanism.

That is the interesting part. Three iterations of increasingly explicit *"do not extract
these"* moved G1 from 16 to 14. One change from **suppression to naming** took it to 0. The
model was never unable to tell a parking meeting from a product meeting; it was being asked
to notice and then stay silent, which is the instruction shape BUG-007 already showed does
not hold.

**C2 passes for the first time since it was written.**

### What broke, and why it is not this change's fault

T3 recall was 100% in every run before this and is now **85.7 / 71.4 / 100**. The
consistently missed label is `T3-R07`, the tablet cut.

The extraction prompt contains, as a worked example of what **not** to extract:

> A decision described as provisional — *"let's call it cut for now"* — is not settled either.

`T3-R07`'s own supporting quote is *"Let's call it cut for now."* **The prompt forbids by
name the requirement the answer key demands.** The contradiction was created by the label
review of 2026-09-02 and has been live ever since; it stayed invisible because the model was
ignoring the clause about a third of the time.

This change made the model apply its exclusion rules more consistently. So a **more obedient
model scored worse**, which is the whole of BUG-018.

### Why nothing is being tuned in response

Fixing this means either narrowing the prompt clause or reconsidering `T3-R07`, and both are
Vaibhav's reading of his own relabel. **BUG-018 goes over as a question with no
recommendation attached** — BUG-009's lesson, where a card named a decision as his and then
built the recommendation before the decision came back.

The budget for this card was one structural change. It was spent, it worked, and the thing it
uncovered belongs to someone else.
