# BUG-039: a Gemini rate limit is recorded as having no credit

**Severity:** minor · **Filed:** 2026-09-03, during E7-S5, by a real sweep
**Predicted before it happened, and then it happened** — the prediction is in this card
rather than in a comment somebody could have written afterwards.

## What happens

A judge sweep against the free tier hits the per-minute quota. Gemini replies:

```
You exceeded your current quota, please check your plan and billing details.
For more information on this error, head to: .../docs/rate-limits
* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests
```

The shared classifier records **`llm_no_credit`** — 17 of 22 calls in sweep #8.

It is not wrong about the words: BUG-036 put the balance clause *before* the rate-limit
clause deliberately, because an exhausted OpenAI balance arrives as a 429 saying **"You
exceeded your current quota, please check your plan and billing details"** — the same
sentence, near enough word for word. Google uses Google's standard phrasing, and the two
providers' messages collide.

## Why it matters, and how much

`llm_no_credit` means *this will never pass on its own; go and add credits*.
`llm_rate_limited` means *wait; it will pass*. The row sends its reader to the billing page
for a condition that clears in sixty seconds.

**It changes nothing about what the product did.** The sweep recorded a partial result with a
reason and closed; no run parked, no PRD was affected, and the judge gates nothing. The cost
is entirely in the diagnosis a person reads.

## The candidate fix, and why it is not made here

The distinguishing string is in Google's own message and nowhere in OpenAI's: the metric name
(`generate_content_free_tier_requests`), or the `rate-limits` documentation link. A clause
matching *that* — before the balance clause, and narrow enough that it cannot match an OpenAI
body — would separate them.

It is not done in E7-S5 because the classifier exists in **three byte-identical copies**
(`review-ui/llm-errors.mjs` and two n8n Code nodes) with `verify-degradation.mjs` asserting
they agree, and BUG-036's own lesson is that the closed set is enforced in **two processes
that deploy separately**. That is a change with its own deployment order and its own drill,
and folding it into a story about the judge would put it in a commit nobody would think to
look in.

## What E7-S5 does instead

Records the real message. The sweep now stores `skipped_detail` — the provider's own words,
bounded — beside the code, so a reader who is sent to the billing page can see in the same
row that Google was talking about requests per minute. **A code with no evidence beside it is
a notification, not a record** (E7-S3).

## Verified by
- sweep #8: `llm_no_credit (17 of 22 calls)` with the quota message stored beside it
- the same sweep completed with 5 real scores, so the misclassification is provably about the
  label and not about the outcome
