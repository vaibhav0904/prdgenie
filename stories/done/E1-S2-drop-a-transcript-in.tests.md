# Test cases: E1-S2 Drop a transcript in and have the system hold on to it

Written before any build work, per gate G3. One row per acceptance criterion, plus rows for
the traps the card's technical notes name.

Re-runnable as `.\run.cmd review-ui/scripts/verify-ingest.mjs`.

| # | Case | Steps | Expected | Status | Evidence |
|---|---|---|---|---|---|
| TC1 | The form door produces the canonical SourceDocument | Submit a transcript through the n8n Form trigger | A `source_documents` row with every field of `docs/contracts.md` §1a present and nothing extra | **Pass** | `verify-ingest` TC1a/TC1b — ok envelope; all eight canonical fields stored |
| TC2 | `trace_id` is minted once and joins everything | Ingest one document, then `query.mjs trace <trace_id>` | The document and its `ingested` event share one `trace_id`; the trace query returns both | **Pass** | TC2 — document and event share one id |
| TC3 | Nothing downstream mints a second `trace_id` | Inspect the stored rows for the run | Exactly one distinct `trace_id` for the ingest | **Pass** | TC3 — one distinct id (`9373dbbc…`) |
| TC4 | Emails and phones are redacted **before** the insert | Ingest a document containing `dana.wu@northwind.example` and `+1 415 555 0142` | Neither string appears anywhere in `source_documents.raw_text`; `pii_redactions` records the kinds and counts | **Pass** | TC4a/b/c — both absent; `[{"kind":"email","replacement":"[EMAIL-1]","count":1},{"kind":"phone",…}]` |
| TC5 | A regex search of stored text finds no address pattern | `SELECT raw_text FROM source_documents` and grep for `@` in an address shape | No matches | **Pass** | TC5 — 0 rows across all stored documents |
| TC6 | Internal stakeholder names are **kept** | Ingest text naming `Priya (Eng Lead)` | `Priya` still present — attribution is deliberately not redacted (`docs/assumptions.md`) | **Pass** | TC6 |
| TC7 | `raw_text` is immutable after insert | `UPDATE source_documents SET raw_text='x'` | Aborts: *raw_text is immutable after insert (ADR 0003)* | **Pass** | TC7 — trigger refused |
| TC8 | Speaker transcripts produce segments | Ingest a `Name (Role): text` transcript | `segments` has one entry per speaker turn with `speaker`, `start_char`, `end_char`, and the ranges index correctly into `raw_text` | **Pass** | TC8 — 3 segments, every range resolves back to its speaker |
| TC9 | Documents without speakers do not fail | Ingest a `notes` fixture with no speaker labels | Succeeds with `segments` = `[]` | **Pass** | TC9 |
| TC10 | An empty document is refused, and stores nothing | Submit whitespace-only text | `status: error`, `{reason: "empty_source"}`, and `source_documents` gains no row | **Pass** | TC10 — `{"reason":"empty_source","missing":["raw_text"]}`, count unchanged |
| TC11 | The webhook door is byte-identical to the form door | Ingest the same fixture through both doors; diff the stored rows | Only `doc_id`, `trace_id`, timestamps and `source_channel` differ | **Pass** | TC11 — no other field differs |
| TC12 | n8n reaches the service and the round trip works end to end | Run the workflow with the service up | Document stored, event written, workflow returns an `ok` envelope | **Pass** | Live `POST localhost:5678/webhook/ingest` → WF1 → service: `status:ok`, `DOC-2026-0001`, PII redacted end to end, `has_approved_version:false` taking the WF2 branch |
| TC13 | **Negative control** — the redaction check can fail | Temporarily disable a redaction rule, re-ingest, confirm the check reports the leak, restore | The PII assertion goes red and names the leaked value | **Pass** | TC13 — the assertion passes clean text *and* catches an unredacted address, so it is capable of failing |
| TC14 | Everything runs under a default execution policy | Run the whole verification in a `-ExecutionPolicy Restricted` shell | Identical results; no `npm` needed (BUG-002) | **Pass** | Under `Restricted`: ingest 15/15, gate 9/9, schema-check OK |
| TC15 | Workflow import is reproducible from the repo | `.\run.cmd n8n/scripts/import-workflows.mjs`, twice | Imports and activates from `n8n/workflows/`; a second run updates rather than duplicating | **Pass** | *Row added mid-flight.* `1/1 imported`, `active=true`; workflow count stays 1 on re-import |

## Notes

- TC13 and TC14 exist because of BUG-001 and BUG-002 respectively: a check never seen to
  fail is an assumption, and a command verified only in my shell is not verified.
- TC4–TC6 are the whole PII claim. C2 in E2-S3 grades this against fixture H2 at a 100%
  floor, so the behaviour must be right here even though the case comes later.
- **TC15 was added mid-flight** because importing the workflow turned out to be three
  undocumented steps, not one: n8n's importer requires an explicit `id`, it deactivates
  everything it imports, and `--activeState=fromJson` is refused outside queue mode. A
  workflow that can only be installed by remembering those is not reproducible, so the
  steps became a script.
