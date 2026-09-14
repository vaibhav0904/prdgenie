# Test cases: BUG-050 — reason codes the code emits and the contract does not declare

```
.\run.cmd review-ui\scripts\check-reason-codes.mjs             every emitted code, derived
.\run.cmd review-ui\scripts\negative-control-reason-codes.mjs  and it can still go red
.\run.cmd review-ui\scripts\verify-routing.mjs                 TC17 without its exemption
.\run.cmd check-all.mjs                                        every standing check, one verdict
```

**The card says two.** The card was reading one module. The point of the fix is a check that
asks the same question of *every* module, and the number it comes back with is the row that
matters — not the two the card already knew about.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **`unknown_version` and `unknown_document` are in a closed set and in `docs/contracts.md` §1**, each with the sentence saying when it applies | both, both places | **Pass** | both in `DOOR_REASONS`; §1's new table gives each a "when" row |
| TC2 | **The sweep asks every module, not the delta path.** A check that covers one module is a claim about one module | count printed | **Pass** | **89 reason literals** across **17 modules + 7 workflow exports**, all derived from the directory |
| TC3 | **Every code the check finds beyond the card's two is added or refused on the record** | named individually | **Pass** | **15**, not 2 — the card's two plus `unauthorized`, `unknown_sweep`, `unknown_dead_letter`, `unknown_route`, `sweep_in_flight`, `sweep_not_in_flight`, `not_in_review`, `already_resolved`, `reason_required`, `ungrounded_requires_override`, `signoff_refused`, `internal_error`. All fourteen in `DOOR_REASONS`, all fourteen in §1 |
| TC4 | **Coverage is derived, not typed** (BUG-003/019): the check prints how many literals it classified and **fails on any it cannot classify** | figure printed | **Pass** | 86 codes across 7 declared vocabularies (44 codes declared, all emitted) + 3 prose = 89. NC2 proves the unclassified bucket is red, not silent |
| TC5 | **The other direction: a declared code nothing emits is named.** A closed set that grows and never shrinks is a glossary | listed | **Pass** | **`low_confidence` was exactly that** — in the set since the first draft of `contracts.md`, emitted by no module and no workflow. Removed. NC3 replants it verbatim |
| TC6 | **The other vocabularies are named, not silently skipped** | 3 named | **Pass** | five, not three: `DROP_REASONS` ×2, `PROVIDER_REASONS`, `SKIP_REASONS` (written into `judge.mjs` from §9, spread from `PROVIDER_REASONS` rather than retyped), `VETTING_REASONS` (new, `weekly.mjs`) |
| TC7 | ~~The `/api/` exclusion is derived from `server.js`~~ — **withdrawn, and the reason is better than the row** | — | **Withdrawn** | The plan assumed the browser surface would be out of scope. It is not: `/api/` answers `reason` to a caller too, and an excluded surface is an allow-list. Every route is in scope, `/internal/` and `/api/` alike, so there is no boundary left to derive |
| TC8 | **CONTROL: a code emitted and not declared is caught**, and the file and line named | fails, names it | **Pass** | NC2: `invented_and_undeclared  review-ui/delta.mjs:63  (reason)` |
| TC9 | **CONTROL: a code declared and emitted nowhere is caught** | fails, names it | **Pass** | NC3: `low_confidence  declared in REASONS` |
| TC10 | **CONTROL: a `reason:` in a shape the check cannot classify is caught** | fails, names it | **Pass** | NC2 is that case. NC5 adds the shape the check had to learn: prose in the code slot. NC6 is its control — prose *outside* a `status:` object stays green, so the rule is the slot and not the sentence |
| TC11 | **The `CARDED` exemption in `verify-routing.mjs` TC17 is deleted**, and TC17 still passes without it | gone, green | **Pass** | gone; `verify-routing` **15/15** |
| TC12 | **The park path still refuses a code outside the set** — the set grew, it did not open | `verify-dead-letters` green | **Pass** | green in the sweep, with `REASONS` one member *smaller* than before |
| TC13 | **Run twice, same answer** (BUG-021) | 2 of 2 | **Pass** | check 2×, byte-identical; control 2×, byte-identical, 9/9 |
| TC14 | **Every standing check green**, open cards named (BUG-038) | `check-all` | **Pass, one named** | **60 of 61 in 112s** — the only red is BUG-046 |

Two rows the plan did not have, both forced by the control:

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC15 | **A code a caller can receive is written where a reader would look** — `REASONS` and `DOOR_REASONS` are named in `docs/contracts.md`, the inward vocabularies deliberately are not | 31 of 31 | **Pass** | rule 5. It went red on all 14 door codes until §1 carried them; NC6b replants one |
| TC16 | **An unreadable contract is a red row in words, not a stack trace** | red, no trace | **Pass** | NC6c. This is how the control's own first run failed — see below |

## The thing that must not happen

**Widening the check to accept whatever the code emits.** The card names this as the non-fix and
it is the tempting one, because the check came back with fifteen codes rather than two. Each one
is a decision recorded in `docs/contracts.md` in this diff. There is no third answer, and "the
check knows about it" is not a declaration.

The second is **enforcement drift across two processes**: growing the closed set means the
classifiers inside the workflows and `/internal/park`'s gatekeeper deploy together (§1's
operational note, from BUG-036). Nothing here grows `REASONS` — it *shrinks* by one — so the
hazard is not live, and `DOOR_REASONS` is never carried by a park at all.

## What the control caught that the check did not

The control's first run failed **all seven cases at once**, with an ENOENT stack trace: rule 5
reads `docs/contracts.md` and the control's temp copy of the tree did not carry `docs/`. Two
fixes, and the second is the one that mattered — the control copies `docs/`, **and the check now
fails rule 5 in a sentence instead of throwing**, because a stack trace in the middle of a sweep
of sixty reads as the harness breaking rather than as a rule failing. NC6c is that case.

`check-exclusive` then caught the control itself: it rewrites a module and declared no lock. It
writes only into a temp copy and points `DB_PATH` at that copy, which is a reason, so it is
declared in `NO_LOCK_NEEDED` rather than exempted.

## The decision this card asked for, and the answer that differs from it

The card's fix says *"add both to `REASONS`"*. **That was not done, and doing it would have
created the next bug.** Everything in `REASONS` is park-able, and a park mints a `prd_versions`
row: `unknown_version` cannot mint a version to record that the version is unknown. So there are
two disjoint closed sets — `REASONS` for what a component answers on an envelope, `DOOR_REASONS`
for what a door answers when the call could not be answered — and rule 3 fails if they ever
share a member.

## Not tested here, and named

- **Whether `DEAD_LETTER_ONLY` is enforced.** It is declared in `assemble.mjs` and nothing
  subtracts it: `/internal/park` checks `REASONS.has(reason)` and stops, so a `workflow_error`
  parks happily. Found while reading for this card, filed as **BUG-060**, not folded in.
- **Which set a code was *meant* for.** The check places every literal in a declared set and
  fails on anything it cannot place; it does not assert that the delta path used a delta code.
  The vocabularies overlap by design — a provider code is a park reason and a skip reason both —
  so "which set was meant" is a reading, not a check. The check says so in its own output.
- **`serveStatic`'s 404.** An unmatched GET falls through to the static server, which answers
  `{error, path}` with no `reason` field at all. A different shape, not a wrong code, and out of
  this card's scope.
