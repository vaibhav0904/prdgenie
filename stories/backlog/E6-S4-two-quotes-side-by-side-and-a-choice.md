# E6-S4: Two quotes side by side, and a choice

**As a** PM reviewing a follow-up
**I want** to see what the PRD says and what the room said, at the same time
**So that** I resolve a contradiction by choosing, not by retyping

## Acceptance criteria

- [ ] The delta review screen shows **added in one treatment, modified with old and new side by
      side, and contradictions with both quotes visible at once** — the PRD's sentence and the
      new source's sentence, on screen together, neither behind a click.
- [ ] **Each side links to its own source.** The new-source quote highlights its span in the
      document, exactly as a citation does today; the PRD side names the version it came from.
- [ ] The PM can take either side of a contradiction **without editing text by hand**. Choosing
      is one action and is recorded with a reason, like every other review decision.
- [ ] **An unresolved contradiction blocks sign-off** (PRD-E6 decision 4) — computed
      server-side and re-checked at the endpoint, not enforced by a disabled button. An **open
      question does not block**: a known unknown is not a known falsehood.
- [ ] **The PM reviews the delta, not the whole version** — with the full version one click
      away. Delta-only is the value proposition; a PM who re-reads everything has gained
      nothing.
- [ ] **Sign-off applies to the version, not to the delta.** What gets approved is always a
      complete document (PRD-E6 decision 3).
- [ ] The screen says what it is not showing: how many requirements carried through unchanged,
      so "four changes" is read against a denominator.

## Depends on
- E6-S3

## Eval gate
- None — this is the human surface. Its gate is the UAT: a person resolves a real contradiction
  from T1→T2 and signs off, transcribed.

## Technical notes

- The source pane already keys on the citation's `doc_id` (E4-S2), which is why two-sided
  citations were designed that way in E6-S1 rather than merged into one shape.
- **The block is a readiness computation**, in the same place readiness already lives
  (`review.mjs`), so both the button and the endpoint read one implementation. A gate on the
  button alone is a gate a second channel removes (BUG-019's lesson, in a new place).
- Resolving a contradiction is a *decision on a requirement*, so it flows through the existing
  decision path with its reason — not a new table and not a special case.
- Show the unchanged count from the version, never by subtracting the delta from a number
  typed elsewhere.
