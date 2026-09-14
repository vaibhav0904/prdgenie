# BUG-029: A real timeout is not called a timeout

**Severity:** major · **Filed:** 2026-09-03 (E7-S4's drill, first execution, both rounds)
**Found by:** `.\run.cmd review-ui/scripts/drill-provider-failures.mjs`

## What happens

A provider that accepts the connection and never answers. n8n's HTTP node gives up after its
own `timeout: 60000`, twice. The run parks — correctly, with the document intact, one version
row and nothing else — and names the wrong reason:

```
extractor | llm_error — The connection was aborted, perhaps the server is offline
```

**`llm_error`, not `llm_timeout`.** Reproduced in both rounds of the drill.

## Why

`classifyProviderError` matches `/timeout|timed out|etimedout|esockettimedout|econnaborted/`
over `code + message`. Axios does set `ECONNABORTED` on a client-side timeout — and **n8n
discards it.** What reaches `Parse or park` is:

```json
{"name": "NodeApiError", "message": "The connection was aborted, perhaps the server is offline"}
```

No `code`, no `status`, and the word "timeout" appears nowhere in n8n's own prose. Every
pattern in that branch is looking for something n8n threw away.

## This is BUG-011 in mirror image

BUG-011 was *"every provider failure is called `llm_timeout`"* — including a missing
credential, which sent the reader to look at latency and network. The fix classified them.

**This is the same defect from the other side: the one failure that really is a timeout is
the one now called something else.** `llm_error` exists "so that the unrecognised case has
somewhere honest to go" (`docs/contracts.md`) — and the most recognisable failure of all
landed in it.

The reason both directions happened is the same: **the classifier was written against the
error shape we assumed, and never against one a real failure produced.** BUG-011 was found by
a real outage; this was found by the first drill that forced the failure on purpose. Neither
was found by reading the code.

## The discriminator, and it is real

n8n's two connection messages are different, which is what makes this fixable rather than a
guess:

| what happened | n8n's message |
|---|---|
| the client gave up waiting (**timeout**) | `The connection was aborted, perhaps the server is offline` |
| the far end refused (**not** a timeout) | `The service refused the connection - perhaps it is offline` |

The second was observed in E7-S3's drill, on the same day, against the review service. A
refused connection stays `llm_error`; an aborted one is a timeout, because **the abort is
ours** — it is the node's own 60-second limit firing.

## Fix
- The pattern in **both copies** of the classifier — `review-ui/llm-errors.mjs` and WF0's
  "Parse or park" — since `verify-degradation.mjs` fails when they disagree.
- A case in `verify-degradation.mjs` carrying **n8n's real wording**, not an invented one.
  The existing timeout cases all contain the word "timeout"; that is why they passed while
  the real thing failed.

## Verified by
- `drill-provider-failures.mjs` TC1 going from FAIL to PASS in both rounds
- `verify-degradation.mjs` with the real message as a case, both copies agreeing

---

## CLOSED — 2026-09-03. And the fix was incomplete until a check said so

`classifyProviderError` now also matches n8n's own prose for a client-side abort:

```js
if (status === 408
    || /timeout|timed out|etimedout|esockettimedout|econnaborted/.test(text)
    || /connection was aborted/.test(text)) {
```

**Two cases were added, in n8n's own words rather than invented ones** — and the second is
the one that stops this becoming a catch-all:

| case | expected |
|---|---|
| `The connection was aborted, perhaps the server is offline` | `llm_timeout` |
| `The service refused the connection - perhaps it is offline` | **`llm_error`** |

The far end refusing is not us giving up. Both messages were copied out of real park rows
produced by the two drills on the same day — E7-S4's against the provider, E7-S3's against
the review service.

### The fix was wrong once, and `verify-degradation` caught it

There are **three** copies of this classifier, not two: `llm-errors.mjs`, WF0's
"Parse or park", and **WF2's "Park: needs_review"**. The module's own header comment names
only WF0. Patching two of three left the third disagreeing, and the check said so by name:

```
FAIL  TC3  WF2-generate-prd / Park: needs_review agrees (llm_error) <-- THE FILE AND THE WORKFLOW DISAGREE
```

That check exists because BUG-011 shipped a copy that drifted. It has now earned its keep by
catching the fix for BUG-011's mirror image.

### Proof

```
verify-degradation.mjs           69/69, 16 provider-failure cases through 3 copies
drill-provider-failures.mjs      22/22, both rounds, timeout: llm_timeout / llm_timeout
```
