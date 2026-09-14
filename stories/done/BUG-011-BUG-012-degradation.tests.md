# Test cases: BUG-011 and BUG-012 — the degradation path tells the truth and leaves a trace

Written before the fix, per gate G3. **Two cards, one test plan**, because they are two
halves of one failure: the run that broke said the wrong thing about why, and then said it to
nobody. Fixing either alone leaves a hole with the same shape.

## What "verified" has to mean here, and why it is stricter than usual

`evals/README.md` has carried the row *"LLM failure degrades to a visible park — **NONE —
pending**"* since before any code existed. On 2026-09-02 a real outage fell into it. Reading
that outage split the claim in two: **"not a wrong answer" held** — no draft, no partial PRD,
nothing invented — and **"visible" was false**.

So an assertion built only out of that outage would be worth very little. **An outage nobody
asserted on is evidence, not a test.** Every row below either runs without n8n, or is a fault
that was deliberately injected and then removed.

## The three things being fixed

| | Before | After |
|---|---|---|
| BUG-011 | every provider failure but one → `llm_timeout` | five codes, each naming a different failure |
| BUG-012 | the model-failure park wrote nothing at all | a version row, a reason and a `parked` event |
| **found by the injection** | a credential error escapes WF0 and kills WF2 outright, writing nothing | the failure reaches the park branch and is recorded |

The third was not on either card. It is the one only a real injection could find, because it
does not happen inside WF0 at all: n8n raises a missing credential **before** the HTTP node
runs, so `onError: continueRegularOutput` on that node never sees it.

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **Every copy of the classifier is found by searching**, not from a list | ≥2, named | Pass | `WF0-llm-call / Parse or park`; `WF2-generate-prd / Park: needs_review` |
| TC2 | **Fourteen real failure shapes classify correctly** | each names what happened | Pass | credential missing, dangling reference, 401, 403, revoked key, 429, quota, ETIMEDOUT, abort, 408, context length, 500, unknown, nothing at all |
| TC3 | **Every workflow copy agrees with `llm-errors.mjs`** on all fourteen | 28 of 28 | Pass | a Code node cannot import, so the copies are real; the check is the only thing keeping them honest |
| TC4 | **The ordering is load-bearing** | a 401 whose message says "timeout" is an auth failure | Pass | and 10 of 14 cases used to be indistinguishable — **derived**, not a typed number |
| TC5 | **Every code is in the closed set and in the contract** | 5 of 5, both places | Pass | `docs/contracts.md` §1 amended, `assemble.mjs` REASONS extended |
| TC6 | **A model-failure park leaves a row, an event and a reason** | version + `parked` event naming the failing stage | Pass | draft, `degraded=1`, `park_reason=llm_unauthorized`, event component `extractor` |
| TC7 | **For every `trace_id` that enters the door, the database can say what became of it** | doc=1, versions≥1, parked=1 | Pass | the one-sentence property from BUG-012's card, asserted |
| TC8 | **The closed set is enforced where the record is written** | `/internal/park` refuses an unknown reason | Pass | see the defect this row caused, below |
| TC9 | **NEGATIVE CONTROL: the copies-agree check can fail** | drift turns it red and names it | Pass | WF0's fallback changed back to `llm_timeout` → **3 FAILs**, each naming the file and node; restored and green |
| TC10 | **NEGATIVE CONTROL, first attempt: a fault that did not fire** | — | **Recorded, not hidden** | changing `429` to `4290` changed nothing: the same branch also matches on the message text. **A control that passes because the fault was masked has tested nothing** |
| TC11 | **THE REAL INJECTION: credential removed, document run through the door** | parks, names the auth failure, leaves a record | Pass | `park T2 DOC-2026-0397 parked: llm_unauthorized`, version 409, event `llm_unauthorized — Credentials not found` |
| TC12 | **The rig is restored and the happy path still works** | 9 of 9 fixtures, C1 and C2 green | Pass | run 29: T1 86.7% / 100.0%, T3 100.0% / 77.8%, C2 PASS |
| TC13 | **Run everything twice** | identical | Pass | `verify-degradation` 63/63 twice; every other verifier re-run, 10 of 10 green |

**13 of 13 pass.**

## The defect this test plan caused, and it is the point of TC8

TC8's first version proved the reason code is *not* policed inside `parkRun` by calling it
with `llm_confused`. It passed — **and wrote ten version rows carrying a reason the contract
does not have.** The next run of `verify-assembly` went red on *"every park reason is in the
closed set"*, correctly, against a database this file had dirtied.

That is **BUG-021 exactly, committed by a check written the same afternoon as its cousin**:
an instrument leaving state behind that another instrument reads as a defect. The rule it
earns: **a verifier may not write a row that another verifier will read as a defect.** TC8
now reads the enforcement where it lives instead of demonstrating its absence, the ten rows
were deleted, and `verify-assembly` is 15/15 twice.

It also says something good about `verify-assembly`: the check found a violation nobody
predicted, in rows it did not create. It is scanning the whole database on purpose.

## Out of scope, named

- **The dead-letter row and the needs-attention queue stay E7-S3's.** A park is not a dead
  letter: it is a run that stopped honestly and left its work behind. Nothing here builds a
  queue.
- **The automated fault-injection case stays E7-S4's**, and `evals/README.md`'s row stays
  **PARTIAL** rather than going green. The injection here was performed by hand — which is
  exactly the distinction that row exists to keep.
- **No retry, no fallback vendor.** The degradation table's answer is still to park.
