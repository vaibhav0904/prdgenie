# PRD-E6: The PRD that stays alive

**Status:** **Approved** by Vaibhav, 2026-09-02, with all five open questions decided as recommended.
**Date:** 2026-09-01 (approved 2026-09-02)

## Problem

Requirements do not arrive once. They arrive in a kickoff, get revised in a follow-up two
weeks later, and get quietly contradicted in a corridor conversation someone writes up.
Every PRD tool handles the first meeting. Almost none handle the second, which is why PRDs
go stale rather than getting updated — re-reading a whole document against a new transcript
is exactly as expensive as writing it was.

This is the capability that decides whether PRD Genie is a tool or a demo, and the churn
test in `docs/roadmap.md` says so directly: a PM who gets a delta re-listing eight
requirements nobody changed will stop ingesting follow-ups in week three. **Correctness is
not enough here — a delta that is right but noisy fails.**

## Goals / Non-goals

**Goals**

- A follow-up document produces a reviewed **delta** against the current approved version,
  not a second document.
- The delta distinguishes added, modified and contradicted, with quotes from **both** the
  existing PRD and the new source.
- Approving a delta mints the next immutable version and supersedes the previous one.
- Unchanged requirements do not appear. Churn is measured at zero.

**Non-goals** — deferred deliberately, with reasons:

- **No automatic matching of a document to a PRD.** The PM names the target product at
  ingest (`docs/assumptions.md`). An auto-match failure silently corrupts the wrong
  document, and a dropdown costs two seconds.
- **No merging of two deltas.** One follow-up at a time, reviewed before the next. Two
  concurrent deltas against one approved version is a conflict-resolution problem worth
  more than this epic.
- **No in-place editing of an approved version** (ADR 0005). A typo fix still mints a
  version. This is deliberate and will feel heavy; the answer if it proves too heavy is a
  `correction` change kind, not mutable history.
- **No cross-PRD contradiction detection.** Noticing that a new meeting contradicts a
  *different* PRD is Tier 2 in `docs/roadmap.md`.
- **No automatic resolution of a contradiction.** The system presents both quotes and the
  PM chooses. A tool that silently picks the newer statement is making product decisions.

## Who this is for

The **PM** persona in week three — the specific week the churn test is about. Secondarily
the **engineering lead**, for whom "what changed since the version we planned against" is
the question that makes a PRD trustworthy over time.

## Proposed scope → stories

- **E6-S1:** The delta analysis prompt and schema — approved version plus new source in,
  `{added, modified, contradicted, new_open_questions}` out, every item cited on both
  sides where both sides exist.
- **E6-S2:** WF3 wired and routed — WF1 sends a document to WF3 instead of WF2 when the
  target product has an approved version; grounding-checked; next draft version built by
  applying the delta.
- **E6-S3:** Version chain and changelog — `prd_changes` persisted, previous version set
  to `superseded` on approval, version history browsable.
- **E6-S4:** The delta review screen — added in green, modified with old and new side by
  side, contradictions showing the PRD's quote against the new source's quote.
- **E6-S5:** Case **C5** — all four labeled T1→T2 delta items found, and **churn = 0**.

## Success criteria

1. Ingesting T2 after T1 has been approved produces a delta, not a new PRD, and the PM
   reaches it from the same inbox.
2. All four labeled changes in T2 appear: two modifications, one contradiction, one
   addition (C5).
3. **No unchanged requirement appears in the delta.** T2 deliberately restates several
   requirements verbatim; a system that reports them has failed the epic even if it found
   all four real changes.
4. The contradiction is displayed with both quotes visible at once, and the PM can choose
   either without editing text by hand.
5. Approving the delta produces version 2 in `approved` and sets version 1 to
   `superseded`; version 1's text is still readable and byte-identical to what was
   approved.
6. The review screen's version trend (built in E4-S5 as "no prior version") now renders a
   real comparison.

## Technical constraints (confirmed during exploration, not assumptions)

- **Churn is the hard part, not detection.** The prompt must be explicit that an unchanged
  requirement is not output, and C5 measures this as a first-class number rather than a
  footnote to recall. Expect the first version to be noisy.
- **The delta is computed against the approved version, not the latest draft.** A draft
  awaiting review is not what anyone agreed to; deltaing against it would compound
  unreviewed output.
- **Applying a delta must preserve `req_id`s for modified requirements.** A modification
  that mints a new id destroys the link to every review decision and acceptance criterion
  that referenced the old one — and it would silently inflate M2 next cycle by making every
  item look new.
- **Citations in a delta point at two different documents.** The `modified` and
  `contradicted` shapes carry a quote from the old PRD *and* a citation into the new
  source; the source pane must handle both, which E4-S2 anticipated by keying the pane to
  the citation's `doc_id`.
- **Routing lives in WF1 and depends on state, not on the PM.** "Does an approved version
  exist for this product" is a computed readiness gate (`docs/contracts.md` §4), so a
  follow-up ingested before the first PRD is approved correctly runs the normal path.

## Open questions

- **Can a PM seed a PRD from a document they wrote, rather than generating one from
  sources?** Raised by Vaibhav on 2026-09-01: *"the PM might go and create something as
  well, because not everything will be discussed in meetings."* Ingesting the PM's document
  as a **source** is already covered — `doc_type: feature_brief`, E5-S1, and E4-S6 marks it
  as first-party. This question is the other reading: the PM's draft as the PRD's **starting
  point**, with the meeting folded into it afterwards.
  It belongs here rather than in E5 because it is this epic's machinery seeded differently:
  a delta is already computed between a new source and an existing version, and "here is my
  draft, now reconcile the transcript against it" is that same computation with v1 authored
  instead of extracted. Building it in E5 would duplicate E6.
  The cost to weigh: content would enter a PRDVersion without passing through extraction and
  grounding, so every seeded item must be `pm_authored` and out of M1 (E4-S6's mechanism),
  and the review screen must show a seeded version differently from a generated one.
  *Decided by Vaibhav when E6 is reviewed.*

- **What happens to a requirement the new source drops entirely?** Silence is ambiguous:
  the stakeholder may have withdrawn it or simply not repeated it. Leaning: never infer
  removal from absence — a `removed` kind only when the source says so explicitly, and
  otherwise nothing. Worth deciding before E6-S1, since it shapes the schema.
  *Decided by Vaibhav.*
- **Does the PM review only the delta, or the whole resulting version?** Delta-only is
  faster and is the entire value proposition; whole-version is safer. Leaning delta-only
  with the full version one click away, and sign-off applying to the version.
  *Decided by Vaibhav at E6-S4.*
- **Should a contradiction block sign-off until resolved?** Unlike an open question, an
  unresolved contradiction means the document asserts two things. Leaning block —
  this is the one place where refusing to move is more useful than moving.
  *Decided by Vaibhav.*
- **How is "the same requirement" identified across versions?** Proposed: the model
  returns the `req_id` it is modifying, and code verifies that id exists in the approved
  version — rejecting the delta item if it does not, rather than trusting a hallucinated
  id. Needs confirming at E6-S1.

---

## Decisions, 2026-09-02

Approved with all five open questions settled as recommended. Recorded here rather than left
in the questions above, because a question that stays phrased as a question gets re-litigated.

1. **Yes — a PM can seed a PRD from their own document.** This becomes **E6-S6**. It is this
   epic's machinery pointed the other way: a delta is already computed between a new source
   and an existing version, and *"here is my draft, now reconcile the transcript against it"*
   is that same computation with v1 authored instead of extracted. Building it in E5 would
   have duplicated E6.

   **The cost is real and is the design constraint, not a footnote.** Seeded content enters a
   PRDVersion without passing through extraction or grounding, so:
   - every seeded requirement is `pm_authored = 1` and is **excluded from M1**, the grounding
     rate. A PM's own sentence is not evidence about a source document, and counting it as
     grounded would inflate the one number this project exists to keep honest.
   - the review screen must show a seeded version **visibly differently** from a generated
     one. A reader who cannot tell which requirements were quoted and which were typed is
     reading a document whose provenance is a guess.
   - the deck says which is which. "Every requirement carries a verbatim citation" stops
     being true the moment this ships, and the honest form is *"every extracted requirement
     carries a verbatim citation; requirements the PM wrote are marked as theirs."*

2. **A requirement the new source does not mention is left alone.** Never infer removal from
   absence. A `removed` kind exists only when the source says so explicitly — "we are
   dropping the CSV export" — and silence produces nothing at all. Silence is ambiguous
   between *withdrawn* and *not repeated*, and a system that guesses will quietly delete
   requirements nobody withdrew. Shapes the schema at E6-S1.

3. **The PM reviews the delta, not the whole version**, with the full version one click away.
   Delta-only *is* the value proposition — the churn test exists because a PM who re-reads
   everything has gained nothing. **Sign-off applies to the version**, not to the delta, so
   what gets approved is always a complete document.

4. **An unresolved contradiction blocks sign-off.** Unlike an open question, a contradiction
   means the document asserts two incompatible things, and approving it mints a version that
   is internally false. This is the one place where refusing to move is more useful than
   moving. An open question does **not** block — it is a known unknown, which is a different
   thing from a known falsehood.

5. **"The same requirement" is identified by `req_id`, verified in code.** The model returns
   the id it is modifying; code checks that id exists in the approved version and **rejects
   the delta item if it does not**, rather than trusting a hallucinated id. Same rule as
   everywhere else in this system: the model may propose, the code decides.

## Story list, as approved

E6-S1 delta prompt and schema · E6-S2 WF3 wired and routed · E6-S3 version chain and
changelog · E6-S4 the delta review screen · E6-S5 case **C5** · **E6-S6 seed a PRD from the
PM's own document** (added by decision 1).

**E6-S6 sequences last in the epic**, after the delta machinery it reuses exists and after
E4-S6 has built the `pm_authored` provenance it depends on. It is the story most likely to be
cut for time, and cutting it costs nothing already claimed — which is the reason to build it
last rather than first.
