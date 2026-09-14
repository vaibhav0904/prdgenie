undefined Pass | undefined Pass. full verifier sweep green after the change || undefined Pass. `verify-unsettled` 28/28 twice, identical || undefined Pass. C1 and C2 pass 3 of 3 (runs 33-35) || undefined Pass. none / all-malformed / well-formed all assemble to `in_review` with an identical requirement count || undefined Pass. a fourth reason nothing exercises turns the row red; removed after || undefined Pass. coverage derived from `DROP_REASONS`, 3 of 3 || undefined Pass. both sides kept, grounded by code, stakeholders preserved, one citation sufficient || undefined Pass. three drop reasons, each fired under its own name || undefined **Fail**, and allowed to. `verify-unsettled.mjs` — model-set `grounded` and `match_kind` both refused || undefined Pass. `T1-R05` in 1 of 3 — the same rate as before. **BUG-023 stays open** || undefined Pass. T3 still carries its grounded `conflict` open question; the detector was not touched || undefined Pass. T1 recall 93.3 / 86.7 / 86.7, precision 100.0 x3 || undefined Pass. T3 recall 100.0 x3 || undefined **Pass**, after the code rule. `T3-R07` matched in all three runs; the drawer was not over-filled || undefined Pass. **100.0 x3.** On the prompt change alone it was 87.5 / 87.5 / 77.8 — the model filed the positions AND kept them || undefined Pass. `verify-prompt-hygiene` green, 109 quotes x 2 prompts || # Test cases: BUG-007 — an unsettled argument has somewhere to go

Written before the build, per gate G3. **16 of 17 pass; TC8 fails and was allowed to.** **16 of 17 pass; TC8 fails and was allowed to.** The decision it implements, and the four predictions
it has to survive, are on the card.

## The trap, named before anything is written

The symptom is "the model emits things it should not", and **the cheapest thing that removes
the symptom is a drawer the model can put anything in.** A change that moves both sides of
`T3-Q01` out of the requirement list and also takes `T3-R07` with it has not fixed this card;
it has traded a precision defect for a recall defect and made the number look better.

So every row that checks the new box is **paired with a row that checks what must stay out of
it**, and `T3-R07` is named explicitly rather than being left to the aggregate.

## What is being built. the exclusion bullet now names the destination; a new section says what does *not* belong in it, with an invented worked example || Layer | Change |
|---|---|
| `n8n/prompts/extract-requirements.md` | the exclusion becomes a redirect: an unsettled position goes in `unsettled_positions`, not nowhere. Schema gains the array; a worked invented example shows one document producing both a requirement and an unsettled position |
| `review-ui/unsettled.mjs` | code owns shape and grounding, exactly as `gaps.mjs` does: a legal entry needs a position and at least one citation; `grounded` is set by `locate()`, never by the model |
| `/internal/assemble` | accepts `unsettled_positions`, refuses model-set grounding fields, stores them in the version content, counts them in the envelope |
| WF2 | passes them from the extract node to assembly |

**Not built:** the reconciliation pass (Option 2), a second author of open questions, and any
change to the gap detector. The detector still writes the `conflict` question on T3.

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **The prompt redirects rather than forbids** | the exclusion bullet names the destination | Pass | the exclusion bullet now names the destination; a new section says what does *not* belong in it, with an invented worked example |
| TC2 | **The prompt does not quote a graded fixture** | `verify-prompt-hygiene` green | Pass | `verify-prompt-hygiene` green, 109 quotes x 2 prompts |
| TC3 | **T3 precision reaches 100%**, 3 runs | both sides of `T3-Q01` leave the requirement list | **Pass**, after the code rule | prediction 1. **100.0 x3.** On the prompt change alone: 87.5 / 87.5 / 77.8 — the model filed the positions AND kept them |
| TC4 | **MUST NOT FIRE: `T3-R07` stays a requirement**, 3 runs | the tablet cut is a decision over a dissent, not an open argument | Pass | prediction 2. `T3-R07` matched in all three runs; the drawer was not over-filled |
| TC5 | **T3 recall stays 100%**, 3 runs | nothing else is swept into the new box | Pass | prediction 2. T3 recall 100.0 x3 |
| TC6 | **T1 is unharmed**, 3 runs | recall ≥ 86.7%, precision 100% | Pass | prediction 3. T1 recall 93.3 / 86.7 / 86.7, precision 100.0 x3 |
| TC7 | **The detector still writes the question**, 3 runs | T3 still carries a grounded `conflict` open question | Pass | the new box must not cost E3-S4's output. T3 still carries its grounded `conflict` open question; the detector was untouched |
| TC8 | **`T1-R05` returns**, ≥2 of 3 | BUG-023's hypothesis, **allowed to fail alone** | **Fail**, allowed to | prediction 4. `T1-R05` in 1 of 3, the same rate as before. **BUG-023 stays open** |
| TC9 | **Code sets `grounded`, the model never does** | a model-supplied `grounded` or `match_kind` is refused as `schema_invalid` | Pass | same rule as requirements and open questions. model-set `grounded` and `match_kind` both refused |
| TC10 | **A malformed entry is dropped and counted**, never silently vanished | each drop names its reason | Pass | three drop reasons, each fired under its own name |
| TC11 | **MUST NOT FIRE: a well-formed entry survives** | kept, grounded, in the version content | Pass | both sides kept, grounded by code, stakeholders preserved, one citation sufficient |
| TC12 | **The checker asserts its own coverage**, derived | every drop reason exercised, failing on a gap | Pass | BUG-003/019. coverage derived from `DROP_REASONS`, 3 of 3 |
| TC13 | **NEGATIVE CONTROL: the checker can fail** | an unexercised reason turns it red | Pass | a fourth reason nothing exercises turns the row red; removed after |
| TC14 | **Unsettled positions can never block assembly** | a PRD assembles identically with none, with malformed ones, and with real ones | Pass | E3-S4's rule, applied to the second new output. none / all-malformed / well-formed all assemble to `in_review`, identical requirement counts |
| TC15 | **C1 and C2 green**, 3 runs | both cases pass | Pass | C1 and C2 pass 3 of 3 (runs 33-35) |
| TC16 | **Run every check twice** | identical | Pass | BUG-021. `verify-unsettled` 28/28 twice, identical |
| TC17 | **No verifier is left a row to trip over** | the whole verifier sweep green after this work | Pass | the rule BUG-012's test plan earned. full verifier sweep green after the change |

## Out of scope, named so it is not smuggled in

- **The gap detector's prompt is untouched.** If the extractor and the detector both describe
  the same argument, that is a duplicate to measure and report, not to silence by editing
  the detector in the same change.
- **C4 is still unbuilt**, so nothing here claims the *quality* of what lands in the new box
  beyond grounding and shape. E3-S6 owns that.
- **No label is edited.** `T3-Q01` and `T3-R07` stand exactly as Vaibhav's review left them.
