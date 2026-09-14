# ADR 0005 — Make PRD versions immutable and record deltas as changes

**Status:** accepted · **Date:** 2026-09-01

## Context

The "living PRD" capability is the part of this build that goes furthest past the original scope:
a follow-up meeting should update an existing PRD rather than produce a second document
nobody reconciles. The question is what "update" means in storage. It matters because a
PM's trust in the system depends on being able to ask "what did we agree in August, and
what changed since?" — and because a PRD that was approved is a record of a decision, so
editing it after the fact would be editing history.

Alternatives:

- **Edit the current version in place, keep a changelog table** — disqualified: the
  changelog and the document drift the first time a write fails halfway, and the
  approved text a team built from can no longer be recovered exactly.
- **Git-style text diffs of the rendered markdown** — disqualified: a diff of prose cannot
  say *which requirement* was contradicted or carry citations, and the delta review screen
  is the feature.
- **Event sourcing every requirement change** — disqualified as over-engineering at this
  scale; it wins on auditability at the field level, which is genuinely more than
  version-level snapshots give, and is the right upgrade if this ever grows.

## Decision

`prd_versions` rows are **immutable once written**. A follow-up document produces a new
version whose content is the previous approved version plus the applied delta; the delta
itself is persisted in `prd_changes` (`added`, `modified`, `contradicted`,
`new_open_questions`) with citations on both sides. Approving version *n+1* sets version
*n* to `superseded`. A rejection never edits a version — it produces a new draft.

## Consequences

- "What changed, and who said so" is answerable by query, with quotes from both the old
  PRD and the new source, which is exactly what the delta review screen renders.
- The approved text a team built from is recoverable forever.
- Eval case C5 becomes checkable: the delta is a stored object with a shape, not a
  narrative.
- **Accepted cost:** storage grows with every review cycle. Irrelevant at this scale;
  noted honestly as a thing that would need pruning at production volume.
- **Accepted cost:** a trivial typo fix still mints a version. This is a real annoyance
  for a PM and is deliberate — a document that can be quietly amended after approval is
  not a record. If it proves too heavy in use, the answer is a "correction" change kind,
  not in-place editing.
- Forces the delta prompt to be strict about not re-emitting unchanged requirements,
  since churn would inflate every version.
