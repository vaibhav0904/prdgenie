# E5-S1: The document the PM wrote themselves

**As a** PM
**I want** to hand the system my own write-up, or a page of notes, and get the same treatment a transcript gets
**So that** the work I did before the meeting is not the work I have to redo after it

## Acceptance criteria

- [ ] `notes` and `feature_brief` ingest through both existing doors and normalize to the
      **identical** canonical SourceDocument shape — same fields, same immutable `raw_text`,
      same redaction.
- [ ] Title comes from the document's own first meaningful line; `received_at` defaults to
      ingest time when the document states no date.
- [ ] **`segments` may legitimately be empty.** A brief has no speakers, and nothing
      downstream may require one (`docs/contracts.md` §1a).
- [ ] Fixtures **N1** and **F1** ingest cleanly and produce requirements with resolving
      citations.
- [ ] The only code that differs per `doc_type` is title and date derivation, in
      `normalize.mjs`. Adding a fifth type touches this function and nothing else.

## Depends on
- E2-S1

## Eval gate
- **C1**, extended to N1 and F1 in E5-S4.

## Technical notes

- **This is the "PM's own document" path, and saying so is the point of the story's title.**
  Vaibhav asked where a document the PM writes themselves enters the system; the answer is
  `feature_brief`, here. The previous phrasing — "the feature_brief adapter" — described the
  mechanism and hid the use case, and a use case nobody can find in the backlog is one
  nobody builds for.
  Fixture F1 is already exactly this document: *"ForgeSight — Feature Brief: 'Day One
  Clarity'. Author: Marcus (Head of Product)"*. It was written in E1-S3, before anyone
  asked the question.
- **Whether the PM wrote it is a separate fact from what type it is.** A brief written by an
  engineer is third-party; an email from the PM is first-party. That axis is **E4-S6**, and
  it is deliberately not conflated with `doc_type` here.
- Notes are the type most likely to arrive as a paste with inconsistent line breaks, which
  is now harmless: line endings are canonicalised at the door (BUG-006).
- Do not add a "smart" title heuristic per type. The failure it prevents is cosmetic; the
  branch it introduces is permanent.

---

## DONE — 2026-09-03, and most of it was already true

`notes` and `feature_brief` normalize to the identical canonical SourceDocument — same
fields, same immutable `raw_text`, same redaction — and **C1 now grades them**:

| Fixture | Type | Recall | Precision |
|---|---|---|---|
| N1 | notes | **100.0%** | **100.0%** |
| F1 | feature_brief | 85.7% | **75.0%** |

**F1 is exactly on the precision floor**, and that belongs next to the word "passes". Its
one false positive and one wrong kind are in the per-item diff, not averaged away.

`segments` may legitimately be empty — a brief has no speakers — and nothing downstream
requires one. The only per-type code is title and date derivation in `normalize.mjs`,
which the spine check now enforces from the outside rather than trusting.
