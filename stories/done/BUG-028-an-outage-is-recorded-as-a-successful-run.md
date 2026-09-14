# BUG-028: An outage is recorded as a successful run — and billed for

**Severity:** blocker · **Filed:** 2026-09-03 (E7-S3's drill, on its first execution)
**Found by:** `.\run.cmd review-ui/scripts/drill-service-unreachable.mjs`

## What happens

Kill the review service, trigger WF2 for a document that was already ingested, and n8n
records:

```
{"id":3276,"workflowId":"prdgenieWF2generate","status":"success", ...}
{"id":3277,"workflowId":"prdgenieWF0llmcall","status":"success", ...}
```

**`status: success`.** No dead letter, no park, no version, no event. The document sits in
the inbox and the run that was supposed to turn it into a PRD reports that it worked.

And execution 3277 is a **model call**: `Fetch document` failed, returned an error item,
`Build extraction call` read `raw_text` off it as `undefined`, and WF0 was called and billed
to extract requirements from nothing.

## Why the error handler did not catch it

**WF4 is wired correctly and never ran, because there was no error to catch.** Every HTTP
node in the spine carries `onError: continueRegularOutput`, so a connection refusal is
converted into an ordinary item and the workflow proceeds. `neverError: true` was meant to
handle the service's own 400 envelopes — which are answers, not failures — and
`continueRegularOutput` was added beside it without the distinction being made:

| | what it covers | should it continue? |
|---|---|---|
| `neverError: true` | the service answered with a non-2xx **envelope** | **yes** — that is a component's decision, and WF2 branches on it |
| `onError: continueRegularOutput` | the service did not answer **at all** | **no** — there is nothing to branch on |

So the guard that exists to keep a *refusal* from being an *error* also keeps an *outage*
from being one.

## Why this is a blocker

1. It defeats E7-S3's own acceptance criterion — *"killing the review service mid-run
   produces a visible dead letter"* — which is why it was found.
2. It is the **most likely failure this system has**. `assumptions.md` already names the
   two-process local setup as "the most likely way a stranger's first run fails", and this is
   what that failure looks like from the outside: nothing.
3. It **spends money on it**. A run with no document reaches the provider.
4. **`docs/architecture.md` has promised since E1** that a failure degrades to something
   visible. For this failure it degrades to a green tick.

## The shape, for the record

This is the BUG-001 / BUG-012 / BUG-017 family again, and it is the fourth time:
**a control that makes a failure indistinguishable from a success.** BUG-012 was a park path
that returned a correct-looking envelope and persisted nothing. This is the same trade one
layer out — leniency added for a good reason, applied one case too wide.

## Fix — the rule, not the instance

A **product call** that does not answer must stop the workflow, so the error workflow can
see it. A **telemetry call** that does not answer must not (`docs/traceability.md`, and
E7-S3's own TC15). That distinction has to be written down per node and checked, or the next
node added will inherit whichever setting was copied.

Not "set `onError` on the five nodes". A committed list, a stated reason per exemption, and
a check that fails on an undeclared one — the `spine-ok` pattern from E5-S4.

## Verified by
- `drill-service-unreachable.mjs` TC12/TC13 going from FAIL to PASS
- a check that the exemptions are declared and reasoned
- the drill re-run twice (BUG-021)

---

## CLOSED — 2026-09-03. Three defects, not one, and the drill found all three

The drill went 2/4 → 3/4 → 3/4 → **4/4**, and each step exposed a different thing. None of
them would have been found by reading the workflow.

### 1. The run did not fail (the bug as filed)

`onError: continueRegularOutput` on every service call turned "the service is not there" into
an ordinary item. **Fixed by a rule, not by five edits:**
`.\run.cmd n8n/scripts/check-failure-routing.mjs` declares which calls may swallow their own
failure and why, prints all three reasons on every run, and fails on an undeclared one.

| | may continue | why |
|---|---|---|
| **product** call — 10 of them | **no** | the run needs the answer; no answer means WF4 must see it |
| provider call | yes | the failure is the data — "Parse or park" maps it to a reason code (BUG-011) |
| telemetry call | yes | the product may not fail because logging did (`docs/traceability.md`) |
| the handler itself | yes | an error workflow that throws has nowhere to go |

Every product call also gained `retryOnFail` (3 tries, 1s), because a call that now stops the
run should try more than once before it does.

### 2. WF4 was wired correctly, active=false, and never ran

WF2 failed. The routing was right. **Nothing happened.** n8n 2.x builds its dependency index
from **published** workflows only, so an inactive error workflow is silently never invoked —
and WF4's own sticky note claimed the opposite, in writing, because that was true in 1.x.

The file now says `active: true`, and the note says what it cost to learn.

### 3. The dead letter had no `trace_id` — and the reason it did not is a lesson

The first two green runs produced a queue entry with `trace=(none)`, which is precisely the
row the card calls *"a log line, not a queue entry"*.

**n8n 2.x does not give the error trigger `execution.data`.** It gets
`{execution:{id,url,error,lastNodeExecuted,mode}, workflow:{id,name}}` and nothing else, so
there is no runData to walk and no failing item to read. Two versions of this code walked a
path into an object that was not there and returned `null` without complaining.

What *is* there is the **request that failed**. Every service call on this spine names the
document in its path or its JSON body, so the run's identity survives inside the attempt. WF4
now searches the serialised error for exactly two ids, and `/internal/dead-letter` fills in a
missing `trace_id` from the `doc_id` using its own table — filled in, never overridden, since
a document can be ingested more than once.

### Proof

```
drill-service-unreachable.mjs          4/4, twice
negative-control-error-routing.mjs     6/6  — TC16: WF4 unset -> queue 6 -> 6, nothing
                                              TC15: telemetry dead -> run still in_review
check-failure-routing.mjs              PASS, 10 stop / 3 declared
verify-dead-letters.mjs                15/15
produce + grade                        10/10 fixtures, C1 C2 C3 C4 C6 all PASS
14 verifiers                           all green
```

**TC16 is the one that makes the rest mean anything:** with WF4 unset the same kill produces
*no* queue entry at all, so the row the drill sees is WF4's and not something else's.

### The family, for the record

BUG-001, BUG-012, BUG-017, and now this: **a control that makes a failure indistinguishable
from a success.** BUG-012 was a park path that returned a correct-looking envelope and
persisted nothing. This is the same trade one layer out — leniency added for a good reason
(*a 400 envelope is an answer, not an error*) applied one case too wide (*so is no answer at
all*). The distinction is now a command.
