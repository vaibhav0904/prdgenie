# PRD-E5: More doors, same spine

**Status:** Approved
**Date:** 2026-09-01
**Approved:** 2026-09-01 by Vaibhav

**Note added at approval.** Vaibhav asked where a document the PM writes *themselves*
enters this system — "not everything will be discussed in meetings". It enters here, as
`doc_type: feature_brief` through E5-S1, and fixture F1 is already exactly that document.
That intent was invisible in the phrase "the feature_brief adapter", so E5-S1's card now
names it. The half that was genuinely missing — telling a first-party source apart from the
room — became **E4-S6** by amendment.

## Problem

The goal is an agent that ingests "meeting transcripts **and other product-related
documents**", and the pain point in `deliverables/problem-and-approach.md` is reconciliation: three
sources saying overlapping, partly contradictory things. A system that only reads
transcripts solves the easy half and leaves the PM doing the expensive half by hand.

There is an architectural claim underneath this too, and it is unproven so far. The
architecture says the doors are thin adapters and nothing downstream knows which one was
used. With one document type, that is a design intention, not a fact. This epic is where
it becomes checkable — or where it turns out to be false and something needs fixing.

## Goals / Non-goals

**Goals**

- Notes, email threads and feature briefs ingest through the existing doors and normalize
  to the same canonical SourceDocument.
- One PRD version can draw on several source documents, with citations pointing to the
  right one.
- C1 passes across all four document types, not just transcripts.
- The "no downstream branching" claim is proven mechanically, not asserted.

**Non-goals** — deferred deliberately, with reasons:

- **No new channels.** Slack, Confluence and Drive are named in `docs/assumptions.md` as
  absent. A third channel would be a fourth adapter proving the same point the first three
  already prove.
- **No file-format parsing.** Plain text in. PDFs, DOCX and attachments are out of scope
  and out of the claim (`evals/README.md`, formats section). A PDF parser is a dependency
  and a failure mode with no learning attached.
- **No language support beyond English.** Stated, not silently untested.
- **No automatic source deduplication.** If a PM ingests the same email twice, they get it
  twice. Detecting near-duplicate sources is a real feature and a different problem.
- **No cross-source contradiction detection in this epic.** Multiple sources make it
  possible; E3's ambiguity detection already covers conflicts within a run, and whether it
  works *across* documents is measured here rather than newly built.

## Who this is for

The **PM** persona holding a transcript, a Slack export they pasted into a notes file, and
a stakeholder's write-up — which is the realistic version of the situation E1 idealized.

## Proposed scope → stories

- **E5-S1:** The `notes` and `feature_brief` adapters — title and timestamp extraction,
  no speaker segmentation, everything else identical.
- **E5-S2:** The `email` adapter — header stripping into `title`/`received_at`, quoted
  reply chains segmented by sender so attribution survives.
- **E5-S3:** Multi-source runs — one PRD version assembled from several documents in one
  ingest, with each citation naming its own `doc_id`.
- **E5-S4:** C1 extended across T1, N1, E1 and F1, plus the committed structural check
  that nothing after WF1 reads `doc_type` or `source_channel`.

## Success criteria

1. All four document types ingest and produce requirements with correct citations into the
   right source.
2. A single run over three documents of different types produces one PRD version whose
   citations resolve to three different `doc_id`s, verified by clicking them in the UI.
3. C1 meets its thresholds **per document type**, reported separately. An average across
   types would hide a type that fails badly.
4. A committed check (`npm run check:spine`) greps the WF2/WF3 workflow exports and the
   `/internal/*` handlers for `doc_type` and `source_channel` and **fails** on a hit
   outside the door. This is the structural half of the claim; C1 across types is the
   behavioural half.
5. Adding a hypothetical fifth document type would require touching only the door — stated
   as a walkthrough in the story's Outcome, since it cannot be tested without building one.

## Technical constraints (confirmed during exploration, not assumptions)

- **The second door already exists.** The `POST /webhook/ingest` door was pulled forward
  into E2-S1 because the eval harness needed a programmatic entry point. This epic is
  therefore about `doc_type` adapters only, and the second-channel work is already done —
  worth knowing before scoping E5-S1.
- **Email is the adapter that will break the model.** Quoted reply chains repeat text
  verbatim, so the same sentence can appear four times in one `raw_text`. The grounding
  check's offset disambiguation (ADR 0003) matters here for the first time, and a quote
  that appears identically four times may resolve to the wrong occurrence. Expect this,
  and decide whether "a valid occurrence" is sufficient rather than treating it as a bug.
- **`received_at` from an email is the header date, not ingest time.** Getting this wrong
  makes chronology meaningless, which matters as soon as E6 asks which source is newer.
- **Notes fixtures have no speakers.** `segments` may legitimately be empty, and everything
  downstream must already treat segments as advisory (`docs/contracts.md` §1a). If
  anything depends on a speaker existing, this is where it surfaces.
- **PII redaction runs per door, before storage, for every type.** Email is the type most
  likely to carry contact details, and H2 is an email fixture for exactly that reason.

## Open questions — all three closed 2026-09-01 by Vaibhav

- ~~**One ingest with several documents, or accretion from several ingests?**~~ →
  **Decided: several documents in one ingest.** It shows reconciliation in one gesture,
  which is the thing worth demonstrating. Each document keeps its own `doc_id` and its own
  citations; the run carries one `trace_id` across all of them, because a `trace_id` names
  *a run through the pipeline*, and one ingest is one run. Accretion — a version growing as
  documents arrive over days — is the natural follow-up and is **not** built here; it
  overlaps E6's delta machinery and should reuse it rather than duplicate it.
- ~~**Email chain where the oldest message contradicts the newest?**~~ → **Decided:
  surface both as a conflict.** Chronology is available and the newest is usually right,
  but "usually" is exactly the word this product refuses to act on unsupervised. The whole
  premise is that the PM decides; silently preferring the newest would make that decision
  invisibly on their behalf.
- ~~**Should C1's thresholds differ by document type?**~~ → **Decided: one threshold,
  reported per type.** A feature brief is prose written to be understood and a transcript
  is people interrupting each other, so the bar may well be unfair to one of them. If a
  type consistently misses, the honest response is to describe the capability — "it reads
  briefs better than it reads arguments" — not to give the hard type an easier bar. A
  per-type threshold set after seeing per-type results is a threshold chosen to pass.
