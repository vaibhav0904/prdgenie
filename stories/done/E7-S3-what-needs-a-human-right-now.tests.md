# Test cases: E7-S3 — what needs a human right now

Written before the queue existed (G3). The claim to earn:

> **A run that died is a queue entry, not a document that never arrived.**

The drill is the acceptance test, and on its first execution it found **three defects**, one
of which is BUG-028.

```
.\run.cmd n8n/scripts/check-error-routing.mjs               PASS
.\run.cmd n8n/scripts/check-failure-routing.mjs             PASS  (10 stop, 3 declared)
.\run.cmd review-ui/scripts/verify-dead-letters.mjs         15/15
.\run.cmd review-ui/scripts/drill-service-unreachable.mjs   4/4, run twice
.\run.cmd review-ui/scripts/negative-control-error-routing.mjs   6/6
```

## The dead letter itself

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **WF4 is the error workflow for WF0, WF1 and WF2** | all three | Pass | derived from the directory — a new workflow arrives unrouted and the check goes red |
| TC2 | The wiring is **checked from the exported JSON**, not the UI | script | Pass | and from the **running instance** too, via `docker exec … n8n export:workflow` when no API key is configured — a check whose strongest assertion is off by default is green for the wrong reason |
| TC3 | A dead letter carries `trace_id`, component, a reason code and detail | four fields | Pass | plus a `dead_lettered` event, so a dead run answers "what became of this trace_id" like every other outcome |
| TC4 | **Someone can act on the row alone** | readable | Pass | `PRDGenie WF2 - Generate PRD / Fetch document / The service refused the connection` |
| TC5 | Reason codes come from the **closed set** | 400 | Pass | `everything_broke` → 400 `schema_invalid`, 0 rows stored |
| TC6 | A dead letter with **no `trace_id` is still stored** | stored, flagged | Pass | and shown as `joinable: false` rather than as two blank fields |

## The queue

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC7 | Newest first | ordered | Pass | |
| TC8 | Resolved **with a note**, and the note is required | refused without one | Pass | `400 reason_required` **from the endpoint** — the field's `required` attribute is a courtesy (E4-S3's rule) |
| TC9 | Resolving keeps the reason and detail and **adds** a note and a timestamp | nothing erased | Pass | byte-compared before and after; a second resolve is `409` |
| TC10 | Zero markup sinks | no `innerHTML` | Pass | 0 of 4 — a dead letter's message is whatever n8n caught, which can contain source text |
| TC11 | A resolved entry leaves the default view, still retrievable | `?all=1` | Pass | |

## The drill

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC12 | **Kill the review service mid-run → a visible dead letter** | queue entry | Pass | **failed three times first** — see below |
| TC13 | The entry names `service_unreachable`, the node and the `trace_id` | actionable | Pass | `service_unreachable at Fetch document`, trace recovered from `doc_id` |
| TC14 | The source document survives | joined | Pass | |
| TC14b | **No PRD reached `in_review` during the outage** | none | Pass | a PRD assembled during an outage is the confident wrong answer the architecture forbids |
| TC15 | **Telemetry writes are continue-on-failure** | run unaffected | Pass | WF0's cost-logging call pointed at a dead port: the run still finished `in_review`, 2/2 grounded, and did **not** dead-letter |
| TC16 | **NEGATIVE CONTROL:** with WF4 unset, the same kill produces **no** entry | both directions | Pass | queue `6 → 6`; both workflows restored byte-for-byte |

## What the drill found, which is why it exists

It went **2/4 → 3/4 → 3/4 → 4/4**, and each step was a different defect. All three are on
BUG-028; none would have been found by reading the workflow.

1. **The run did not fail at all.** `onError: continueRegularOutput` on every service call
   turned "the service is not there" into an ordinary item — so WF2 recorded `status: success`
   during a total outage, and spent a model call extracting requirements from `undefined`.
2. **WF4 was wired correctly, `active: false`, and never ran.** n8n 2.x builds its dependency
   index from *published* workflows only. WF4's own sticky note said an error workflow does
   not need to be active, in writing, because that was true in 1.x.
3. **The dead letter had no `trace_id`** — exactly the row the card calls "a log line, not a
   queue entry". n8n 2.x does not give the error trigger `execution.data`, so two versions of
   the extraction walked a path into an object that was not there and returned `null`
   silently.

## Two rows worth reading twice

- **TC16 is what makes TC12 mean anything.** "A dead letter appeared" is not evidence until
  the same kill with the handler removed produces nothing.
- **TC15 and BUG-028 are the same distinction drawn in opposite directions**, on the same
  day. A product call that cannot be reached must stop the run; a telemetry call that cannot
  be reached must not. Both halves now have a control.

## Deliberately not here

- **No alerting.** Email and Slack are a delivery problem the pilot does not own
  (PRD-E8 non-goals). The queue is a page someone looks at.
- **E7-S4's forced timeout is a different drill** — that one fails at the provider boundary
  and parks; this one fails at the service boundary and dead-letters.
