# BUG-060: A subset nothing subtracts

**Severity:** minor · no caller has ever tried it, which is exactly why nothing noticed
**Found:** 2026-09-05, reading `assemble.mjs` for BUG-050
**Area:** `review-ui/assemble.mjs` · `review-ui/server.js` `POST /internal/park`

## What happens

`assemble.mjs` declares a subset of the closed set that a **park** may not name:

```js
/**
 * The subset a PARK may name. ... a workflow that threw left no work and no version to
 * attach one to, so these two belong in the dead-letter queue and nowhere else.
 */
export const DEAD_LETTER_ONLY = new Set(['service_unreachable', 'workflow_error']);
```

Nothing subtracts it. `POST /internal/park` asks `REASONS.has(reason)` and stops there, and
`park()` in `assemble.mjs` does not look at the reason at all beyond writing it to
`prd_versions.park_reason`. So:

```
POST /internal/park  { doc_id, reason: 'workflow_error' }   →  200, a draft version is minted
```

The only thing that ever mentions `DEAD_LETTER_ONLY` outside its own declaration is
`verify-dead-letters.mjs` TC5b, which asserts that **its members are in `REASONS`** — true, and
not the property the comment claims:

```js
say('TC5b', REASONS.has('service_unreachable') && REASONS.has('workflow_error')
  && [...DEAD_LETTER_ONLY].every((x) => REASONS.has(x)), ...)
```

## Why it has not bitten

No caller has ever asked for it. WF4 is the only thing that produces those two codes and WF4
posts to `/internal/dead-letter`, never to `/internal/park` — the two paths are reached from
different places and neither has a reason to cross.

So the bug is not a wrong answer. It is a **rule that reads as enforced and is not**, in the
file whose entire job is the closed set. The comment says "and nowhere else"; the code says
anywhere. The next person to add a dead-letter-only code will believe the subtraction protects
them.

## The fix

1. `POST /internal/park` refuses a `DEAD_LETTER_ONLY` reason with `schema_invalid` and stores
   nothing — the same shape as a reason outside the closed set, because it is the same kind of
   mistake.
2. `park()` refuses it too. The endpoint is one door; `parkRun()` and `assemble()` are called
   in-process by the harness and by four verifiers, and a guard on the door is not a guard on
   the function (BUG-011/012).
3. A row in `verify-dead-letters.mjs` that **posts one** and asserts the refusal *and* the
   absent `prd_versions` row — a call returning `ok` is not a row that changed (BUG-026/032).
4. TC5b's claim is corrected to what it actually asserts, or deleted in favour of (3).

## Not a fix

Deleting `DEAD_LETTER_ONLY`. The distinction it draws is real and is written down in
`docs/contracts.md` §1: a park is a run that stopped honestly and left its work behind, a dead
letter is a run that died with nothing to attach. An unenforced true statement should be
enforced, not withdrawn.
