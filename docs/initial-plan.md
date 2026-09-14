# Initial plan

Written on day one, before any code. Its job is to separate what is settled
from what is not, so the unsettled list becomes the agenda instead of a source
of drift.

Revisit it when an item moves between the two lists. Do not delete resolved
open questions — strike them through and link the ADR that closed them, so the
file doubles as a record of how the design was actually reached.

Date: 2026-09-01. Owner: Vaibhav.

## What I'm sure about (non-negotiables)

Things that will not change without a very good reason. Keep this list short
enough that every item is genuinely load-bearing.

- **n8n is the orchestration spine.** The workflow export is a first-class artefact, so
  the judgment steps and the routing between them live in n8n, not in a script that
  n8n merely calls.
- **The human review gate is enforced by the storage layer, not by convention.** A
  PRD version reaches `approved` only through the review UI's sign-off endpoint.
  There is no path around it — that is the whole point of calling it a gate.
- **Every requirement carries a verbatim citation into its source document**, and
  "grounded" is decided by code matching that quote, never by the model asserting it.
- **The model never writes a number that ships.** Priority scores and every reported
  metric are computed by code from stored rows.
- **Non-reasoning models only.** OpenAI `gpt-4.1-mini` is the doer; Gemini 2.5 Flash
  (thinking budget 0) is the judge. Cost discipline is a design constraint, not an
  afterthought, and the grader is never the doer.
- **Labels are written before any tuning**, and never edited to match output.
- **Dummy data only.** No real meeting content, no real personal data, ever.
- **The artefacts are fixed up front:** a working demo, a ≤9-slide deck, a ~5-minute
  video, the n8n workflow JSON, plus the problem write-up and the program charter.

## What I haven't decided (TBD — the map of the conversation)

Every open question, written as a question. This is the agenda: each item is
expected to be closed by an ADR, or recorded as a deliberate simplification in
`assumptions.md`.

- ~~**Model split:** which vendor is the doer and which is the judge, and at what tier?~~
  → closed by [ADR 0001](adr/0001-non-reasoning-doer-and-cross-vendor-judge.md)
- ~~**Storage:** flat JSON files vs SQLite vs Postgres? What does trace-joined metric
  computation actually need?~~ → closed by [ADR 0002](adr/0002-sqlite-behind-a-single-writer-service.md)
- ~~**Spans:** how does a citation survive chunking, and who decides a quote is real —
  the model's offsets or the code's substring search?~~ → closed by
  [ADR 0003](adr/0003-the-quote-is-authoritative-not-the-offset.md)
- ~~**The n8n / code split:** what belongs in an n8n Code node and what belongs behind
  an HTTP endpoint the eval harness can also call?~~ → closed by
  [ADR 0004](adr/0004-judgment-in-n8n-determinism-behind-http.md)
- ~~**Living PRDs:** in-place edits with a changelog, or immutable versions?~~ → closed by
  [ADR 0005](adr/0005-prd-versions-are-immutable.md)
- ~~**Approval enforcement:** application-layer check vs database trigger?~~ → closed by
  [ADR 0006](adr/0006-enforce-the-approval-gate-in-the-database.md)
- ~~**Injection defense:** delimiters alone, or delimiters + schema shape + an output
  tripwire? What does "resisted" mean precisely enough to be scored?~~ → closed by
  [ADR 0007](adr/0007-layered-injection-defense-with-a-measured-floor.md)
- ~~**Eval matching:** how is an extracted requirement matched to a labeled one without
  a second LLM in the loop?~~ → closed by
  [ADR 0008](adr/0008-match-eval-items-by-span-overlap.md)
- ~~**Follow-up documents:** does the PM pick the target PRD explicitly at ingest, or
  does the system auto-match?~~ → resolved as a deliberate simplification: the PM names
  the product at ingest. Recorded in `assumptions.md` (an auto-match failure silently
  corrupts the wrong document).
- ~~**PII scope:** redact external customer names and contact details only, or internal
  stakeholder names too?~~ → resolved as a deliberate simplification in
  `assumptions.md`: external contact details and customer names only. Internal
  stakeholder attribution is product-useful and stays.
- **Judge cadence and sample size:** how much of the output does a nightly sweep grade
  before cost outweighs signal? *(Starting point for E7: up to 2 PRD versions and 20
  requirements per sweep, sampled at random from what has not been judged. Revisit with
  real cost data — this is a guess, not a decision, and does not get an ADR until it is
  informed by one.)*
- ~~**Baseline:** how is the week-zero human baseline captured honestly given a single
  PM (me) who has already seen the fixtures?~~ → resolved, uncomfortably, in
  `docs/metrics.md`: it cannot be. The self-timed figure is recorded as a labeled
  anecdote and **no improvement percentage is claimed from it**. A real baseline needs
  three PMs who have not seen the fixtures — `roadmap.md`, Tier 2.

## Out of scope

Things deliberately not being built, with the reason. Distinguish "not yet"
from "not ever" — they age very differently.

- **Audio/video transcription** — *not ever, in this pilot.* Text transcripts are the
  input contract. Transcription is a solved commodity and adds no learning here.
- **Real Jira / Confluence / Slack / calendar integrations** — *not yet.* Mocked at the
  boundary; the export shape is designed so a real adapter drops in.
- **Authentication and multi-tenancy** — *not yet.* Single local operator. This is the
  biggest known gap and is recorded at the top of `assumptions.md`.
- **Fine-tuning or embeddings/RAG over a corpus** — *not ever, here.* The source
  documents are the entire context; retrieval would add a failure mode with no upside
  at this document size.
- **Automatic push of approved PRDs into a tracker** — *not yet.* Export is a file; the
  irreversible outward action stays manual.
