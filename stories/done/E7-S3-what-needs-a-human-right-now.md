# E7-S3: What needs a human right now

**As an** operator
**I want** every unrecoverable failure to land in one visible queue with a reason I can act on
**So that** a run that died is a queue entry rather than a document that never arrived

## Acceptance criteria

- [ ] **WF4** is the error workflow for WF0, WF1 and WF2; every node's error output reaches it.
- [ ] A dead letter carries **`trace_id`, component, reason code and enough detail to
      diagnose without reading logs** — the test is that someone can act on the row alone.
- [ ] The **Needs-attention queue** in the review UI shows them, newest first, and an entry
      can be marked resolved with a note.
- [ ] Killing the review service mid-run produces a visible dead letter **within one
      refresh**.
- [ ] **Telemetry writes are continue-on-failure** (`docs/traceability.md`): stopping the
      logging path mid-run must not stop the run. Drilled here, proven again by E8-S4.
- [ ] Reason codes come from the **closed set** in `docs/contracts.md`. A new one means
      editing the contract, which is the intended friction.

## Depends on
- E1-S5

## Eval gate
- None. Verified by drill: kill the service, watch the queue.

## Technical notes

- **A dead letter with a stack trace and no `trace_id` is a log line, not a queue entry.**
  The whole value is joining it back to the document and the run.
- The queue is the operator surface for E8's metrics too — dead-letter totals are one of the
  three uncomfortable numbers E8 must render rather than drop.
- No alerting. Email or Slack is a delivery problem the pilot does not own (PRD-E8 non-goals).

---

## DONE — 2026-09-03. The drill found three defects on its first execution

```
check-error-routing.mjs              PASS   3 routed, checked in the files AND in the running n8n
check-failure-routing.mjs            PASS   10 calls stop the run, 3 declared with reasons
verify-dead-letters.mjs              15/15
drill-service-unreachable.mjs        4/4    run twice (BUG-021)
negative-control-error-routing.mjs   6/6
```

WF4 exists, every workflow routes to it, and `/api/dead-letters` + `attention.html` are the
operator surface. `service_unreachable` and `workflow_error` were added to the contract's
closed set, with the reason written into `docs/contracts.md` rather than assumed.

### The drill is the story

It went **2/4 → 3/4 → 3/4 → 4/4**. Each step was a different defect, and **not one of them
was visible in the workflow.**

**1. The run did not fail.** Every service call carried `onError: continueRegularOutput`, so
"the service is not there" became an ordinary item and WF2 recorded `status: success` during a
total outage — then spent a model call extracting requirements from `undefined`. Filed as
**BUG-028** at once and fixed as a rule: `check-failure-routing.mjs` declares which calls may
swallow their own failure and why, and fails on an undeclared one.

The distinction that had been missed is one line: **`neverError: true` covers a service that
answered badly — which is a component's decision and WF2 branches on it. `onError` covered a
service that did not answer at all — which is nothing to branch on.** The same setting was
doing both jobs.

**2. WF4 was wired correctly, `active: false`, and never ran.** n8n 2.x builds its dependency
index from *published* workflows only, so an inactive error workflow is silently never
invoked. WF4's own sticky note asserted the opposite — *"this workflow is NOT active and does
not need to be"* — which was true in 1.x and is now corrected in the file, with what it cost.

**3. The dead letter had no `trace_id`**, which is exactly the row this card calls *"a log
line, not a queue entry"*. n8n 2.x does not hand the error trigger `execution.data`: it gets
`{execution:{id,url,error,lastNodeExecuted,mode}, workflow:{id,name}}` and nothing more. Two
versions of the extraction walked a path into an object that was not there and returned
`null` without complaining.

What *is* there is the **request that failed**, and every service call on this spine names the
document in its path or its body. WF4 now searches the serialised error for two ids, and
`/internal/dead-letter` fills in a missing `trace_id` from the `doc_id` out of its own table —
**filled in, never overridden**, because a document can be ingested more than once and the id
WF4 found is the run that actually died.

### The control is what makes the drill mean anything

With `settings.errorWorkflow` removed from WF2, the same kill produces **no queue entry at
all** — `6 → 6`. Without that, "a dead letter appeared" is not evidence that WF4 wrote it.

And the mirror control, on the same day and in the opposite direction: WF0's cost-logging call
pointed at a dead port, and the run **still finished** `in_review`, 2/2 grounded, with nothing
in the queue. **A product call that cannot be reached must stop the run; a telemetry call that
cannot be reached must not.** BUG-028 was that distinction drawn wrongly one way; TC15 is the
proof it is now drawn correctly the other.

### Details that are decisions

- **A dead letter with no `trace_id` is stored and flagged `joinable: false`**, never dropped.
  Losing the failure to keep a column tidy would be exactly backwards.
- **Resolving adds to the record.** The reason and the detail are byte-identical afterwards;
  the row gains a note and a timestamp, the note is required, and a second resolve is `409`.
- **The note is required by the endpoint**, not by the input's `required` attribute — E4-S3's
  rule, applied to a second surface.
- **Zero markup sinks on the queue page.** A dead letter's message is whatever n8n caught,
  which can contain a fragment of an attacker-controlled document.

### Not done here, and named

**No alerting.** Email or Slack is a delivery problem the pilot does not own (PRD-E8
non-goals). The queue is a page someone looks at, and `attention.html` is that page.
