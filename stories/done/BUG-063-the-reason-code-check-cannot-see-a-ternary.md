# BUG-063: The reason-code check cannot see a ternary

**Severity:** major · it is a false negative in a check whose entire claim is coverage
**Found:** 2026-09-05, reading `server.js` during E6-S3, hours after BUG-050 shipped the check
**Area:** `review-ui/scripts/check-reason-codes.mjs` · `review-ui/server.js` · `assemble.mjs`

## What happens

`check-reason-codes.mjs` reports:

```
PASS  89 reason literals, every one accounted for:
      86 codes across 7 declared vocabularies (44 codes declared, all emitted),
```

Two of the codes the sign-off endpoint answers with are not among the 89:

```js
return json(res, 409, {
  status: 'error',
  reason: gate.empty ? 'nothing_to_review' : 'items_undecided',
  ...
```

`nothing_to_review` and `items_undecided` are in **no declared set** and in
**`docs/contracts.md` nowhere**. They are the codes a caller receives when the human gate
refuses a sign-off — among the most consequential refusals in the system — and two verifiers
(`verify-review-gate` TC2, `negative-control-review-gate`) assert `items_undecided` by name.

The extractor is:

```js
const EMITS = /\\?["']?([A-Za-z_]*reason)\\?["']?\s*:\s*\\?["']([^"'\\]*)\\?["']/g;
```

It requires a **quoted literal immediately after the colon**. A ternary, a variable, a template
string or a function call is invisible to it. So the check's headline — *"every one accounted
for"* — is a claim about the literals it can parse, not about the reasons the code emits.

## Why this one matters more than the codes it missed

BUG-051 wrote the sentence this bug is an instance of: **a guard check with a false negative is
worse than no guard check, because it is a false negative that reads as an audit.** BUG-050
shipped a check that says *every* reason is declared, and a reader now has a green row telling
them the vocabulary is closed. It is not.

The two missing codes are also a genuine gap on their own: a caller that gets a 409 with
`items_undecided` cannot look it up, which is exactly the property `DOOR_REASONS` was created
to give.

## The fix

1. **Add both to `DOOR_REASONS` and to `docs/contracts.md` §1**, with the sentence saying when
   each applies. They are door refusals — the gate said no — not envelope reasons.
2. **Widen the extractor beyond a literal after a colon.** The honest form is: find every
   `<something>reason` key, then take *every* string literal in its value expression, so a
   ternary contributes both arms. Anything whose value has no string literal at all —
   `reason: err.reason`, `reason: classifyProviderError(e)` — is a pass-through and should be
   reported as one rather than silently skipped, because "I could not read this" is information.
3. **The control must plant a ternary.** `negative-control-reason-codes` NC2 plants a literal
   and the check finds it; nothing in that file has ever asked whether the extractor's *shape*
   is complete. A control that only tests the case the checker was written for is a control that
   agrees with it.
4. Re-run the widened check and treat whatever else it finds the way BUG-050 treated its
   fifteen: each one a contract amendment or a card, never a widened allow-list.

## Not a fix

Adding these two codes and leaving the extractor as it is. The codes are the symptom; the
extractor is the bug, and the next code written as a ternary would be just as invisible.

---

## Closed 2026-09-05

The extractor reads a reason's whole **value expression** now, not the token after the colon.
`nothing_to_review` and `items_undecided` are in `DOOR_REASONS` and in `docs/contracts.md` §1.
**89 → 98 literals, 44 → 47 declared codes.**

**Widening it reported eight, and four of those were the checker's fault, not the code's** — the
condition of a ternary in `gaps.mjs`, the tail of the n8n node named *"Refused — log the reason"*,
and a `\"reason\": { \"type\": \"string\" }` schema read as if its innards were codes. Each is now
a rule with a control behind it (NC2e, property position, structural values).

**And the fix introduced a blind spot of its own.** Requiring the key to be in property position
made the schema case vanish *silently*, because `\s*` does not match the two characters `\` and
`n` — which is how a Code node's newlines arrive inside a JSON string. A blind spot introduced by
the fix for a blind spot, in a card about exactly that. Found by re-reading the output for the
findings that had **stopped** appearing.

The check now prints what it cannot see: **14 pass-throughs and 2 schema fields**, named, and
subtracted from the coverage figure out loud. `reason: err.reason` will never be statically
readable, and a rule that reddened on it would be switched off within a day — NC2d is the control
that keeps that distinction.

`negative-control-reason-codes` **13/13**, five cases added, and NC2b/NC2c plant an undeclared
code in each ternary arm **separately**: a checker that read only the first would pass a test that
planted only the first.
