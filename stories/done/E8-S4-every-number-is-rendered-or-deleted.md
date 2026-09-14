# E8-S4: Every number is rendered or deleted

**As a** builder
**I want** the audit that pairs each query column with the place it appears
**So that** the metrics surface cannot quietly accumulate numbers nobody reads

## Acceptance criteria

- [ ] **The render/query audit**: a checklist in this story's Outcome naming each query, its
      columns, and where each column is rendered. A column with no home is **deleted or given
      one** — no third option.
- [ ] The checklist is written so the next person **repeats** it rather than re-deriving it
      (PRD decision 4).
- [ ] **The observability drill, performed and dated** in `docs/traceability.md`: the logging
      path is stopped **mid-run**, the run still reaches `in_review`, and nothing else
      notices. Telemetry may fail; the product may not.
- [ ] The drill is performed **on the real path**, not by editing the code into a shape that
      makes it easy — the same rule E7-S4 holds for fault injection.
- [ ] **Run it twice** (BUG-021).

## Depends on
- E8-S1, E8-S2

## Eval gate
- None. A dated drill, like E7-S4.

## Technical notes

- `/internal/llm-call` already catches and logs telemetry failures rather than raising
  them. This drill is what turns that line from an intention into a fact.
- The audit is the cheapest defence against the failure this epic exists to prevent: a
  number that is computed, rendered, and means something other than its name.
