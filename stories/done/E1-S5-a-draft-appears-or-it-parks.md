# E1-S5: A draft appears — or it parks and tells me why

**As a** PM
**I want** the run to end in a document waiting for my review, or in a visible park with a reason
**So that** I am never handed a confident half-finished PRD, and never left wondering what happened

## Acceptance criteria

- [ ] Assembly produces a PRDVersion whose content validates against the PRD schema via
      `/internal/validate`; an invalid document does not reach `draft`.
- [ ] A valid version is stored as `draft` and transitioned to `in_review` in one run,
      with an event written at each transition carrying the same `trace_id` as the document.
- [ ] A run with **zero grounded requirements** parks `needs_review` with reason
      `grounding_below_floor` and creates **no** PRDVersion in `draft` — a partial document
      is the confident-wrong-answer failure the architecture forbids.
- [ ] A run over a requirement-free document parks `needs_review` with reason
      `no_requirements_found`, and the source document survives intact.
- [ ] A `needs_review` park keeps the work, is visible, and is resumable — it is a park,
      not an error, and nothing is discarded on that path.
- [ ] One SQL query joining on `trace_id` returns the document, its requirements, its
      version and its events — answering "what happened to this document" in one go.

## Depends on
- E1-S4

## Eval gate
- none in this story. The **fault-injection case that proves a forced LLM failure parks
  rather than produces is E7-S4** — it closes the pending row in `evals/README.md`'s
  coverage matrix. Until then, criteria 3 and 4 are verified by running them, not graded.

## Technical notes

- The E1 PRD is a **flat requirement list**. No epics, no features, no stories, no priority
  (PRD-E1 non-goals) — structure arrives in E3, and building it before the gate is proven
  risks building it twice.
- Readiness is **computed, never a stored flag** (`docs/contracts.md` §4). "≥1 grounded
  requirement" is evaluated at call time from the rows, not read from a column someone
  might forget to update.
- The floor is deliberately "≥1 grounded requirement", not a percentage. Any percentage
  here would be a number chosen to make the fixtures pass (`docs/assumptions.md`).
- Reason codes come from the closed set in `docs/contracts.md` §1. Adding one means editing
  the contract, which is the intended friction.
- Telemetry writes are parallel and continue-on-failure — a failed event insert must never
  stop a run. The drill that proves this is E8-S4; the shape must be right from here.

## Outcome (2026-09-01)

**Verified by running.** 15/15 in `verify-assembly`, plus a live full-chain run: fixture T1
enters through the n8n door, is extracted by `gpt-4.1-mini`, grounded by code, and lands as
**PRDVersion 1 in `in_review`** with 15 of 15 requirements grounded. One `trace_id` joins
the document, the requirements, the version and the `ingested → draft_created → in_review`
event chain — the traceability clause in `docs/contracts.md` §5 is now demonstrable rather
than aspirational.

**Promoted on evidence** under the G6 scoping: every criterion has an exactly-stated
expected result.

**The row that matters is TC5b, and it is an absence.** When no requirement is grounded,
the run parks with `grounding_below_floor` **and creates no draft version at all** —
verified by counting unparked drafts before and after (`0 → 0`). A half-assembled draft
from an ungrounded run would be exactly the confident-wrong-answer failure
`docs/architecture.md` forbids, and it would look completely normal in the inbox. The
useful assertion here is that nothing exists, which is easy to forget to test.

**Nothing surprising broke**, which is itself worth recording after four stories that each
turned up a defect. The likely reason is that this story's logic is entirely deterministic
and its shape was fixed in `docs/contracts.md` before any code existed — the readiness
gates and the closed reason-code set were already written down, so implementation was
transcription rather than invention.

**What this card cannot claim.** The PRD is a flat requirement list: no epics, features,
stories or priority (PRD-E1 non-goals, arriving in E3). The park path is proven for
`grounding_below_floor` and `no_requirements_found`, but no real LLM timeout has been
induced — that is E7-S4. And BUG-004 still stands: a document with no product requirements
can still produce a full, confident, well-cited PRD.
