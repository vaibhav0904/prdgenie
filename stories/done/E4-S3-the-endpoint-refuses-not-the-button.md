# E4-S3: The endpoint refuses, not the button

**As a** builder
**I want** sign-off readiness recomputed server-side at the moment of sign-off
**So that** the gate holds for a caller who never loaded the page

## Acceptance criteria

- [ ] `/api/prd-versions/:id/sign-off` recomputes, from the rows, that **every** requirement
      and story has a decision before it writes the marker.
- [ ] Readiness is **computed, never stored**. There is no `is_ready` column, and no flag
      set earlier in the run (`docs/contracts.md` §4).
- [ ] Calling the endpoint directly with `curl` mid-review is **refused**, with a
      contract-shaped reason naming what is undecided.
- [ ] The disabled button in the browser is a courtesy and is documented as one.
- [ ] **The marker mechanism is re-proven here**, not assumed settled by E1-S1: sign one
      version off, then immediately attempt a hand-run `UPDATE` on a *different* version on
      the same connection, and watch it refused.
- [ ] Negative control run once: remove the readiness recomputation, confirm a mid-review
      sign-off succeeds, restore.

## Depends on
- E4-S1

## Eval gate
- none — a deterministic property, verified the way the approval gate itself is
  (`evals/README.md` coverage matrix: "not an eval, chosen").

## Technical notes

- **This is the failure mode with no visible symptom.** If a marker leaks across
  connections the gate opens silently and every screen still looks correct. E1-S1 designed
  the risk away with a version-scoped marker (ADR 0006 as amended) and E1-S6 re-checked it;
  this story checks it a third time because the endpoint's behaviour changed underneath it.
- Three checks of the same property is not paranoia here — it is the only guarantee in the
  system whose failure produces no error, no log line and no wrong-looking output.
- The `curl` test is the one that matters. A UI that disables a button proves nothing about
  an HTTP endpoint, and `docs/architecture.md`'s guardrail table asks "can you draw a path
  around it?" — the browser is not the answer.

---

## DONE — 2026-09-03. The button is a courtesy and now says so

`sign-off` recomputes readiness **from the rows**, at the moment of sign-off, for a caller
who never loaded the page. There is no `is_ready` column and no flag set earlier in the run.

```
POST /api/prd-versions/665/sign-off   (mid-review, no browser)
409  items_undecided — 3 of 3 items have no decision
     missing: requirement:665-REQ-001, requirement:665-REQ-002, story:665-STORY-001
```

**The refusal names what is undecided**, because a 409 that says only "not ready" sends
someone to read every row on the screen looking for the one they missed.

**The marker is re-proven here rather than assumed settled by E1-S1**: immediately after a
real sign-off, a hand-run `UPDATE` on a *different* version, on the same connection, is
refused. The door does not stay open behind the person who walked through it.

**Negative control, both directions:** with the recomputation removed, a mid-review sign-off
succeeds. The check is what stops it — not the disabled button, and not good intentions.
