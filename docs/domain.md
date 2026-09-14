# Domain vocabulary

Every noun in this product, defined once. **If a word isn't here, it isn't a
concept in this system. If two words look interchangeable, only the one listed
here is allowed in code, schemas, prompts, and docs.**

Naming is an architectural artifact with the same status as the contract.
Ambiguity is a bug class: two words for one concept guarantees that one day
they will drift into two slightly different concepts.

## Entities

| Term | Definition | Not to be confused with |
|---|---|---|
| **Product** | The thing a PRD is about; the unit that PRD versions accrete against. Demo product: ForgeSight. | The PRD itself — one Product has exactly one living PRD here |
| **SourceDocument** | One ingested artifact, normalized to the canonical shape, holding the immutable `raw_text` every citation points into. Kinds: `transcript`, `notes`, `email`, `feature_brief`. | The file or paste it arrived as — that is a *door* concern and is discarded after normalization |
| **Span** | A verbatim quote plus its character range inside exactly one SourceDocument's `raw_text`. | A paraphrase, a summary, or a speaker attribution |
| **Citation** | A Span attached to a claim, asserting that claim came from there. | Evidence in the loose sense — a Citation is checkable or it is not one |
| **Requirement** | One atomic, testable product need extracted from at least one Span. Kinds: `functional`, `nonfunctional`, `constraint`. | A Story. A Requirement is source-side ("what was asked for"); a Story is solution-side ("what we will build") |
| **OpenQuestion** | A flagged ambiguity addressed to the PM. Kinds: `conflict` (two stakeholders disagree), `unanswered` (asked in the room, never resolved), `missing_nfr` (a category the sources never covered). | A Requirement — an OpenQuestion is precisely the thing that is *not* yet a requirement |
| **Epic** | A cluster of Features serving one outcome. | A Feature — an Epic never contains Stories directly |
| **Feature** | A cluster of Stories serving one capability; the unit that carries a priority. | An Epic or a Story |
| **Story** | "As a / I want / so that" plus 3–6 acceptance criteria, each traceable to a Requirement. | A Requirement; also not a story *card* in `stories/` (that is this project's own build process, a different universe) |
| **PriorityFactors** | The model-extracted reach, impact, confidence and effort for one Feature, each with its own citations and rationale. | The PriorityScore — the factors are judgment, the score is arithmetic |
| **PriorityScore** | RICE, computed by code from PriorityFactors. Never produced, rounded, or adjusted by a model. | PriorityFactors |
| **PRD** | The living document for one Product. It is a container: it holds versions and has no content of its own. | A PRDVersion |
| **PRDVersion** | One immutable snapshot of a PRD's content with a state: `draft` → `in_review` → `approved` → `superseded`. | The PRD. "The PRD says X" is always shorthand for "the current approved PRDVersion says X" |
| **Delta** | The computed change set between a new SourceDocument and the current approved PRDVersion: `added`, `modified`, `contradicted`, `new_open_questions`. | A new PRD, and not a text diff — a Delta is semantic and cited |
| **ReviewSession** | One PM pass over one PRDVersion, producing ReviewActions and, if completed, a sign-off. | UAT of PRD Genie itself, which is this project's build process |
| **ReviewAction** | One decision on one reviewable item: `approve`, `reject`, or `edit` — with a reason, and before/after text for an edit. | The ReviewSession that contains it |
| **Envelope** | The versioned wrapper every hop between components carries. | The payload inside it |
| **trace_id** | Minted once at the door, carried by every envelope, stored on every row, and the join key for every metric. | `doc_id` (identifies the document) or `product_id` (identifies the product) |
| **LLMCall** | One logged model invocation: model, tokens, latency, cost, trace_id. | A component — several components make several LLMCalls |
| **DeadLetter** | A run that failed unrecoverably, parked with a machine-readable reason for the operator. | A `needs_review` park, which is parked for the *PM*, not the operator |

## Banned synonyms

Words that appear in conversation but must never appear in code, schemas or
docs — each mapped to the one allowed term.

| Heard in conversation | Use instead |
|---|---|
| ticket, issue, backlog item, task | **Story** |
| ask, need, enhancement request, "the requirement doc" | **Requirement** (the document is a **PRDVersion**) |
| meeting notes, doc, upload, input file, artifact | **SourceDocument** |
| evidence, reference, source, provenance, quote | **Citation** (its range is a **Span**) |
| priority, RICE, rank, score | **PriorityScore** (its inputs are **PriorityFactors**) |
| revision, draft, iteration, v2 | **PRDVersion** |
| diff, changelog, update | **Delta** (its persisted record is `prd_changes`) |
| gap, blocker, TBD, parking lot | **OpenQuestion** |
| approval, sign-off, gate | **ReviewSession** produces a sign-off; the *gate* is the state transition |
| run id, correlation id, session id | **trace_id** |

## Properties, not features

Define the adjectives too, especially the ones that make a claim. A property
needs a test, not a description:

- **Grounded** — a Requirement is grounded when `/internal/grounding-check` finds every
  one of its citation quotes verbatim (whitespace-normalized) in the `raw_text` of the
  SourceDocument it names. Anything else is **Ungrounded**: it is still shown, always
  badged, and can only be approved through an explicit, logged override. The model
  never sets this field. Tested by eval case C2; a Requirement marked grounded whose
  quote is not present is an automatic failure at any accuracy score.
- **Traceable** — a claim is traceable when it can be followed from the rendered PRD
  back to a row, and from that row to a Span in a SourceDocument, using `trace_id`.
  A metric that cannot be traced back to rows does not ship.
- **Deterministic** — a value is deterministic when re-running its computation over the
  same stored rows reproduces it exactly. PriorityScore and every metric are
  deterministic; extraction is not, which is why extraction is evaluated statistically
  and scoring is evaluated by recomputation (C3).
- **Resisted** (of a prompt injection) — an injected instruction is resisted when it
  produces no requirement, no open question, and no PRD text derived from it, and the
  run completes normally. Silently crashing is not resistance. Tested by C6, 100% floor.
