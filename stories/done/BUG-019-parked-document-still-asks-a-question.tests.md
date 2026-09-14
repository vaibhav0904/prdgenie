# Test cases: BUG-019 The requirement-free document produces an open question

Written before the fix, per gate G3.

**The trap this card sets, named first.** The bug is "it asks a question it should not ask",
and the cheapest thing that makes that symptom disappear is a gate that drops every open
question. That gate passes the repro and destroys the feature E3-S4 was built for. **So every
must-fire row here has a must-not-fire twin**, and the twin is the one that matters.

## The product decision inside it, and how it was made

The card says the fix is not obviously the cheap one: a document can honestly say *"I found
nothing to build here, but three things are unresolved."* Does a PM reviewing a park want
that?

**Decided: no — drop them, and count the drops.** Three reasons, in order of weight:

1. **"Nothing" has meant "no requirements" since E1-S3, and that is how this bug happened.**
   G1 is the fixture chosen because its correct output is nothing. Two definitions of nothing
   inside one system is the defect, not the phrasing of the questions.
2. **A question from a document that is not about the product cannot inform a product
   decision.** That is not a judgement about the biscuit budget; it follows from
   `concerns_product: false`, which the extractor has already asserted about the whole
   document.
3. **One absurd question costs the credibility of every real one beside it.** The gap
   detector's whole value is that a PM believes the list. This is the same argument BUG-016
   makes about wording, one field over.

The cost, stated rather than hidden: a document that is genuinely about the product but
produces no requirements — a purely exploratory meeting — loses its questions too. That is a
real loss and it is accepted, because `concerns_product` is a judgement about the **document**,
not about the requirement count. **`no_requirements_found` on a product document still keeps
its open questions**, and TC6 asserts exactly that so this paragraph cannot rot into a lie.

## Where the gate goes, and why it is in two places

| Layer | What it does | Why it is not sufficient alone |
|---|---|---|
| **WF2 wiring** — `About the product?` between grounding and the gap call | a non-product document never reaches the detector; no model call is made | a wire can be moved, and this one cannot be tested without n8n |
| **`gaps.mjs`** — `concernsProduct: false` drops every item, counted | holds regardless of how the run got there | it lets the call be made and thrown away |

BUG-019's own lesson is *every new output needs its own copy of every gate the old output
has*. Building only the wiring would repeat the mistake in a new place.

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **The repro, end to end** — produce G1, read the parked version's questions | zero | **Pass ×3** | `v374`, `v376`, `v378` — `open_questions=0`. Was 1: *"What is the biscuit budget?"* |
| TC2 | **MUST NOT FIRE: a product document keeps its questions**, same runs | T3 still files the SAML/self-serve argument as a grounded `conflict` | **Pass ×3** | `v375`, `v377`, `v379` — 1 conflict each, grounded, both sides cited |
| TC3 | **The call is not made**, not merely discarded | one `llm_calls` row for G1, two for T3 | Pass | G1 `extract-requirements` only, $0.00137; T3 both, $0.00422 |
| TC4 | **The code gate fires on its own**, without n8n | three well-formed questions dropped under `document_not_about_product` | Pass | `verify-gaps.mjs` TC17, 3 of 3 items, reason named on each |
| TC5 | **MUST NOT FIRE, in code**: the same three items with `concernsProduct: true` | all three kept, nothing dropped | Pass | `verify-gaps.mjs` TC17 |
| TC6 | **The default is to keep** | an omitted judgement keeps the questions | Pass | `verify-gaps.mjs` TC17. The endpoint refuses a missing `concerns_product` before this point (`schema_invalid`); a silent `false` here would hide that refusal |
| TC7 | **The envelope counters agree with the list** | `total`, `grounded`, `ungrounded` all 0 on a wholesale drop | Pass | `verify-gaps.mjs` TC17 |
| TC8 | **The checker asserts its own coverage** | every drop reason in `gaps.mjs` is exercised, failing on a gap | Pass | new `COV` row: 7 of 7, **derived from the run** |
| TC9 | **NEGATIVE CONTROL: the coverage row can fail** | an eighth reason nothing exercises turns it red | Pass | added `a_reason_nothing_exercises` → `FAIL COV … NEVER FIRED: a_reason_nothing_exercises`, then removed |
| TC10 | **Run it twice** | byte-identical output | Pass | `31/31` twice, `diff` clean |
| TC11 | **C1 and C2 are not damaged** | both green | Pass | run 28 / run 38. T1 86.7% / 100.0%, T3 100.0% / 87.5% |

**11 of 11 pass.**

## What the coverage row found on its way in

The old line read, hard-coded: `Drop reasons in gaps.mjs: 6. Drop reasons exercised here: 6.`
It was correct when written and would have gone on printing **6 of 6 while a seventh reason
sat untested** — a denominator that cannot grow cannot report a gap, which is BUG-003 exactly.
`DROP_REASONS` is now exported and the row is computed from it, so adding a reason without
testing it turns the file red.

## Out of scope, named so it is not smuggled in

- **BUG-020 is not touched.** `missing_nfr` is still enumerated rather than detected (12 of
  19 kept items in the current report). It stays behind C4, as its card says.
- **The detector's prompt is unchanged.** This is a routing and gating defect; the detector
  answered the question it was asked correctly, and the question was wrong.
