# E3-S4: What the room never settled

**As a** PM
**I want** the conflicts, unanswered questions and missing non-functional categories surfaced as their own section
**So that** the most valuable output of a meeting — what was *not* decided — survives past the call

## Acceptance criteria

- [x] Detection returns OpenQuestions of exactly three kinds: `conflict` (two stakeholders
      disagree), `unanswered` (asked in the room, never resolved), `missing_nfr` (a category
      the sources never covered).
- [x] `conflict` and `unanswered` items **carry citations** — for a conflict, to **both**
      sides of the disagreement.
- [x] `missing_nfr` items carry **no citations**, and are rendered as a visibly different
      kind. Their evidence is an absence; a citation to nothing would widen the grounding
      claim past what is true (decided 2026-09-01).
- [x] `missing_nfr` categories come from a **fixed checklist** in the prompt — performance,
      security, accessibility, data retention, scale, localization — not free text, or the
      set would drift every run and C4 would be unstable.
- [x] OpenQuestions **accompany** the PRD; they never block assembly (decided 2026-09-01).
- [x] `n8n/prompts/detect-ambiguity.md` exists and is the source of truth.

## Depends on
- E1-S4

## Eval gate
- **C4** (E3-S6).

## Technical notes

- **This is the capability that goes furthest past the original scope**, and the one most likely to
  be judged on taste rather than counts. T3's third conflict is written to read like
  agreement on purpose.
- A fabricated conflict is not simply wrong — it may be a genuine find the labels missed.
  C4 gives ambiguity a third verdict (`PASS-PENDING-MANUAL-REVIEW`) rather than a binary
  fail (`evals/README.md`).
- The `missing_nfr` checklist is a prompt **constant**, not a tuned parameter. Changing it
  changes what C4 measures, so it changes with an ADR-level note, not quietly.
- Contradictions found *against an existing PRD* are E6's delta path, not this story. Here,
  conflicts are found within the sources of one run.

## Outcome — 2026-09-02

**All six acceptance criteria met. 14 of 17 test rows pass.** The capability exists end to
end: `n8n/prompts/detect-ambiguity.md` (`df8499a97cb1`) → a WF0 call → `gaps.mjs` → rows in
`open_questions` and items in the version `content`, with code owning every `match_kind` and
every `grounded`.

On T3 it produces the artefact this story was written for: the SAML/self-serve argument filed
as a **`conflict`**, grounded, with nine exact citations including *"I'm not settling that in
this meeting."*

### Three things it did not do, all measured and all filed

1. **It did not close BUG-007.** Both sides of that same argument are still extracted as
   requirements in 3 runs of 3. **The second drawer was built in a different component** —
   the extractor runs first, sees only its own schema, and adding a later stage cannot change
   what an earlier one can emit. BUG-004's lesson, read properly, is *give the destination to
   the call making the choice*. Two ways to actually close it are written on BUG-007; both
   are architectural and neither is small.
2. **`missing_nfr` is enumerated, not detected** — all six categories on F1 and on H1, while
   missing F1's own labelled `missing_nfr`. **BUG-020**, with a note not to tune it until C4
   can say whether a change helped.
3. **The parked document still asks a question** — *"What is the biscuit budget?"* on the
   coffee-machine meeting. The detector never receives `concerns_product`. **BUG-019.**

### Why it ships anyway

Every criterion on this card is met, the shape rules are enforced by code and controlled in
both directions, nothing regressed, and **the quality of the judgement is C4's business** —
which belongs to E3-S6, needs a fixture that does not exist, and has no threshold since the
old one was declared void. Holding this story until then would leave the capability unbuilt
and the three findings above undiscovered.

**Promoted on evidence, no UAT** (G6): every claim here is a row count, a `match_kind`, a
drop reason or an exit code. The *taste* judgement this card predicted would be needed —
whether these questions are worth a PM's time — is now genuinely available to make, and
`evals/results/2026-09-02-gaps-report.txt` is what to read to make it. That is E3-S6's UAT,
not this one's.
