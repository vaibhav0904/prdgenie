# ADR 0002 — Store everything in SQLite behind a single-writer service

**Status:** accepted · **Date:** 2026-09-01

## Context

Three requirements decide this. Metrics must be traceable to rows and joined on
`trace_id` across documents, requirements, reviews, events and cost. PRD versions must be
immutable and orderable. And the approval gate must be enforceable somewhere that n8n
cannot reach around — which means the enforcement has to live in the store itself.

Alternatives:

- **Flat JSON files on disk** — disqualified: no joins, so every metric becomes a script
  that walks files, and "computed by" degrades from a query into a program nobody re-runs.
  It genuinely wins on inspectability for a stranger, which matters here; SQLite recovers
  most of that with a one-file database and a bundled read-only query script.
- **n8n's own static data / a Google Sheet** — disqualified: no constraints, no triggers,
  no transactional writes; the gate would be a convention again.
- **Postgres in Docker** — disqualified on stranger setup cost. It wins on concurrency and
  on being the honest production answer, and `assumptions.md` records that swap.
- **Letting n8n write the database directly** — disqualified: multiple writers means the
  transition rules live in whichever node ran last.

## Decision

Storage is a single SQLite file at `data/prdgenie.db`. **The Node review service is the
only writer.** n8n reaches it over HTTP (`/internal/*`); the eval harness reads the same
database and calls the same endpoints. State transitions are enforced by triggers inside
the database, so even a hand-run `UPDATE` is refused.

## Consequences

- Every metric in `docs/metrics.md` can name a real SQL query, and a stranger can hand-run
  it in one command — which is what makes the traceability clause enforceable.
- One writer means transitions have exactly one code path to audit.
- **Accepted cost:** n8n must be able to reach `localhost:3000`; if n8n runs in Docker the
  base URL becomes `host.docker.internal`. This is a real setup trap and belongs in the
  run-it-yourself README the moment it bites.
- **Accepted cost:** two processes to start for the demo instead of one. Mitigated by
  `npm start` and a documented start order.
- **Accepted cost:** SQLite's single-writer lock is fine at demo scale and would not be
  at production concurrency — recorded in `assumptions.md` with Postgres as the swap.
- Forces schema discipline: `review-ui/schema.sql` becomes a reviewed artifact, and every
  new column arrives in a story, not ad hoc.
