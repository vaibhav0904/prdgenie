# E6-S2: The second document takes the other road

**As a** PM
**I want** a follow-up document to update the PRD we approved instead of starting a new one
**So that** the product has one document that stays alive, not a pile of drafts

## Acceptance criteria

- [ ] **WF3 exists**, is active, tagged `prdgenie`, routes its failures to WF4, and calls a
      provider only through WF0 — the same rules as every other workflow.
- [ ] **WF1 routes on state, never on the PM.** A document whose product has an approved
      version goes to WF3; one whose product does not goes to WF2. The question *"is there an
      approved version for this product"* is computed server-side (`docs/contracts.md` §4), so
      a follow-up ingested before the first PRD is approved correctly takes the normal path.
- [ ] The routing decision is **recorded as an event** with the trace, and the reason it took
      the road it took is readable afterwards without re-deriving it.
- [ ] WF3 produces **the next draft version by applying the delta to the approved version**:
      added requirements appended, modified requirements rewritten **keeping their `req_id`**,
      contradicted ones marked, everything else carried through untouched and byte-identical.
- [ ] **A modification never mints a new `req_id`.** A new id destroys the link to every review
      decision and acceptance criterion that referenced the old one, and would silently inflate
      M2 next cycle by making every item look new.
- [ ] The new version lands in `in_review` and reaches the same inbox by the same route — the
      PM does not learn a second place to look.
- [ ] A delta that finds **nothing** parks with a reason rather than minting an empty version:
      a version whose changelog is empty is a version nobody needs to read.

## Depends on
- E6-S1

## Eval gate
- None directly; **C5 (E6-S5)** grades the result end to end.

## Technical notes

- **The routing gate is the interesting test, not the happy path.** Prove it by ingesting T2
  *before* T1 is approved (must go to WF2) and again *after* (must go to WF3), in the same
  environment, and by asserting the recorded reason rather than the outcome alone.
- Applying the delta is code, not the model: the model proposed the change, code decides what
  the next version says. Same rule as scoring and grounding.
- **Nothing after WF1 may branch on `source_channel`, `doc_type` or `authorship`** — the
  routing decision is about product state, and `check-spine.mjs` will say so if that slips.
- The envelope, the trace and the park behaviour are identical to WF2's. If this workflow needs
  a new reason code, it is added to the closed set **and to every process that enforces it**
  (contracts.md, the deploy-ordering note from BUG-036).

## Outcome — 2026-09-04

**Every acceptance criterion met.** `verify-routing` 15/15 twice, `verify-apply-delta` 15/15 twice, and the
UAT transcribed in the test plan: T2 through the real door, routed to the delta, `v1554` in
`in_review` with 7 requirements carrying their identity from `v1540`.

### What was actually wrong, in the order it was found

**1. Routing read the PM, not the product.** WF1 branched on `target_prd_id` — the optional
"Update an existing PRD" box on the form. A PM who left it blank got a rival draft for a product
that already had an approved PRD; one who filled it in chose the road. The decision now comes
from `routeFor(product_id)`, which asks the same function the delta path uses to find its
baseline — two queries answering *"is there an approved version"* is two answers that can
disagree, and they would disagree exactly when it mattered.

**2. Identity could not survive a version.** `req_id` is `"<version>-REQ-nnn"`, a global primary
key, and versions are immutable, so a carried requirement is *necessarily* a new row. Identity
moved into `origin_req_id`, all 7,289 existing rows backfilled to their own id. TC9c is the
control: all fourteen carried requirements remain findable from the old version by identity
alone, across two different `req_id`s. Without it, M2 would have risen next cycle because the
denominator was replaced rather than because anybody accepted anything.

**3. The fork decided and dispatched nothing.** Both branches ended on a No-Op labelled
`To WF2 generate (E1-S4)` and `To WF3 delta (E6)`. The pipeline was driven by whoever called the
door — the harness posted to `/webhook/generate` itself. **A fork whose branches end on a No-Op
is a decision nobody acts on**, and it had been that way since E1. Both branches now call.

**4. The database refused my first design.** `content` is immutable from insert, so
insert-then-update was rejected outright. The next version is now decided entirely in memory and
written in one insert — which is the better shape anyway.

**5. The route was in the file and not in the process.** The first UAT died on a 404 from
`/internal/apply-delta`. Fifteen checks were green because every one of them imports the module
rather than knocking on the door.

### Three checks this story owns, and what they found on first run

| Check | Found |
|---|---|
| `check-node-references.mjs` | 138 references, all resolving — **8 of them previously unverifiable**, wrapped in `at(...)`/`ran(...)` helpers where a wrong name returns `null` from a `catch` instead of throwing. The checker follows one step of indirection so the code does not have to contort. TC3 is the control that proves it. |
| `check-internal-endpoints.mjs` | The stale process above — and then **two internal endpoints that serve without checking the key** (BUG-051), one of which writes a file. Its own first version POSTed to every path it found and **wrote a weekly report**: the check performed the action it existed to warn about. It now reads the guard out of `server.js` and refuses to knock on anything unguarded. |
| `verify-routing.mjs` TC17 | **Two reason codes the delta path emits that nothing declares** (BUG-050) — a closed set with two members outside it. |

### Four cards filed, none folded in

**BUG-049 (blocker)** — the approval trigger is `BEFORE UPDATE`. An `INSERT` with
`state='approved'` succeeds. Proved on a copy. The hard rule says *"not from n8n, not SQL"*, and
the second half of that sentence is currently false. **This should be the next thing built.**
**BUG-050** (undeclared reason codes) · **BUG-051** (unguarded endpoints) ·
**BUG-052** (the eval corpus is one product, so under real routing every fixture is a follow-up —
`produce.mjs` now sends `dispatch: false` and says why, in a comment that names the card).

### The decision that cost the most thought

**A contradiction is recorded and left standing.** `contradicted` and `removed` write a
`prd_changes` row and change nothing else; the requirement carries across word for word. The new
document disagreeing with an approved requirement is a question for the PM (E6-S4), not a fact
about the product. Applying it here would be the system settling the argument it exists to
surface.

**And one that is a trade, not a win:** WF1 dispatches, so a check that knocks on the form door
now runs a real pipeline. `verify-doors`' webhook knock sends `dispatch: false`; its **form**
knock cannot — a person's door has no such field — so it pays for one delta run per sweep and
proves the whole path in exchange. That is the honest price of a door that does something.
