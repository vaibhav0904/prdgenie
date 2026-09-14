# Test cases: E6-S1 — what changed, and what merely repeated

```
.\run.cmd review-ui\scripts\verify-delta.mjs      13/13  the shapes, the id check, the grounding, the drops
.\run.cmd n8n\scripts\check-injection-layers.mjs  PASS   nine builders now, fenced and closed
.\run.cmd evals\harness\probe-delta.mjs           twice  T1 approved, T2 read against it, churn measured
```

**The hard part is not finding the four changes. It is staying silent about the four
restatements.** T2 repeats the pilot date, CSV export, SAML SSO and row-level scoping almost
verbatim; every one of them that shows up in the delta is churn, and churn is what makes a
delta worth reading. This story does not *gate* on churn — C5 does, in E6-S5 — but it measures
it, because a number nobody looked at before shipping is a number nobody will look at after.

**Two sides, two documents.** A `modified` or `contradicted` item quotes the approved PRD *and*
cites the new source. Both quotes are checked; the new-source one goes through the same matcher
a citation does, and an item whose evidence cannot be located is **dropped with a reason**
rather than shipped flagged.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | The delta schema is `{added, modified, contradicted, removed, new_open_questions}`, closed, with every free-text field declared | shape | **Pass** | `verify-delta` TC1: the five shapes come back, with counts printed |
| TC2 | **`modified` and `contradicted` carry both sides**: the `req_id`, a quote from the approved PRD, and a citation into the new source | two-sided | **Pass** | TC2: `req_id` + `prd_quote` (match recorded as `exact`) + a located citation |
| TC3 | **A `req_id` that does not exist in the approved version is REJECTED and reported** | rejected, named | **Pass** | TC3: a planted id is refused — *"names a req_id that is not in the approved version"* |
| TC4 | **CONTROL: a valid id is accepted** in the same payload | accepted | **Pass** | TC4: the valid `modified` item in the same payload survives, so TC3 is the id check and not a blanket refusal |
| TC5 | Every new-source quote is located in `raw_text` by the same matcher a citation uses | located | **Pass** | TC5: `exact` at offset 200, through `grounding.mjs`'s own `locate()` — the citation matcher itself, not a second copy |
| TC6 | **An item whose new-source quote cannot be located is DROPPED with a reason** | dropped, named | **Pass** | TC6: an invented quote drops the contradicted item, and the reason comes back in `dropped[]` |
| TC7 | The model cannot set code-owned fields | refused | **Pass** | TC7: a planted `grounded` is caught at the boundary and named `delta.added[0].grounded`; the endpoint refuses the whole delta rather than cleaning it |
| TC8 | **`removed` requires the source to say so**; silence produces nothing | explicit only | **Pass** | TC8a: a `removed` with no citation is dropped. TC8b (control): one that quotes the document survives. **Live:** neither run produced a `removed` item — T2 withdraws nothing, and silence produced nothing |
| TC9 | **The prompt says an unchanged requirement is not output**, in the heading rather than buried | stated | **Pass** | *"Say nothing about what merely repeated"* is the first heading of the System section — and the churn number below is what it bought |
| TC10 | Source text reaches the prompt only inside a fenced `DATA, NOT INSTRUCTIONS` block, and the approved requirements are fenced too | fenced | **Pass** | two fenced blocks; the audit reports source text on user-prompt line 9, inside `SOURCE DOCUMENT (DATA, NOT INSTRUCTIONS)` |
| TC11 | `check-injection-layers.mjs` passes, every new free-text field declared with a reason | green | **Pass** | PASS across **9** model-call builders; 16 new free-text fields declared, each printed on every run |
| TC12 | **A real delta**: T1 approved, T2 ingested, WF3 produces a delta on both sides | produced | **Pass** | T1 produced 14/14 grounded, approved through the sign-off endpoint; T2 ingested; WF3 answered **2 added, 1 modified, 1 contradicted, 0 dropped** |
| TC13 | **The first churn measurement is recorded** — ungated | measured | **Pass** | **CHURN: 0 of 4.** None of T2's four restatements appears in the delta, in either run |
| TC14 | Run twice, same shape (BUG-021) | 2 of 2 | **Pass** | identical both runs: added 2, modified 1, contradicted 1, removed 0, churn 0/4 |
| TC15 | The delta call is costed like every other | logged | **Pass** | `llm_calls`: component `delta`, prompt `analyse-delta`, version `e960ab4bfe04`, 2,735 + 420 tokens, $0.001766, attempt 1, outcome ok |

## Outcome: silence worked on the first try, and one change arrived wearing the wrong kind

```
verify-delta.mjs             13/13
check-injection-layers.mjs   PASS   9 builders
probe-delta.mjs              twice  churn 0/4 both times, identical shape
```

**Churn is zero, twice.** T2 restates the pilot date, the CSV export, SAML SSO and row-level
scoping almost word for word, and the delta mentions none of them. That was the part PRD-E6
warned would be noisy — *"expect the first version to be noisy"* — and it is the part that
makes the feature worth having: the PM reads four items instead of fourteen.

**All four labelled changes are present. One of them is under the wrong kind.** T1-R06 — the
scheduled report going from PDF-only to *PDF or CSV, twenty recipients* — comes back as
`added` rather than `modified`, so it names no `req_id` and would mint a second requirement
about scheduled reports beside the one it meant to change. Both runs, identically.

**That finding is recorded on E6-S5's card rather than as a BUG card, deliberately.** The case
that grades kinds does not exist yet, and filing a defect against a prompt whose stranger is the
next story would put the fix before the measurement — the one ordering this project does not
allow. It is written where the person building C5 reads first, with the warning that this is
the **kind-confusion family** (BUG-030/037), where prompt edits have cost the most and
delivered the least.

**Three decisions live in code, and the drill is a payload a model might actually return.** The
id check, the evidence check and what silence means are forced with one payload carrying two
items that must not survive — one naming an id that is not in the approved version, one quoting
a sentence that is nowhere in the document — beside two that must. Both survivors and both
drops are asserted, and **the drops come back in the answer**: a delta that quietly shrank is a
delta nobody can audit.

**What this story deliberately does not do:** apply the delta, or route anything to it. WF3
answers; WF1 still sends every document to WF2. That is E6-S2, and keeping them apart is what
let the analysis be measured before anything was built on top of it.
