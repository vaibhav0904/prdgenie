# E7-S4: A timeout parks, it never guesses

**As a** PM
**I want** a model failure to produce a visible park rather than a confident half-answer
**So that** the one thing I cannot detect by reading — a PRD assembled from a broken run — cannot happen

## Acceptance criteria

- [ ] A **forced WF0 timeout** produces `park_reason = llm_timeout`, the source document
      intact, and **no PRD version in `draft`** beyond the park row itself.
- [ ] A **forced malformed response** produces `park_reason = llm_malformed_json` after the
      one retry, with the same guarantees.
- [ ] Both parks are **addressable by version id** in the run manifest (BUG-017).
- [ ] `evals/README.md`'s **`NONE — pending`** coverage row is closed, and names how the
      failure was forced.
- [ ] The failure is forced **at the provider boundary**, not by editing the workflow into an
      unrealistic shape — the point is to exercise the real path.
- [ ] **Run it twice** (BUG-021).

## Depends on
- E7-S3

## Eval gate
- None. This is a fault-injection drill, dated in `docs/traceability.md`.

## Technical notes

- `docs/architecture.md` has promised since E1 that a timeout degrades to a visible park and
  never to a confident wrong answer. **It has never been made to happen.** A promise that has
  never been exercised is a hole with a name on it.
- BUG-011 and BUG-012 are both in this territory — an auth failure reported as a timeout, and
  a model-failure park that is invisible. Check whether this story closes either; if it does,
  say so on their cards rather than leaving them open by default.
- A partial document is the failure the architecture forbids. The assertion is not "it
  parked" but "**it parked and there is nothing else**".


---

## DONE — 2026-09-03. The promise is exercised, and it was not true

```
drill-provider-failures.mjs   22/22, two rounds, same answer both times
verify-degradation.mjs        69/69, 16 provider-failure cases through 3 copies
```

`docs/architecture.md` has promised since E1 that a model failure degrades to a visible park
and never to a confident half-answer. BUG-011 and BUG-012 were both found in this territory by
a **real outage**, which is the honest sign that the promise had never been exercised on
purpose. It has been now, and it found a third defect.

### What was forced, and what was not touched

**Changed:** one string — the URL WF0's HTTP node dials, for the length of the drill.
**Unchanged:** the schema, the credential, `timeout: 60000`, `retryOnFail`, `maxTries: 2`,
`onError`, `Parse or park`, the classifier, the cost log, the envelope, and every branch in
WF2 downstream. `fake-provider.mjs` is a local process with no credentials that makes no
outbound request and never logs a header — the real Authorization header arrives during a
drill and must leave no trace.

A **real client-side timeout**, not an HTTP 408: the stand-in accepts the connection and never
answers, so n8n's own 60-second limit is what fires, twice.

### BUG-029, found on the first execution

The timeout parked as **`llm_error`**. n8n discards axios's `ECONNABORTED` and hands the Code
node `{name:"NodeApiError", message:"The connection was aborted, perhaps the server is
offline"}` — no code, no status, and the word "timeout" nowhere. Every pattern in that branch
was looking for something n8n had thrown away.

**This is BUG-011 in mirror image.** That one called every provider failure a timeout,
including a missing credential. This one called the only real timeout something else. Both
happened for one reason: **the classifier was written against the error shape we assumed, and
never against one a real failure produced.**

The fix was then incomplete, and the check said so by name — there are **three** copies of the
classifier, not the two the module's own header comment names. The third is WF2's
"Park: needs_review". A check written for BUG-011's drift caught the fix for BUG-011's mirror.

### The two cases that were added are in n8n's own words

| case | expected |
|---|---|
| `The connection was aborted, perhaps the server is offline` | `llm_timeout` |
| `The service refused the connection - perhaps it is offline` | **`llm_error`** |

Both were copied out of real park rows produced by the two drills of the same day — E7-S4's
against the provider, E7-S3's against the review service. The second one is what stops the fix
becoming a catch-all: **the far end refusing is not us giving up.**

### The control is what makes the drill mean anything

The same stand-in, answering *properly*, parks `no_requirements_found` — the right reason for
a document with no requirements in it, not a model-failure reason. Without that row the drill
would show only that pointing a workflow at a stand-in breaks it.

### Stated by the tool, not buried here

**The malformed case never exercises the HTTP node's retry**, because HTTP 200 is not a
failure. The retry covers transport; `Parse or park` covers content. Two different guards, and
only the first retries — so this card's "after the one retry" is true of the timeout and not
of the malformed response. The drill prints that line every run.

### Coverage row closed

`evals/README.md`'s **PARTIAL** row for *"LLM failure degrades to a visible park"* is now
closed and names how the failure was forced. Two stale entries went with it: the doc-type row
still said "pending until E5" a day after E5 shipped, and **C5 was listed as though it existed
when it has never been built** — now marked NOT BUILT, because listing a case that does not
exist is how a matrix stops being an audit.
