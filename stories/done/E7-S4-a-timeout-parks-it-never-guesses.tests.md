# Test cases: E7-S4 — a timeout parks, it never guesses

One command, which runs the whole thing twice inside itself:

```
.\run.cmd review-ui/scripts/drill-provider-failures.mjs      22/22
.\run.cmd review-ui/scripts/verify-degradation.mjs           69/69
```

**The assertion is not "it parked".** It is *"it parked and there is nothing else"* — a
partial document is the failure the architecture forbids, and a park with a stray version or
a handful of requirements beside it would satisfy the first half while failing the point.

## Forced where it matters

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | A **forced WF0 timeout** parks `llm_timeout` | park | Pass | **failed twice first — BUG-029.** Two real 60-second timeouts, then the classifier |
| TC2 | The source document is intact | stored | Pass | |
| TC3 | **Exactly one version**, and it is the park row (`degraded=1`) | 1 | Pass | `1061:draft/llm_timeout` |
| TC4 | **And nothing else** — no requirements, no epics, no features | 0/0/0 | Pass | |
| TC5 | The park is addressable by version id **in the run manifest** | integer | Pass | via the real `produce.mjs` into its own `--manifest=`, so BUG-017's field is the one asserted |
| TC6 | The HTTP node really retried before giving up | ≥2 | Pass | 2 requests reached the stand-in, counted by the stand-in |
| TC7 | A **forced malformed response** parks `llm_malformed_json` | park | Pass | HTTP 200, OpenAI-shaped, `content` is prose |
| TC8 | Same guarantees on that path | all | Pass | one version, zero requirements, document intact |
| TC9 | Also addressable by version id | integer | Pass | |
| TC10 | **CONTROL:** the same stand-in answering *properly* parks for the right reason | `no_requirements_found` | Pass | without it, the drill proves only that a stand-in breaks things |
| TC11 | WF0 restored **byte-for-byte** | hash | Pass | restored in a `finally`, so a failed drill still puts it back |
| TC12 | **Run it twice, same answer** (BUG-021) | identical | Pass | `llm_timeout/llm_timeout`, `llm_malformed_json/llm_malformed_json` |
| TC13 | `evals/README.md`'s coverage row is closed and names how the failure was forced | closed | Pass | the PARTIAL row is gone, and the how is in the row |

## "At the provider boundary, not by editing the workflow into an unrealistic shape"

The card asks for this specifically, so here is exactly what changed and what did not.

**Changed:** one string — the URL the HTTP node dials, for the length of the drill.

**Unchanged:** `Build request`, the schema, the credential, `timeout: 60000`, `retryOnFail`,
`maxTries: 2`, `onError`, `Parse or park`, the classifier, `Log the call`, `Return envelope`,
and every branch in WF2 downstream. The stand-in is a local process with no credentials that
makes no outbound request and logs no header.

**A real client-side timeout, not an HTTP 408.** The stand-in accepts the connection and never
answers, so n8n's own 60-second limit is what fires — twice, because the node retries. That is
the difference that found BUG-029: every timeout case in `verify-degradation` before today
contained the word "timeout", and a real one does not.

## What this drill does NOT show, printed by the drill itself

**The malformed case never exercises the HTTP node's retry**, because HTTP 200 is not a
failure. The retry covers transport; `Parse or park` covers content. Two different guards, and
only the first one retries — so "after the one retry" in this card's acceptance criteria is
true of the timeout and not of the malformed response, and the tool says so rather than
letting the phrasing imply otherwise.

## BUG-029, found on the first execution

A real 60-second timeout was parked as **`llm_error`**. n8n discards axios's `ECONNABORTED`
and hands the Code node `{name:"NodeApiError", message:"The connection was aborted, perhaps
the server is offline"}` — no code, no status, and no "timeout" anywhere. **BUG-011 in mirror
image:** that one called everything a timeout; this one called the only real timeout something
else.

The fix was then wrong once, and `verify-degradation` caught it by name: there are **three**
copies of the classifier, not the two the module's own comment names.
