# E6-S3: Version two, without losing version one

**As a** sponsor
**I want** to read what we approved in March after we have approved something else in April
**So that** "the PRD changed" is a thing I can inspect rather than a thing I am told

## Acceptance criteria

- [ ] **`prd_changes` is persisted** on every delta application: one row per change, carrying
      the kind (`added` / `modified` / `contradicted` / `removed`), the `req_id`, the before
      and after text where both exist, and the `doc_id` of the source that caused it.
- [ ] **Approving version N sets version N−1 to `superseded`** — in the same transaction as the
      approval, through the sign-off endpoint, and nowhere else.
- [ ] **Version N−1's text is still readable and byte-identical** to what was approved. A
      superseded version is history, not a draft to be edited.
- [ ] Version history is browsable: every version of a PRD, its state, when it was approved,
      and what changed between it and the one before it.
- [ ] **The changelog is derived from `prd_changes`, never re-computed by diffing text.** A
      diff produced later describes today's parser; the row describes what was decided.
- [ ] The review screen's version trend — built in E4-S5 as "no prior version" — now renders a
      real comparison.
- [ ] `superseded` is reachable **only** by the approval of a later version. No other path
      writes it, and the trigger that guards `approved` is not weakened to allow this one.

## Depends on
- E6-S2

## Eval gate
- None. **C3** already recomputes structure and determinism; this is state and history.

## Technical notes

- ADR 0005: PRD versions are immutable rows. This story is what makes that claim visible —
  until now nothing has ever superseded anything.
- **The supersede is part of the approval, not a follow-up.** A separate step is a step that
  can fail on its own, leaving two approved versions of one PRD: the exact ambiguity the
  version chain exists to remove.
- Test the failure, not just the success: an approval that cannot supersede (a locked row, a
  crash between the two writes) must leave **one** approved version, not two, and the
  transaction is what guarantees it.
- History is a read model. Nothing in it may be recomputed from the current text — the point
  of a changelog is that it survives the thing it describes being replaced.

---

## Built 2026-09-05 — `superseded` was a state nothing could reach

Every acceptance criterion is met, and the one that mattered is the transaction. **A state
machine with an unreachable state is a diagram, not a machine**: `superseded` sat in the CHECK
constraint for the whole project and no code path went there.

### What changed

| | |
|---|---|
| `signOff()` | supersedes every other approved version of the PRD **inside its own transaction**. Returns `{changes, superseded, prd_id}`; the endpoint logs a `superseded` event with the count |
| `prd_changes` | rebuilt: `removed` admitted (**BUG-062**), `doc_id` added. All 110 existing rows carried across; their `doc_id` stays NULL, which is the truth about them |
| `versionHistory(prdId)` | the read model — every version, its state, its approval time, what it was derived from, and its changes **read from `prd_changes`** |
| `predecessorOf(versionId)` | `derived_from`, not the previous version number. The old code carried a paragraph warning that a lower number is not a predecessor and then picked one by number |
| `GET /api/prds/:prd_id/history`, `/api/prds` | bounded at 50 versions with `versions_total` beside it — `PRD-forgesight` has 1,206, and a read model that returns all of them is a page nobody can scroll |
| `history.html` | the chain, newest first, joined by `derived_from`, with the changes and the document that caused each |
| the review screen's trend | a real comparison against a named predecessor, with a link to the full chain. Still "no prior version" where there is none |

### An approval supersedes EVERY other approved version, not just version N−1

In the normal case they are the same row. They are not on `PRD-forgesight`, which carries twenty
approvals from before the rule existed. **There is no backfill:** most of those are debris from
when a control signed off whatever versions it found (BUG-045), and rewriting them into a chain
would assert an editorial history that never happened. The rule makes the invariant true when it
next runs; TC14 prints how many PRDs are still waiting, every run.

### Three cards filed, none folded in

**BUG-062 (major)** — `prd_changes` refused `kind='removed'` for the whole of E6 while
`delta.mjs` emitted it and §10 named it. Inside `applyDelta`'s transaction, so a document saying
"we are dropping the CSV export" took down the follow-up it was meant to produce. Closed here,
because AC1 already required it.

**BUG-063 (major)** — `check-reason-codes`, shipped hours earlier claiming *"89 reason literals,
every one accounted for"*, **cannot see a ternary**. The sign-off endpoint answers
`reason: gate.empty ? 'nothing_to_review' : 'items_undecided'` — two codes in no set and no
contract, asserted by name in two verifiers.

**BUG-064** — `verify-metrics` TC3 compares M4's `approved` **events** against versions in
**state** `approved`. Those agreed only because nothing had ever left that state. The first real
chain turns it red, and the check is the wrong side: a supersede is not an un-approval.

### The thing I got wrong first

TC6's first draft made `signOff` throw by naming a version that does not exist. It passed — and
it proved the *approval* is guarded while saying nothing about whether the supersede shares its
transaction. It would have gone on passing with the supersede moved outside `tx()` entirely.
**Injecting the fault at the approval to test the supersede is testing the wrong write.**
