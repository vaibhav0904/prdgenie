# E4-S4: Approving something unproven costs a sentence

**As a** PM
**I want** ungrounded items badged, and approving one to require its own reason
**So that** the difference between "verified" and "I decided to trust it" survives into the record

## Acceptance criteria

- [ ] Every requirement with `grounded = 0` renders an amber badge saying it could not be
      verified against the source — visible without hovering or expanding anything.
- [ ] Approving an ungrounded item uses a distinct control and writes decision
      `approve_ungrounded`, **not** `approve`, with a required reason.
- [ ] Overrides are **counted separately** everywhere they appear; they never blend into the
      approval count (`docs/reporting.md`).
- [ ] The override count for the current version is visible on the review screen, not buried
      in a report.
- [ ] An ungrounded item cannot reach the approved content through the plain approve path.
- [ ] Negative control run once: attempt to approve an ungrounded item as a plain `approve`,
      confirm it is refused.

## Depends on
- E4-S1

## Eval gate
- none — the grounding *decision* is C2's subject; this story is what the UI does with it.

## Technical notes

- **An honestly-flagged ungrounded requirement is not an error**, and the screen must not
  treat it as one. C2 measured this in E2-S3: 1 of 64 citations was unplaceable and was
  correctly reported as `grounded = 0`. That is the system saying "I could not verify this",
  which is the behaviour the design asks for.
- The badge is the product surface of the whole grounding argument. If it is subtle, the
  claim quietly becomes "everything here is verified", which is false.
- `approve_ungrounded` already exists as a `review_actions.decision` value in the schema
  (E1-S1) with the comment explaining why it is its own kind. This story is the first code
  to use it.
- **What this story cannot do is make grounding mean more than it does.** BUG-004 is the
  standing evidence: fourteen requirements about car parking, every one genuinely quoted and
  correctly badged as grounded. The badge tells the PM where a claim came from, not whether
  it should exist — and E4-S5's caveat line is where that distinction gets said out loud.

---

## DONE — 2026-09-03

An ungrounded requirement carries a visible badge — *"not verified against the source"* — and
**cannot be approved through the plain path**. The endpoint refuses with
`ungrounded_requires_override` and explains why in a sentence a person can act on.

Approving one uses `approve_ungrounded` and requires a reason, so the record keeps the
difference between *"verified"* and *"I decided to trust it"*. Overrides are counted
**separately everywhere** — the API, the header, the sign-off response — and never blend into
the approval count.

**Negative control, both directions.** With the guard removed, the unverified requirement
takes the plain approve path and lands as `approved=1, overrides=0`. **That is what the
count would have said while an unverified requirement shipped inside an approved PRD** — and
nothing else on the screen would have looked different.
