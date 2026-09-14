# ADR 0006 — Enforce the approval gate with a database trigger

**Status:** accepted · **Date:** 2026-09-01 · *amended 2026-09-01, see Amendment below*

## Context

The whole design turns on "a clear human-in-the-loop review". Nearly every implementation of that
phrase is a screen with an Approve button and nothing stopping the pipeline from setting
the same field itself. The kit's test is blunt: *can you draw a path around it?* If the
answer is "the code calls things in the right order", it is a convention, not a gate.

There is a second reason to be strict here. This system's entire value proposition is
that a machine drafts and a human decides. If the machine can write `approved`, the
proposition is false in the one place it is easiest to check.

Alternatives:

- **An application-layer check in the sign-off handler** — disqualified: n8n also has a
  database path through `/internal/*`, and a future endpoint added carelessly reopens it.
  It is simpler and it is what most systems do; that is conceded, and it is exactly why
  the stronger version is worth the two lines.
- **A separate `approvals` table with the PRD state derived from it** — genuinely good, and
  rejected only because derived state plus SQLite means a view and more moving parts than
  a trigger for the same guarantee.
- **Filesystem permissions or a separate DB user** — disqualified: SQLite has no user model.

## Decision

A `BEFORE UPDATE` trigger on `prd_versions` `RAISE(ABORT)`s any transition not in the
state table in `docs/contracts.md` §3, and specifically aborts any transition into
`approved` unless the connection has set the sign-off marker that only
`POST /api/prd-versions/:id/sign-off` sets. The endpoint recomputes, server-side, that
every requirement and story in the session has a ReviewAction before it sets that marker.

The refusal is demonstrated, not asserted: the E1 UAT script ends by running
`UPDATE prd_versions SET state='approved'` in `sqlite3` by hand and watching it fail.

## Consequences

- The gate is real by construction, and provable in fifteen seconds during the demo video
  — which is worth more to a stranger than a paragraph claiming it.
- No future endpoint, Code node, or manual fix can promote a PRD by accident.
- **Accepted cost:** legitimate maintenance (a data migration, a fixture reset) must go
  through the endpoint or explicitly disable the trigger, which is friction by design.
- **Accepted cost:** the logic lives in SQL, away from the JavaScript, so it is easy to
  forget when reading the service. Mitigated by naming it in `CLAUDE.md`'s hard rules and
  by the UAT step that exercises it.
- Forces `schema.sql` to be the reviewed home of the state machine, and forces any change
  to the state table in `contracts.md` to arrive with a matching trigger change.

## Amendment — 2026-09-01, after the E1-S1 spike

The original decision said the trigger aborts an approval "unless **the connection** has
set the sign-off marker". That phrasing carried a failure mode with no visible symptom: if
a pooled connection retained the marker, a later write would be waved through and the gate
would look shut while standing open. PRD-E1 scoped a timeboxed spike to find out whether
it survived connection reuse.

The spike made the question moot rather than answering it. **The marker is a row in a
`signoff_marker` table naming the specific `prd_version_id` being approved**, written and
deleted inside the same transaction as the sign-off. The trigger's condition is therefore
not "is a marker set" but "is a marker set *for this exact version*".

Verified on Node 24's `node:sqlite`, all three checks on one connection: a bare
`UPDATE … SET state='approved'` was refused; the sign-off path succeeded for version 1;
and immediately afterwards, with the marker cleared, the same connection was refused on
version 2.

- The connection-reuse question disappears: a leaked marker authorizes only the version it
  names, and that version is already approved.
- **Accepted cost:** one more table, and the sign-off endpoint must be transactional —
  a crash between marker-write and state-change would leave a stale marker. It authorizes
  only an already-approved version, so it is harmless, but the endpoint deletes it in the
  same transaction rather than relying on that.
- The E1-S6 re-check stands. Proving this against a spike is not proving it against the
  endpoint that ships.
