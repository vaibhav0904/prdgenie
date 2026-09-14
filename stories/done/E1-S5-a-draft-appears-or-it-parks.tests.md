# Test cases: E1-S5 A draft appears — or it parks and tells me why

Written before any build work, per gate G3.
Re-runnable as `.\run.cmd review-ui/scripts/verify-assembly.mjs`.

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | A valid document validates against the PRD schema | `/internal/validate` returns ok for a well-formed version | Not Run | |
| TC2 | An invalid document never reaches `draft` | Missing required fields → `status: error`, `reason: schema_invalid`, no row written | Not Run | |
| TC3 | A valid run stores `draft` then transitions to `in_review` in one call | One `prd_versions` row ending in `in_review` | Not Run | |
| TC4 | An event is written at each transition, sharing the document's `trace_id` | `draft_created` and `in_review` events present | Not Run | |
| TC5 | **Zero grounded requirements parks, and creates no draft** | `needs_review`, `reason: grounding_below_floor`, and **no `prd_versions` row in `draft`** | Not Run | |
| TC6 | A requirement-free document parks, and the source survives | `needs_review`, `reason: no_requirements_found`; the `source_documents` row is intact | Not Run | |
| TC7 | A park keeps the work and is resumable | The park is recorded with its reason and the requirements are still retrievable — a park is not an error and discards nothing | Not Run | |
| TC8 | Readiness is computed, never a stored flag | The floor is evaluated from rows at call time; there is no `is_ready` column | Not Run | |
| TC9 | **One query answers "what happened to this document"** | `query.mjs trace <id>` returns the document, its requirements, its version and its events | Not Run | |
| TC10 | The reason code comes from the closed set | Every park reason appears in `docs/contracts.md` §1 | Not Run | |
| TC11 | **Negative control** — the assembly check can fail | Force an invalid version → red, naming the failure | Not Run | |
| TC12 | Coverage is asserted | Reports assertions run vs planned, fails on a gap (BUG-003) | Not Run | |

## Notes

- TC5 is the load-bearing row. A partially-assembled draft from an ungrounded run is
  exactly the "confident wrong answer" `docs/architecture.md` forbids — the absence of the
  row matters more than the presence of the reason.
- The E1 PRD is a **flat requirement list**: no epics, features, stories or priority. That
  is PRD-E1's non-goal, not an omission.
- The floor is "≥1 grounded requirement", deliberately not a percentage — any percentage
  here would be a number chosen to make the fixtures pass (`docs/assumptions.md`).

## Evidence

`.\run.cmd review-ui/scripts/verify-assembly.mjs` → **15/15 passed**.

Row-level detail:
- **TC2** refusal names the fields: `requirements[0].statement, requirements[0].kind, requirements[0].citations`
- **TC4** event chain on one `trace_id`: `ingested → draft_created → in_review`
- **TC5** the load-bearing pair: park reason `grounding_below_floor`, **and** unparked draft
  count unchanged `0 → 0` — the absence of the row is what matters
- **TC9** one `trace_id` returned 2 requirements, 1 version, 3 events
- **TC10** park reasons used are both in the contract's closed set
- **TC12** coverage 14/14 assertions

**Live full-chain run** (T1 through WF1 → WF2 → WF0 → grounding → assemble):
`status=ok state=in_review version=1 total=15 grounded=15`, review URL returned, and
`query.mjs trace` joins the document, its version and all three events on one id.
