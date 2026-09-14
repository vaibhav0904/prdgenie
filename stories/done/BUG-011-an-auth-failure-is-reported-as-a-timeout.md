# BUG-011: A provider auth failure is reported as `llm_timeout`

**Found while:** rebuilding the rig after the 2026-09-02 Docker reset, running one fixture
before the OpenAI credential had been re-entered
**Severity:** minor — the degradation itself is correct; only the reason code lies

## Repro

With no `openAiApi` credential in n8n (or a dangling credential reference), run any
document through WF2.

## Expected / Actual

- **Expected:** the run parks with a reason describing what happened — the provider call
  could not be authenticated.
- **Actual:**

```
park  T1  DOC-2026-0021  parked: llm_timeout  (kept 0)
```

## Root cause

WF0's "Parse or park" node maps every provider error to one of two codes:

```js
reason: r.error?.code === 'context_length_exceeded' ? 'llm_malformed_json' : 'llm_timeout'
```

Anything that is not a context-length error becomes `llm_timeout`. An HTTP 401, a missing
credential, a revoked key, a rate limit and an actual timeout are all indistinguishable in
the record.

## Why it matters more than "it still parked"

The park is genuinely correct and that is the important half — see below. But the reason
code is what an operator reads first, and `llm_timeout` sends them to look at latency,
network and n8n's timeout setting. None of those is the problem, and the real cause takes
one minute to find and zero minutes to fix once named.

`docs/contracts.md` §1 keeps a **closed** set of reason codes precisely so that a reason is
diagnostic rather than decorative. This one currently is not.

## FIXED — 2026-09-02, and the fix was not "add two codes"

`docs/contracts.md` §1 gained **three**: `llm_unauthorized`, `llm_rate_limited` and
`llm_error`. The third is the important one. Two new codes would have left the default
intact, and **the default was the defect**: anything unrecognised was called `llm_timeout`,
which is not a vaguer answer than the truth but a different, confident, wrong one.
`llm_error` says "the provider failed and this system does not know how", which is a true
sentence about an unknown failure.

Classification lives in `review-ui/llm-errors.mjs`, with a copy in each Code node that needs
it because a Code node cannot import. `verify-degradation.mjs` **finds every copy by
searching the workflows** and runs all of them over the same fourteen failure shapes: 63
checks, and a disagreement between the file and the workflow is a failure.

| Failure | Was | Is |
|---|---|---|
| n8n has no credential for the node | `llm_timeout` | **`llm_unauthorized`** |
| a dangling credential reference | `llm_timeout` | **`llm_unauthorized`** |
| HTTP 401 / 403 / revoked key | `llm_timeout` | **`llm_unauthorized`** |
| HTTP 429, quota exhausted | `llm_timeout` | **`llm_rate_limited`** |
| HTTP 500, unknown, empty response | `llm_timeout` | **`llm_error`** |
| a real timeout, an abort, HTTP 408 | `llm_timeout` | `llm_timeout` |
| a document too long | `llm_malformed_json` | `llm_malformed_json` |

**Ten of the fourteen shapes were previously indistinguishable**, and that count is derived
in the check rather than typed, so adding a case cannot leave it stale.

**Demonstrated against the real failure, not only the table.** The credential was removed
from WF0 and T2 was run through the door:

```
park  T2  DOC-2026-0397  parked: llm_unauthorized  (kept 0)
events:  parked | extractor | llm_unauthorized — Credentials not found
```

The provider's own message is kept beside the code, so the reason is diagnostic rather than
a category. Test plan: `BUG-011-BUG-012-degradation.tests.md`.

## Fix as first written (not applied — needs a contract change)

Add `llm_unauthorized` and `llm_rate_limited` to the closed set in `docs/contracts.md`, and
map them in WF0 from the provider's HTTP status (401/403 and 429). Adding a code means
editing the contract first, which is the intended friction — so it is filed rather than
patched in passing.

Scoped to **E7**, which owns the degradation table and the fault-injection case.

## What this accidentally tested — half good news, half BUG-012

`evals/README.md`'s coverage matrix carries a row reading:

> LLM failure degrades to a visible park, not a wrong answer — **NONE — pending → E7-S4**

Today, unplanned, the real thing happened. Checking what it actually left behind split the
claim in two:

- **"not a wrong answer" holds.** Zero requirements kept, **no draft version created**, no
  partial PRD, no crash. The failure did not become a confident wrong answer, which is the
  half that matters most.
- **"a visible park" does not.** Nothing was written to the database at all — no
  `prd_versions` row, no `parked` event, no dead letter. Filed separately as **BUG-012**.

That row **stays pending**, and this is why: an outage nobody asserted on is evidence, not a
test. Had E7-S4 existed, it would have caught BUG-012 months before a real failure did.
