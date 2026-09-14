# BUG-041: The detail is cut exactly where it becomes useful

**Severity:** raised to **blocking** on 2026-09-04 — it was the only thing standing between a failing sweep and a diagnosis
**Found:** 2026-09-04, during E7-S6, diagnosing why sweep #19 scored 1 of 22
**Area:** WF0 / `skipped_detail`

## What happened

`skipped_detail` exists because "a failure with a code and no detail is a notification, not a
record" (E7-S3). It stored this:

```
You exceeded your current quota, please check your plan and billing details. For more
information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To
monitor your current usage, head to: https://ai.dev/rate-limit.
* Quota exceeded for metric: generativelanguage.googleapis.
```

**The string stops mid-token, one word before the answer.** The metric name is what
distinguishes *requests per day* from *requests per minute* from *tokens per minute* — that is,
it distinguishes "the key is on the free tier's daily cap" from "we are calling too fast" from
"billing genuinely is not attached". Two of those are Vaibhav's to fix and one is mine, and the
record cannot tell them apart.

The truncation is doing its job — an unbounded provider string in a database column is how a
log becomes a liability. It is the **budget** that is wrong: 250-ish characters is spent
entirely on boilerplate and two URLs, and the machine-readable part is what falls off the end.

## Why it matters more than it looks

This is the record we would read *after* an outage, when the call cannot be repeated. The whole
point of storing the provider's own words is to avoid guessing later. Here it forced exactly
the guess it was built to prevent — the diagnosis in E7-S6 came from **counting successful
calls per hour** instead, which is inference, not evidence.

## Repro

`SELECT skipped_detail FROM judge_sweeps WHERE sweep_id = 19` — the value ends
`generativelanguage.googleapis.` with no metric name and no closing.

## Suggested fix, not applied

Keep the cap, spend it better. The provider's message is boilerplate-first and specific-last,
so a head-truncation loses precisely the wrong end. Options, in order of preference:

1. **Keep the head and the tail** — first ~120 chars, an ellipsis, last ~120. Cheap, generic,
   and works for any provider whose message puts the specifics at the end.
2. Strip known boilerplate URLs before truncating.
3. Raise the cap. Least preferred: it fixes this message and not the next one.

Whatever is chosen, the test is a **stored** value that still contains the metric name for a
real quota error, not a unit test on a string function.

## FIXED, 2026-09-04 — and the fix needed a fix

**Option 1 shipped**: the cap stays at 300, and it is spent on both ends — 55% head, a visible ellipsis, the rest tail. Google's message is boilerplate-first and specific-last, so this is the shape that generalises rather than one tuned to this provider.

**The first attempt at the fix shipped a worse bug than the one it fixed.** `bounded()` was written correctly, checked as standalone JavaScript, and put into the workflow with its `\s` eaten by the shell on the way in — and then, writing *this
card*, the shell ate the backslash in this very sentence a second time. The node therefore ran `/s+/g` and replaced **every letter s with a space**. The standalone check passed. The stored value read:

```
You exceeded your current quota, plea e check your plan and billing detail .
```

That is CLAUDE.md's own gotcha twice over — *bash eats ``, patch from a file*, and *test each entry through itself*. **A helper verified as a copy of itself was not verified.** So `verify-detail-budget.mjs` lifts `bounded` **out of the shipped workflow JSON and executes that**, and TC11 reintroduces the regression in memory to prove TC7 can go red. Twelve checks, two of them controls.

**Proven through the real path, not just the test.** Sweep #22's stored detail:

```
... generate_content_free_tier_requests, limit: 20, model: gemini-3.8-flash
Please retry in 43.103848987s.
```

The metric name, the limit and the model all survive — and that string is what settled the open
question it was filed over: the key is on the **free tier**, so billing on the account had not
reached the key's project. The record answered instead of the inference.

**It immediately paid for itself again**: with the metric legible, sweep #22's partial answer
was readable as a quota window resetting mid-sweep rather than as noise — which is how
**BUG-042** was found.

## Originally filed as

Found while diagnosing E7-S6; filing rather than folding in. Nothing in E7-S6 depends on it —
the sweep recorded `llm_no_credit` correctly and skipped honestly. Related: **BUG-039** (a
Gemini rate limit recorded as having no credit) is the *classification* half of the same blind
spot, and the two should probably be fixed together, since both are about not being able to
tell one 429 from another.
