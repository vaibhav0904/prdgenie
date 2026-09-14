# BUG-036: an empty balance is classified as an unrecognised failure

**Severity:** major · **Filed:** 2026-09-03
**Found by a real outage, not a drill** — the OpenAI balance ran out mid-measurement and all
ten fixtures parked at once.

## What happened

```
extractor | llm_error — You have no credits remaining. Add credits to continue using the API
                        at https://platform.openai.com/settings/organization/billing/.
```

Ten of ten fixtures, one after another, prompt `7f9c3916173e`. C1 graded **0.0% recall on
every fixture** and every case went red.

## What went right, and it is most of the story

The degradation machinery did exactly what it promises, on a failure nobody staged:

- **Every run parked** with a machine-readable reason. None half-processed.
- **The provider's own message was kept beside the code**, which is the only reason this took
  one query to diagnose rather than an afternoon.
- **`failures: []` in the manifest and ten `needs_review` runs** — the producer did not report
  success, and `grade.mjs` went non-zero.
- **No partial PRD, no invented requirement, no confident wrong answer.** The floor held under
  a total provider loss.

That is E7-S4 and BUG-028 earning their keep on an unrehearsed fault, and it belongs in the
deck.

## The defect

`docs/architecture.md`'s degradation table promises:

> Provider **rate limit or exhausted quota**, 429 → Parked, reason `llm_rate_limited` ·
> *Self-heals*

An exhausted balance **is** an exhausted quota, and it was classified `llm_error` — the code
reserved for *"an unrecognised failure gets a code that says so"*. The classifier in
`review-ui/llm-errors.mjs` (and its two copies) tests:

```js
if (status === 429 || /rate[_ ]limit|too many requests|quota/.test(text)) return 'llm_rate_limited';
```

OpenAI's message for this condition says **"no credits remaining"** — not "quota", not "rate
limit" — and whatever n8n handed the classifier did not carry a `status` of 429 where it looks.
**This is BUG-029 exactly: a real, named provider condition classified as unrecognised because
the classifier was written against the API's documented vocabulary rather than the prose that
actually arrives.**

## And the right answer is probably not `llm_rate_limited` either

The table says `llm_rate_limited` **self-heals** and needs nobody. An empty balance heals when
a human goes and pays. Filing it as rate-limiting would send the operator a code that means
*"wait, it will pass"* about a condition that will never pass on its own — which is a
different way of being wrong, not a fix.

The honest options, in order of preference:

1. **A sixth reason, `llm_no_credit`** — the closed set in `docs/contracts.md` §3 gains one
   member, the degradation table gains a row whose resolver is *"Vaibhav as operator — top up
   the account"*, and the needs-attention queue can say what to do. A closed set is only worth
   having if it is allowed to grow when reality names something new.
2. `llm_unauthorized`, on the reasoning that the credential no longer buys anything. Wrong in
   the message it sends — nobody needs to re-enter a key.
3. Leave it `llm_error`. Defensible under *"an unrecognised failure gets a code that says
   so"*, and it is what shipped — but the condition **is** recognised, by name, in the
   provider's own message.

**This wants a decision from Vaibhav**, because it changes a closed set and the contract that
depends on it.

## What must not be done

**Do not widen the regex to include the word "credit" and call it fixed.** That is the third
time this classifier would be patched by adding a phrase, and the pattern underneath is that
it is matched against prose which the provider is free to reword. Whatever is decided, the
check that goes with it must **inject the condition** and assert the code, the way
`drill-provider-failures.mjs` does for the other five.

## Verified by
- the condition forced through the fake provider, returning OpenAI's real 429 body for an
  exhausted balance, and the reason asserted
- `verify-degradation.mjs` still finding every copy of the classifier and failing on a
  disagreement — there are three, and this fix must land in all of them
- a row in the degradation table, and the reason present in `docs/contracts.md`'s closed set


---

## Closed 2026-09-03 — Option A, decided by Vaibhav: the set grew

`llm_no_credit` is the sixth provider reason. The clause sits **before** the rate-limit clause,
because an exhausted balance arrives as a 429 and matched second it would never be reached.
All three classifier copies changed together; `verify-degradation.mjs` is **76/76**, including
the real outage message verbatim, the `insufficient_quota` code, and the control that a
genuine rate limit still classifies as one.

**Forced through the fake provider, as this card demanded:** a `no_credit` mode serving
OpenAI's real 429 body, asserted in the drill both rounds — `llm_no_credit / llm_no_credit`,
one park row, document intact, nothing else. **26/26.**

**And the drill caught a second defect on the way, which is the reason drills exist.** On its
first run the park came back `error/schema_invalid` with **zero versions**: the review service
was still running the pre-change code, so its copy of the closed set refused the new reason
and the park itself was rejected. The classifier and the set's gatekeeper live in two processes
that deploy separately — **adding a reason code requires restarting both together, or every
park wearing the new code is refused while the gap lasts.** Written into
`docs/contracts.md`'s amendment as an operational note rather than left as tribal knowledge.

The card's own prohibition held: no regex was widened to include the word "credit" and called
a fix — the new clause matches the provider's named condition, and the condition is injected
by a check, not remembered by a person.
