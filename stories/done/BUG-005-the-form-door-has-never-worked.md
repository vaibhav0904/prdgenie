# BUG-005: The form door has never worked, and nothing noticed

**Found while:** E2-S1, first attempt at the door-parity check (TC2)
**Severity:** major — it is the door a human uses, and the one the demo video opens with

## Repro

1. `GET http://localhost:5678/form/prdgenie-ingest-form`

## Expected / Actual

- **Expected:** the ingest form renders; submitting it stores a canonical SourceDocument
  identical to the one the webhook door stores.
- **Actual:** HTTP 500. n8n never starts the workflow at all:

```
The "Respond to Webhook" node is not supported in workflows initiated by the "n8n Form Trigger"
  at validateResponseModeConfiguration (n8n-nodes-base/nodes/Form/utils/utils.ts:391)
Error in handling webhook request GET /form/prdgenie-ingest-form: Workflow could not be started!
```

## Root cause

WF1 has two doors converging on one spine, and the spine ends in a `Respond to Webhook`
node so the JSON door can return the envelope. n8n validates the *whole workflow* when a
Form Trigger fires: the presence of a `Respond to Webhook` node **anywhere** in a
form-initiated workflow is refused, whether or not the form's path reaches it. So the node
that makes the webhook door work is the node that breaks the form door.

## Why it was never caught

E1-S2 built both doors and verified ingestion through `/internal/ingest` and the webhook.
The form was verified by *reading the workflow*, not by submitting it — and its UAT
(BUG-002's sibling failure) never asked anyone to open the form either. Both doors were
"tested" and only one had ever run.

This is the same shape as BUG-001 and BUG-003 one more time: **the check that existed could
not have failed**, because it never exercised the subject. The difference is that this one
was invisible from inside the repo — the workflow JSON is correct in every way except that
n8n will not run it.

## Fix (applied in E2-S1)

Drop the `Respond to Webhook` node and set the webhook door's `responseMode` to
`lastNode`. The webhook door then answers with the last node's JSON — which is the same
envelope it answered with before — and the form door gets n8n's own completion page, which
is the right response for a human anyway. One node fewer, two working doors.

Verified by TC2: the same fixture submitted through the form and posted to the webhook
stores byte-identical canonical documents, differing only in `doc_id`, `trace_id`,
`created_at` and `source_channel`.

## Lesson

**A door that has never been opened is not a door.** Every entry point this system claims
gets exercised by an automated check that goes through the entry point itself, not through
the code behind it. The webhook door had that from the start because the harness needed it;
the form door had a person's intention to click it, which is not a check.

Recorded as a Gotcha: n8n's Form Trigger and Respond to Webhook cannot coexist in one
workflow, regardless of whether the form's branch reaches the node.
