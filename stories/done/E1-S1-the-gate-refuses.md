# E1-S1: The approval gate refuses everything except a human

**As a** PM
**I want** the system to be incapable of approving a PRD on my behalf
**So that** my sign-off means something — nobody, including the pipeline, can publish a PRD I did not read

## Acceptance criteria

- [ ] `data/prdgenie.db` is created from `review-ui/schema.sql` by a command, not by hand,
      and re-running that command on an existing database is safe.
- [ ] Every table in `docs/contracts.md` exists, each carrying `trace_id` where the
      contract says it does.
- [ ] `prd_versions` has a `BEFORE UPDATE` trigger that refuses every transition not in
      the state table in `docs/contracts.md` §3 — verified by attempting `draft → approved`
      and `approved → draft` in `sqlite3` and watching both abort.
- [ ] A hand-run `UPDATE prd_versions SET state='approved' WHERE id=…` in `sqlite3`
      **fails**, with an error naming the reason.
- [ ] The sign-off marker mechanism passes: the endpoint's own transition into `approved`
      succeeds, **and** an immediately following `UPDATE` into `approved` on a different
      version, on the same connection, is refused.
      *Spike resolved 2026-09-01 — the marker is a row naming the specific
      `prd_version_id`, written and deleted in the sign-off transaction, so a leaked marker
      authorizes only an already-approved version. See the amendment to ADR 0006.*
- [ ] `npm start` boots the service on `SERVICE_PORT` and `GET /api/health` returns the
      schema version.

## Depends on
- —

## Eval gate
- none — this is a deterministic property, not a judgment step. It is verified by the
  criteria above and by the UAT, per the "NONE — chosen" row in `evals/README.md`.

## Technical notes

- **The spike is done** (2026-09-01). It did not answer the connection-reuse question so
  much as design it away: a version-scoped marker row cannot authorize the wrong version.
  ADR 0006 is **amended, not rewritten** — both records stand together.
- Criterion 5's second half is still the one that matters, and is still verified by
  running it. A marker that leaks leaves a gate that looks shut and is open: the only
  failure mode in this design with no visible symptom.
- **Storage is `node:sqlite`, not `better-sqlite3`; zero npm dependencies** (ADR 0009,
  written during this story). The spike was run on `node:sqlite` specifically, so its
  finding applies to the driver that ships.
- The trigger is the reviewed home of the state machine (ADR 0006). Any future change to
  the state table in `docs/contracts.md` arrives with a matching trigger change or it is
  not a change, it is a divergence.
- Do not add an application-layer state check *instead* of the trigger. Alongside is fine;
  instead is the thing ADR 0006 rejected.
- Schema includes the tables that later epics need (`review_actions`, `llm_calls`,
  `judge_scores`, `dead_letters`, `prd_changes`) even though nothing writes them yet —
  a migration mid-epic is more disruptive than five unused tables.

## Outcome (2026-09-01)

**Verified by running, not reading.** 16 test rows, all Pass. The gate refuses a hand-run
`UPDATE prd_versions SET state='approved'` with a message naming ADR 0006; the sign-off
path succeeds; a marker cannot authorize a second version on the same connection; and the
three legal transitions still work, so it is a gate rather than a wall. Re-confirmed in a
`-ExecutionPolicy Restricted` shell.

**Promoted on evidence rather than owner UAT**, under the G6 scoping Vaibhav set on
2026-09-01 (`stories/README.md`): every criterion here has an exactly-stated expected
result and no check a machine cannot make. Recorded so the choice is auditable.

**What was surprising.** Three things, and all three were found by someone else looking:

1. *The first negative control passed when it should have failed.* With the gate's trigger
   dropped, `verify-gate.mjs` still reported 9/9 and exited 0, because it called
   `initSchema()` and silently recreated the trigger it was about to test. Every other row
   was green at that moment and would have stayed green with the guarantee entirely gone.
   BUG-001.
2. *Every documented command was unrunnable by the person the document was for.* npm's
   `.ps1` shim is blocked by Windows' default execution policy; my shell had `Bypass` set
   invisibly. BUG-002. The same story also produced TC14 — a UAT that stalled on its first
   line because it never said there were no n8n workflows yet. Same mistake twice: verifying
   from inside my own context.
3. *The spike dissolved its question instead of answering it.* A marker row naming a
   specific `prd_version_id` cannot authorize the wrong version, so connection reuse stopped
   mattering. ADR 0006 amended, not rewritten.

**What this card cannot claim.** It proves the gate refuses the pipeline and the command
line. It proves **nothing about who the approving human is** — there is no authentication,
and every review action is attributed to one hardcoded reviewer. That remains the biggest
gap in `docs/assumptions.md`. It also says nothing about whether the *contents* of a PRD
are any good; nothing has been generated yet.
