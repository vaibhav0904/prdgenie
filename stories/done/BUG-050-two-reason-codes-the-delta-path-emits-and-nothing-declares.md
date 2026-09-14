# BUG-050: Two reason codes the delta path emits and nothing declares

**Severity:** minor · no known path reaches them today, and that is the whole reason they survived
**Found:** 2026-09-04, the first run of `verify-routing.mjs` (E6-S2), TC17
**Area:** `review-ui/delta.mjs` · the closed set in `review-ui/assemble.mjs` · `docs/contracts.md` §1

## What happens

`checkDelta` answers a bad call with two reasons that exist nowhere else:

```js
if (!version) return { status: 'error', reason: 'unknown_version', missing: ['prd_version_id'] };
if (!doc)     return { status: 'error', reason: 'unknown_document', missing: ['doc_id'] };
```

Neither `unknown_version` nor `unknown_document` is in the closed set `REASONS`, and neither
appears in `docs/contracts.md`. The convention they break is one of the project's oldest:

> non-`ok` carries `{reason, missing:[]}`, **closed set**

TC17 derives the reasons from the shipped workflow and from `delta.mjs` rather than listing
them, which is why it found these on its first run and five stories' worth of eyes did not.

## Why nothing has broken

`/internal/park` validates against `REASONS`, so a park carrying one of these would be refused —
a 400 at the exact moment something was already going wrong (BUG-036's deploy-ordering hazard).
It has never happened because these two reasons come back as a **400 from the check endpoint**,
which stops the run and sends it to WF4 instead. The park path is never reached.

So the bug is not a failure. It is a **closed set with two members outside it**, which means the
set is not closed, which means the next reason added by hand has no rule to fail against.

## The fix

1. Add both to `REASONS`, and to the §1 listing in `docs/contracts.md` with the sentence that
   says when each applies.
2. Ask the same question of every other module that returns a `reason`, derived rather than
   typed — `verify-routing`'s TC17 does it for the delta path only. **A check that covers one
   module is a claim about one module.**
3. Delete the `CARDED` exemption in `verify-routing.mjs` TC17. An exemption that outlives its
   card is an allow-list.

## Not a fix

Widening the check to accept whatever the code emits. The set exists so that a new reason is a
decision somebody takes, in a diff, in three places at once.

---

## Closed 2026-09-05 — it was two because only one module had been asked

`check-reason-codes.mjs` asks every module, `server.js` and every workflow export the question
this card asked of `delta.mjs`. **Fifteen codes, not two.** The other thirteen:
`unauthorized` (on all seventeen internal routes), `unknown_sweep`, `unknown_dead_letter`,
`unknown_route`, `sweep_in_flight`, `sweep_not_in_flight`, `not_in_review`, `already_resolved`,
`reason_required`, `ungrounded_requires_override`, `signoff_refused`, `internal_error` — and
`judge_misaligned`, which was in `docs/contracts.md` §9 and in no set anywhere.

**The fix in step 1 was not taken, and this is the substantive change.** Adding them to
`REASONS` would have created BUG-060 fourteen more times: everything in `REASONS` is park-able,
and a park mints a `prd_versions` row. `unknown_version` cannot mint a version to record that
the version is unknown.

So there are **two disjoint closed sets**: `REASONS`, what a component answers on an envelope,
and `DOOR_REASONS`, what a door answers when the call itself could not be answered. Rule 3 of
the check fails if they ever share a member. Two more vocabularies were written down because
they existed and were governed by nothing — `SKIP_REASONS` (from §9, spread from
`PROVIDER_REASONS` rather than retyped) and `VETTING_REASONS`.

**The set also shrank.** `low_confidence` was in the closed set from the first draft of
`contracts.md` and **nothing has ever emitted it** — a code for a model reporting its own
certainty, which this project forbids on another page. A closed set that only ever grows is a
glossary. `negative-control-reason-codes` NC3 replants it verbatim.

**Four sentences moved out of the code slot.** `{ status: 'error', reason: 'no such version' }`
put prose in the field a caller branches on. The prose now sits in `detail`, where the SPA
already reads it (`body.detail || body.reason`), and the code slot holds `unknown_version`.
NC5/NC6 pin the rule to the slot rather than to the sentence.

Step 3 done: the `CARDED` exemption is gone from `verify-routing.mjs` TC17, which is 15/15
without it.

**Found while reading for this card and not folded in: BUG-060** — `DEAD_LETTER_ONLY` is
declared and nothing subtracts it.

`check-all`: **60 of 61 in 112s**, the only red BUG-046.
