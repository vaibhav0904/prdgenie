# E1-S2: Drop a transcript in and have the system hold on to it

**As a** PM
**I want** to paste a meeting transcript into a form and have it stored, cleaned of contact details, with an identifier I can follow
**So that** everything the system later says about that meeting can be traced back to the exact text I gave it

## Acceptance criteria

- [ ] An n8n Form trigger accepts pasted text plus `doc_type` and product, and produces the
      canonical SourceDocument of `docs/contracts.md` §1a — no extra fields, no missing ones.
- [ ] `trace_id` is minted **once**, in WF1, and appears on the stored document and on its
      `ingested` event. Nothing downstream mints another.
- [ ] Emails and phone numbers are replaced before the row is inserted, and the counts land
      in `pii_redactions`. Querying `source_documents` for an `@` in an address pattern
      returns nothing.
- [ ] `raw_text` is the post-redaction text and is never written again after insert.
- [ ] A transcript with speaker labels produces `segments` with speakers and char ranges;
      a document without them produces an empty `segments` array rather than failing.
- [ ] Submitting an empty document returns `status: error` with
      `{reason: "empty_source"}` and stores nothing.

## Depends on
- E1-S1

## Eval gate
- none in this story. The PII redaction built here is graded by **C2** in E2-S3 against
  fixture H2 at a 100% floor — so this story's redaction must be correct now, and is
  proven later.

## Technical notes

- **This is the story that wires the first n8n → service HTTP call**, so it is where the
  Docker networking trap lands: if n8n runs in a container, `SERVICE_BASE_URL` must be
  `http://host.docker.internal:3000`, not `localhost` (ADR 0002, PRD-E1 constraints). Put
  the answer in `.env.example`'s comment the moment it is confirmed.
- Redaction happens **at the door, before storage** — not on read, not on display. Once
  `raw_text` is stored it is immutable, because every span offset in the system refers to
  that exact string forever (ADR 0003).
- Internal stakeholder names are deliberately **kept** (`docs/assumptions.md`). Redacting
  them would destroy the attribution that makes a requirement reviewable. Do not "improve"
  this without changing the assumption first.
- Only `doc_type: transcript` is exercised here. The adapters for notes, email and feature
  briefs are E5 — but the door must already be written so that adding one is a mapping
  change, not a branch.
- `segments` are advisory everywhere downstream. Nothing may require a speaker to exist.

## Outcome (2026-09-01)

**Verified by running.** 15 rows in `verify-ingest`, plus a live round trip through the
real n8n webhook: `POST localhost:5678/webhook/ingest` → WF1 → `/internal/ingest` →
stored, with the email and phone number replaced before the insert and `Priya (Eng Lead)`
left intact. Re-confirmed under a `-ExecutionPolicy Restricted` shell.

**Promoted on evidence** under the G6 scoping of 2026-09-01: nothing here needs a human
judgment.

**What was surprising.** Installing the workflow was three undocumented steps, not one.
n8n's importer requires an explicit `id` in the JSON (it will not mint one, and fails with
a raw not-null constraint error); it **deactivates everything it imports** regardless of
the file's `active` field; and `--activeState=fromJson`, which exists to fix exactly that,
is refused outside queue mode. A workflow installable only by remembering those three
things is not reproducible from the repo, which is the claim ADR 0010 rests on — so the
steps became `n8n/scripts/import-workflows.mjs` and TC15 was added to prove a re-import
updates rather than duplicates.

The second finding was better news. The `/internal/*` shared-secret guard **refused the
first round trip**, which was the guard working. Rather than weakening it or pasting the
key into a committed workflow, `n8n/scripts/provision-internal-credential.mjs` now
generates the key into `.env`, writes a credential file *inside* the container, imports it
into n8n's encrypted store and deletes the temp file. The workflow JSON references the
credential by id and name only — so there is no secret in the export for E9-S1 to strip.

**What this card cannot claim.** Nothing is extracted or generated yet: no requirement, no
citation, no PRD. Redaction is pattern-based for emails and phone numbers; named external
customers come in E7 and are graded by C2. The routing branch is proven to *route*, but
both of its destinations are placeholder nodes until E1-S4 and E6.
