# E9-S4: Five minutes, including the failures

**As** someone new to this project
**I want** to watch the system handle a document it cannot use
**So that** I can tell the difference between a demo and a product

## Acceptance criteria

- [ ] ~5 minutes, **both paths, in this order** (PRD decision 2): ingest and review a real
      transcript → sign off → the delta on the follow-up → **the eval run live, including the
      injection case**.
- [ ] The sign-off is shown **being refused** from SQL, so the gate is visible rather than
      claimed.
- [ ] Nothing is re-recorded to hide a real outcome. If a run parks on camera, that is the
      take that ships, with the reason read aloud.
- [ ] Recorded **after** the dress rehearsal, from the same clean state a stranger will have.

## Depends on
- E9-S2, E9-S3

## Eval gate
- None.

## Technical notes

- **The failure cases are the differentiator; the happy path is table stakes.** Every
  release will show a document becoming a document.
- The injection case is the one moment where the audience sees the product refuse
  something. It is worth more screen time than the review UI.
