# PRD-E4: A review gate worth using daily

**Status:** Approved
**Date:** 2026-09-01
**Approved:** 2026-09-01 by Vaibhav

**Amended 2026-09-01, after approval, at Vaibhav's request.** A sixth story was added —
**E4-S6, first-party provenance** — because the epic as written could not tell the PM which
requirements came from their own document and which came from the room. The amendment is
recorded here rather than folded into the scope list silently; the reasoning is in E4-S6's
technical notes.

## Problem

E1's review screen can approve a whole PRD. That is enough to prove the gate exists and
nowhere near enough to use. The churn test in `docs/roadmap.md` names the failure directly:

> Fixing one sentence means rejecting the whole draft. If the only verbs are approve and
> reject, a PM with one bad line out of thirty has to reject thirty.

A PM who cannot fix one line in place will do one of two things, and both end the pilot:
export the draft and edit it somewhere else — at which point the PRD lives outside the
system and the delta feature is dead — or approve things they do not quite agree with,
which poisons the only quality signal the product has.

There is a second, quieter problem. The review screen is where the PM decides whether to
trust the system, and right now it hands them a document with no indication of *how much*
of it is grounded, whether the run degraded, or what the model was unsure about.

## Goals / Non-goals

**Goals**

- Per-item approve, reject and **edit in place**, each with a reason that is stored.
- Citations clickable on every kind of item — requirements, stories, open questions,
  priority factors — highlighting the exact span in a source pane.
- Sign-off readiness **computed server-side**, not inferred from a button's state.
- Ungrounded items visibly badged, approvable only through an explicit, logged override.
- The review screen carries its own honest numbers and a caveat line computed from state.

**Non-goals** — deferred deliberately, with reasons:

- **No multi-user review, no assignment, no comments.** One reviewer, no identity
  (`docs/assumptions.md`, top). Building collaboration onto an unauthenticated system
  would be building on sand.
- **No rich-text editing.** Edits are plain text into the same field. A WYSIWYG editor is
  a week of work that changes no claim this project makes.
- **No undo/redo.** ReviewActions are append-only; correcting an edit is another edit with
  its own reason. That is more honest than a mutable draft, and it is what makes M3
  meaningful.
- **No bulk approve.** Deliberate, and the most likely thing to be asked for. A one-click
  "approve all" is exactly the affordance that turns M2 into a measurement of impatience.
  If it is ever added, it must be its own ReviewAction kind so it can be counted
  separately.
- **No re-running the pipeline from the review screen.** Rejecting produces a new draft
  (ADR 0005); re-generation is an ingest, not a review action.

## Who this is for

The **PM** persona, on their third week — the point the churn test is written about. This
epic is the difference between a demo and a tool.

## Proposed scope → stories

- **E4-S1:** Per-item ReviewActions — approve, reject, edit — with a required reason on
  reject and edit, before/after text stored on an edit, and every action carrying its
  session, item type, item id and timestamp.
- **E4-S2:** Citation chips on every item kind, with a source pane that scrolls to and
  highlights the span. Uses the offsets the grounding check rewrote, never the model's.
- **E4-S3:** Computed sign-off readiness — the endpoint recomputes that every requirement
  and story has a decision before it sets the trigger's marker; the disabled button is a
  courtesy only.
- **E4-S4:** The ungrounded flow — amber badge, an "approve anyway" that requires its own
  reason, stored as a distinct action kind so overrides can be counted rather than
  blending into approvals.
- **E4-S5:** The review screen as a report — grounding rate for this version, counts by
  kind, the trend against the previous version, and the caveat line computed from state
  (parked, degraded, below 100% grounded, any override used).
- **E4-S6 (added by amendment):** First-party provenance — the door records whether a
  source was written by the PM themselves, the review screen shows it, and M1 excludes it,
  exactly as it already excludes a PM's edits.

## Success criteria

1. A PM can change one sentence in a thirty-requirement PRD, give a reason, and approve
   the rest — without rejecting anything else and without leaving the UI.
2. Every reject and every edit in the database has a non-empty reason. A blank reason is
   impossible to create through the UI.
3. Clicking any citation on any item kind highlights the correct text in the source pane,
   verified by eye against three requirements chosen at random during UAT.
4. Sign-off is refused by the **endpoint** — not merely by a disabled button — when any
   item lacks a decision. Proven by calling it directly with `curl` mid-review.
5. Ungrounded items cannot be approved without an override, and the override count is
   visible on the review screen rather than buried.
6. The caveat line appears automatically on a version that was parked or degraded, and is
   absent on a clean one. Neither state is hand-written.

## Technical constraints (confirmed during exploration, not assumptions)

- **The reason field must be required at the storage layer, not just the form.** A
  required field enforced only in the browser is a convention (`docs/architecture.md`
  guardrail table), and `docs/reporting.md` rule 4 says the reason travels on *every*
  channel that accepts a decision — so a future API caller inherits the requirement.
- **Spans must be rendered from the rewritten offsets** (ADR 0003). The model's original
  offsets are frequently wrong; highlighting the wrong sentence is worse than highlighting
  nothing, because it looks verified.
- **Editing a requirement's statement does not re-run the grounding check**, and must not
  silently keep the old `grounded` value either. An edited statement is PM-authored: it is
  marked as such and excluded from M1, because a human's own words are not a claim about
  the source. Getting this wrong would let the grounding rate be improved by editing.
- **The sign-off marker mechanism from E1-S1 must survive concurrent connections.** If
  better-sqlite3 reuses connections in a way that leaks the marker, the gate opens
  silently — this is the failure mode with no visible symptom, so E4-S3 re-proves the
  refusal rather than assuming E1 settled it.
- **HTML injection through source text.** Source documents are attacker-controlled and are
  rendered into the source pane. Escaping is mandatory; the pane renders text, never
  markup.

## Open questions — all four closed 2026-09-01 by Vaibhav

- ~~**Does an edited requirement keep its citations?**~~ → **Decided: yes, visibly marked
  "from the original extraction".** The PM edited the wording, not the provenance. Dropping
  the citations loses traceability; keeping them unmarked would imply the source says
  something it may no longer say. The edited statement is `pm_authored` and leaves M1
  entirely, so the grounding rate can never be improved by editing.
- ~~**Should rejecting a single requirement block sign-off?**~~ → **Decided: exclude it,
  with its reason.** A rejection is a decision, and decisions should let the document move.
  The excluded requirement stays in the version's record with its rejection reason — it is
  removed from the approved content, not from the history.
- ~~**Is the source pane one document or all of them?**~~ → **Decided: the pane follows
  the citation**, switching documents on click, with the document name always visible so
  the PM knows which room they are reading.
- ~~**How much of the review screen's report belongs here versus E8?**~~ → **Decided:
  figures here, trend deferred.** Grounding rate and counts are cheap and materially change
  reviewing. The trend needs two versions, which only happens in E6, so it renders
  "no prior version" until then rather than being faked.
