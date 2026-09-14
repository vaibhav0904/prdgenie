# E4-S6: My own words are not evidence

**As a** PM
**I want** to see which requirements came from my own document and which came from the room
**So that** I do not mistake being quoted back to myself for corroboration

**Added by amendment 2026-09-01**, after Vaibhav asked where a document the PM writes
themselves fits. The ingest half already existed; this is the half that did not.

## Acceptance criteria

- [ ] `source_documents` carries **`authorship`** — `first_party` (the PM wrote it) or
      `third_party` (it records what other people said) — set **at the door** and nowhere
      else.
- [ ] Both doors collect it: one field on the form, one optional field on the webhook body,
      defaulting to `third_party`. Defaulting to first-party would silently weaken every
      claim the system makes.
- [ ] A requirement extracted from a first-party document is stored with
      **`pm_authored = 1`**, exactly as an edited requirement already is — and is therefore
      **excluded from M1**, the grounding rate.
- [ ] The review screen distinguishes the two visibly. A citation into the PM's own brief
      does not render identically to a citation into a customer conversation.
- [ ] `docs/metrics.md`'s M1 definition names both exclusions — edited *and* first-party —
      in one sentence, so the rate has one stated meaning rather than two.
- [ ] **Nothing downstream of WF1 branches on `authorship`.** It is a recorded fact the UI
      and the metrics read, not a routing decision. The E5-S4 spine check covers it.
- [ ] Negative control run once: mark a first-party document `third_party`, confirm its
      requirements re-enter M1, restore.

## Depends on
- E4-S5, and the `feature_brief` adapter in E5-S1

## Eval gate
- none directly. **C2 is re-run** because M1's denominator changes, and a metric whose
  meaning changed without its case being re-run is a metric nobody has checked.

## Technical notes

- **The concept already exists; it was only ever half-wired.** `requirements.pm_authored`
  has been in the schema since E1-S1 with the comment: *"Set when a PM edits the statement:
  their words are not a claim about the source, so an edited requirement is excluded from
  the grounding rate."* That reasoning applies word for word to a document the PM wrote.
  Nothing sets it today.
- **Why this matters, stated plainly.** Grounding a requirement to the PM's own brief is
  mechanically valid and epistemically circular: it proves the PM wrote it, which they
  already knew. A review screen that renders it identically to a customer's own words
  quietly overstates it. The system's promise is "here is where this came from" — and "from
  you" is a real answer that has to look different from "from the room".
- **This is a display and measurement fact, not a pipeline branch.** The temptation will be
  to treat first-party documents differently in extraction. Resist it: one spine (CLAUDE.md),
  and a second code path would need its own eval coverage that does not exist.
- Two things deliberately **not** here:
  - **A PM's draft used as the PRD's starting point**, rather than as a source to extract
    from. That is a different feature and it belongs in **E6**, where it is the delta
    machinery seeded from a document instead of from an extraction. Building it here would
    duplicate E6.
  - **Author identity.** There is no authentication (`docs/assumptions.md`, biggest gap), so
    `first_party` means "the operator says they wrote it", not a verified claim. Say so in
    the assumptions rather than implying the system knows who typed.

---

## DONE — 2026-09-03

`authorship` is collected **at the door and nowhere else**: a required dropdown on the form
(*"Who wrote this?"*, worded about the person rather than the taxonomy) and an optional field
on the webhook, defaulting to `third_party`. An unrecognised value is **refused** rather than
defaulted — a door that claims to set this and silently does not is worse than one that never
offered.

A requirement from a first-party document is stored `pm_authored = 1`, exactly as an edited
one is, and is **excluded from M1**. `docs/metrics.md` now names both exclusions in one
sentence and its SQL carries `AND pm_authored = 0`, so the rate has one stated meaning
instead of two.

The screen distinguishes them: a requirement badged *"the PM's own words"*, and a source pane
that says *"written by the PM — not corroboration"*.

Proven end to end: a first-party document through the webhook door → `authorship=first_party`
stored → both extracted requirements `pm_authored=1`.

**Negative control, both directions:** relabelled `third_party`, the same requirements
re-enter M1 and the rate changes. The exclusion is doing real work, not decorating a column.

**Nothing downstream of WF1 branches on it** — zero mentions in WF2. It is a recorded fact the
UI and the metrics read, exactly like `source_channel`.
