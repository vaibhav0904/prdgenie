# E4-S1: Fix one line without rejecting thirty

**As a** PM
**I want** to approve, reject or edit each item on its own, giving a reason
**So that** one bad sentence costs one correction instead of a whole draft

## Acceptance criteria

- [ ] Every requirement, story, feature and open question carries its own approve / reject /
      edit control, and each decision writes one `review_actions` row with its session,
      item type, item id and timestamp.
- [ ] A reason is **required** on reject and edit, enforced at the storage layer, not only
      in the form. A blank reason is impossible to create through any channel.
- [ ] An edit stores `before_text` and `after_text`. Actions are append-only: correcting an
      edit is another edit with its own reason, never a mutation.
- [ ] An edited requirement is marked `pm_authored = 1` and **leaves M1 entirely** — the
      grounding rate can never be improved by editing.
- [ ] An edited requirement **keeps its citations**, visibly marked *"from the original
      extraction"* (decided 2026-09-01).
- [ ] **Amended 2026-09-02, closing BUG-016:** each requirement's `subject` is **persisted and
      rendered** beside its statement. It is currently emitted by the model, required by the
      schema, and thrown away — so the one plausible explanation for BUG-016's last unfixed
      defect cannot be tested. **The hypothesis to test once it is visible:** the model is
      satisfying *"name the subject"* in that field and dropping it from the statement, which
      is why *"Access must be scoped by role…"* has no subject after two attempts at the
      prompt.
- [ ] **And re-read BUG-016's two survivors against it** — the circular sharing definition and
      the missing subject. If the `subject` field explains the second, the fix is a prompt
      redirect and belongs here; if it does not, BUG-016's limitations are permanent and the
      card says so rather than staying hopeful.
- [ ] A rejected requirement is **excluded from the approved content but kept in the record**
      with its reason; it does not block sign-off (decided 2026-09-01).
- [ ] There is **no bulk approve**. If one is ever added it must be its own action kind.

## Depends on
- E1-S6

## Eval gate
- none — this is deterministic UI and storage behaviour, verified by its test plan.

## Technical notes

- **Why `subject` arrives here rather than in extraction.** BUG-004's TC10 deferred persisting
  it because nothing rendered it, and BUG-016 then hit a wall that only the rendered field can
  explain. Two cards have now pointed at this screen; it is the reason the amendment exists.

- **The reason belongs at the storage layer** because `docs/reporting.md` rule 4 says it
  travels on every channel that accepts a decision. The trigger for this already exists
  (`review_actions_require_reason`, E1-S1); this story is where it stops being decorative.
- **Editing must not silently keep the old `grounded` value.** An edited statement is a
  human's own words and is no longer a claim about the source. Getting this wrong turns the
  grounding rate into a measure of how much the PM rewrote.
- The citation-keeping decision is the subtler half: the PM edited the *wording*, not the
  provenance. Marking the citations as original is what stops the UI implying the source
  says something it no longer says.
- **No bulk approve is the load-bearing non-goal.** "Approve all" is precisely the
  affordance that turns M2 from a quality signal into a measurement of impatience
  (PRD-E4 non-goals).

---

## DONE — 2026-09-03, with one criterion moved to a card

Per-item decisions through `POST /api/prd-versions/:id/decisions`. Every requirement and
story carries its own approve / reject / edit, each writing one append-only
`review_actions` row. A reason is required on reject, edit and override **by a database
trigger**, so it holds on every channel that accepts a decision, not only the form.

**An edit rewrites the statement, marks it `pm_authored`, and takes it out of M1** — the
grounding rate can never be improved by editing. Its citations stay, marked as coming from
the original extraction. Measured live: the denominator fell from 2 to 1 the moment the edit
landed.

**Moved, not done: the amended `subject` criterion.** BUG-016 closed on the promise that this
story would persist and render it, so its last unfixed wording defect could be diagnosed.
E4 shipped without it. **Filed as BUG-027** rather than left as a sentence in a closed card,
which is exactly what BUG-016 promised not to do.
