# E2-S1: Replay every fixture through the real door, on one command

**As a** builder
**I want** to push all nine fixtures through the same door a PM uses, with one command
**So that** grading always describes a run that actually happened, and never a run the grader produced for itself

## Acceptance criteria

- [ ] `POST /webhook/ingest` accepts a JSON body with the same fields as the form door and
      produces the identical canonical SourceDocument — verified by ingesting one fixture
      through each door and diffing the stored rows (only `source_channel` may differ).
- [ ] `npm run produce` replays all nine fixtures from `evals/datasets/docs/` through that
      webhook, in order, and prints one line per fixture with its `doc_id` and `trace_id`.
- [ ] `npm run produce -- <fixture-id>` replays a single fixture.
- [ ] A fixture that fails to ingest stops nothing else: the command reports it, continues,
      and exits non-zero at the end with a summary of which failed.
- [ ] `produce.mjs` contains **no grading logic and no assertions about quality** — running
      and grading stay separate commands (`evals/README.md` rule 3).
- [ ] Re-running `produce` does not silently duplicate documents: each run mints fresh
      `trace_id`s and the previous run's rows remain queryable.

## Depends on
- E1-S3 (the fixtures must exist), E1-S5 (a run must be able to complete)

## Eval gate
- none — this story *produces* runs; the cases that grade them are E2-S2 and E2-S3.

## Technical notes

- **The webhook door arrives here, not in E5.** It was scoped to E5 originally; the harness
  needs a programmatic entry point, and having it drive the n8n Form trigger would test a
  path no real user takes (PRD-E2 technical constraints). E5 is consequently about
  `doc_type` adapters only.
- Both doors must be genuinely thin. The acceptance test for "adapter, not branch" is that
  nothing downstream of WF1 can tell them apart — the structural grep proving this is
  E5-S4, but the property is established here.
- `N8N_INGEST_WEBHOOK_URL` comes from `.env`. The harness talks to n8n over HTTP like any
  other caller; it does not reach into the database to fake an ingest.
- Zero npm dependencies (ADR 0009) — use `fetch`, which is built in.
- Keep the fixture→doc_type mapping in the fixture files themselves, not in the harness, so
  adding a fixture never means editing code.

## Outcome

**Done 2026-09-01. 11 of 11 test rows Pass. Two major defects found and fixed.**

A "run" now means the whole pipeline — ingest *and* generate — because the producer as
built in E1 opened the door and stopped. Grading that would have measured an empty
database: nine documents, zero requirements, and a green harness.

**What this story actually cost, and what it bought.** The door-parity criterion looked like
paperwork. It found both defects within twenty minutes of each other:

1. **BUG-005: the form door had never once been opened.** n8n refuses to start a
   form-initiated workflow that contains a `Respond to Webhook` node anywhere in it. The
   workflow JSON was correct; n8n would not run it. It had been verified by reading.
2. **BUG-006: with the form open, the two doors stored different bytes** — CRLF from the
   browser, LF from the JSON caller. `raw_text` is immutable and every citation offset
   refers to it forever, so a quote spanning a line break would have matched through one
   door and not the other, and the symptom would have read as "the model paraphrased".

Neither was findable by reading code. Both adapters are correct; the *environments feeding
them* are not the same, and the only check that could tell was one that went through the
doors and compared the stored rows.

**Deviation from the acceptance criteria, deliberate.** They are written as `npm run
produce`. The command is `.\run.cmd evals/harness/produce.mjs`, per
BUG-002 — npm's PowerShell shim is blocked under Windows' default execution policy. The
package.json script exists for shells that allow it and is labelled as a convenience.

**One thing measured and left alone:** the same input produced 14, then 15, then 15
requirements from T1 across three runs, with nothing tuned in between. That variance is
E2-S4's subject. It is recorded now so that C1's first number is never read as though a
single run settled it.
