# BUG-012: A model-failure park leaves no trace in the database

**Found while:** rebuilding the rig after the 2026-09-02 Docker reset — the first genuine,
unrehearsed provider outage this project has had
**Severity:** major — it defeats a guardrail this system claims in writing

## Repro

1. Ensure n8n has no working `openAiApi` credential.
2. Ingest any document and trigger WF2.
3. Look for the run in the database.

## Expected / Actual

The HTTP response is correct and honest:

```
park  T1  DOC-2026-0021  parked: llm_timeout  (kept 0)
```

The database is not. For that `trace_id`:

| | Expected | Actual |
|---|---|---|
| `source_documents` row | yes | **yes** |
| `events` — `ingested` | yes | **yes** |
| `llm_calls` row with a failed outcome | yes | **yes** |
| `prd_versions` row (parked draft) | yes | **none** |
| `events` — `parked` | yes | **none** |
| `dead_letters` row | yes | **none** |

## Root cause

There are two park paths and only one of them writes anything.

- **The assembly park** — `no_requirements_found`, `grounding_below_floor` — goes through
  `assemble.mjs`'s `park()`, which inserts a `prd_versions` row carrying the reason and logs
  a `parked` event. This works.
- **The model-failure park** does not reach `assemble.mjs` at all. WF2's `Extraction ok?`
  branch sends a failed extraction to a `Park: needs_review` Code node that tags the item
  and returns it. It writes nothing and calls nothing. WF4, the error handler that would own
  the dead-letter row, is scoped to E7 and does not exist yet.

So the reason code travels to whoever made the HTTP call, and to nobody else.

## Why it matters

`docs/contracts.md` §3 and `docs/architecture.md`'s degradation table both say a park
**keeps the work, names the reason, and is visible**. It is true of one path and false of
the other, and the false one is the path a real outage takes.

The concrete consequence: a PM ingesting through the **form door** gets n8n's completion
page and nothing else. The document appears in the inbox with no version, no reason and no
error, and there is no queue anywhere that knows it failed. The system's own answer to
"what happened to this document" — `query.mjs trace <id>` — returns a document, an ingest
event, and silence.

## FIXED — 2026-09-02. The smaller option, and the injection found a third defect

**`/internal/park`** — the park-only payload, which the card called the smaller of the two
options. WF2's model-failure branch now builds a call instead of tagging an item, and
`parkRun()` writes the version, the reason and the `parked` event through the same code the
assembly park uses. The dead-letter row and the needs-attention queue stay E7-S3's: **a park
is not a dead letter**; it is a run that stopped honestly and left its work behind.

| For the failed trace | Before | After |
|---|---|---|
| `source_documents` row | yes | yes |
| `events` — `ingested` | yes | yes |
| `llm_calls` row | yes | yes |
| `prd_versions` row (parked draft) | **none** | **409, draft, `degraded=1`, `park_reason=llm_unauthorized`** |
| `events` — `parked` | **none** | **`extractor \| llm_unauthorized — Credentials not found`** |
| `dead_letters` row | none | none — **E7-S3**, and named rather than quietly skipped |

The event names **the stage that failed**, not the assembler, so the record says where as
well as what.

### The third defect, which only the injection could find

The fix was tested by removing the credential from WF0 and running a document through the
real door. It came back `generate: error` and **still wrote nothing** — the new endpoint was
never called.

**A missing credential is raised by n8n *before* the HTTP node executes.** `onError:
continueRegularOutput` on that node never sees it, the error propagated out of WF0, and
WF2's `WF0: extract` had no error handling of its own — so the whole workflow died before
reaching any park branch. The original outage looked different (a *dangling* reference, which
the HTTP node did catch) and that difference is the entire reason this hole survived.

Fixed by giving `WF0: extract` `onError: continueRegularOutput` and teaching the park branch
to classify a raw node error, not just an envelope. **A guard on the inner node is not a
guard on the caller**, and this card's own lesson — two paths producing the same envelope are
not the same path — has a sibling: *a path that produces no envelope at all is a third path,
and nothing was watching it.*

### One more defect, this one in the test

TC8 of the test plan proved the reason code is not policed inside `parkRun` by calling it
with an invalid one. It passed, and left ten rows carrying a reason the contract does not
have — turning `verify-assembly` red on its next run. **BUG-021's disease, committed by a
check written to prevent its cousin.** Rows deleted, check rewritten to read the enforcement
rather than demonstrate its absence, and the rule written down: a verifier may not leave a
row another verifier will read as a defect.

Test plan: `BUG-011-BUG-012-degradation.tests.md`. `evals/README.md`'s coverage row moves to
**PARTIAL**, not green — the injection was performed by hand and E7-S4 still owes a case that
runs every time.

## Fix as first written (not applied)

Route the model-failure branch through a service call that records it, so that every park
has a row and a reason regardless of which stage produced it. Either extend
`/internal/assemble` to accept a park-only payload, or give WF4 its dead-letter endpoint and
send the branch there. The second is E7's design and is probably right; the first is smaller
and could land sooner if E7 slips.

Whichever is chosen, the property to assert is one sentence: **for every `trace_id` that
enters the door, the database can say what became of it.**

## Lesson

**Two paths that produce the same envelope are not the same path.** Both parks returned a
correctly-shaped `needs_review` envelope with a valid reason code, so every check that
looked at the response saw identical, correct behaviour. The difference was entirely in what
they persisted, and nothing looked there.

This is also the strongest argument yet for E7-S4, the fault-injection case that
`evals/README.md` has carried as **NONE — pending** since before any code existed. That row
named this exact hole. It took a real outage to fall into it, and the hole had been written
down, with an owner, the whole time.
