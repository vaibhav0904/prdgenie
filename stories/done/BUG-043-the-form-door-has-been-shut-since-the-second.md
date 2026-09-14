# BUG-043: The form door has been shut since the 2nd, and answered 200 the whole time

**Severity:** major — one of two doors, and E1's exit criterion runs through it
**Found:** 2026-09-04 by `check-all.mjs` on its first run, via `verify-doors.mjs` TC2
**Area:** WF1 `Door: Form` → `Map form input`

## What happens

```
POST /form/prdgenie-ingest-form  (multipart)  -> HTTP 200 {"status":200}
SELECT max(created_at) FROM source_documents WHERE source_channel='form'
  -> 2026-09-02 11:04:18
```

**The door answers 200 and stores nothing.** Six form documents exist, none since 2 September.
Every document in the last two days came through the webhook.

The dead-letter queue has been recording it correctly the whole time — WF4 did its job:

```
#20  PRDGenie WF1 - Ingest · node "Map form input" · Cannot read properties of undefined
```

## Two separate faults, and they must not be confused

1. **The mapping node throws** on a real multipart release. That is the one that matters:
   the door accepts, the workflow starts, `Map form input` fails, and the caller still gets
   200 because the form trigger has already replied. **A door that answers before it has
   stored anything cannot report its own failure** — which is the BUG-005/006 family arriving
   through the one door that responds early by design.
2. **The trigger accepts only `multipart/form-data`.** `application/x-www-form-urlencoded` and
   `application/json` both return HTTP 500 `Workflow could not be started!`, recorded as dead
   letters #21 and #22 (*"Expected multipart/form-data"*). `verify-doors.mjs` already posts a
   `FormData`, so this is not what breaks the check — but anyone probing the door by hand will
   hit it first and misdiagnose fault 1 as fault 2.

## Why nobody noticed for two days

`verify-doors.mjs` has been red since at least 2 September and **no story ran it**, because no
story after E5 owned it. That is BUG-038 exactly, and this card is the first thing
`check-all.mjs` found on its first run.

## Repro

```
curl -s -X POST http://localhost:5678/form/prdgenie-ingest-form \
  -F "Product=ForgeSight" -F "Document type=transcript" \
  -F "Who wrote this?=Someone else wrote it" -F "Text=probe"
# -> {"status":200}, no new row in source_documents, new dead letter naming Map form input
```

## What to investigate first, in order

1. **What `Map form input` actually receives.** The node reads `item.json['Product']` and
   friends, all with `??` guards, so "cannot read properties of undefined" means `item.json`
   itself is undefined — not a missing field. Suspect the `formTrigger` **typeVersion 2.2**
   output shape: a multipart release may arrive as a binary-bearing item whose `json` is
   empty. Log the shape before changing the mapping.
2. **Then the truncated message.** `"Cannot read properties of undefined"` has had the property
   name cut off — the same defect as BUG-041, in the dead-letter envelope this time. Fixing
   that first would probably have made step 1 unnecessary, which is the argument for doing it.
3. Only then decide whether the form node needs an explicit `path` (it has none; the URL is
   its `webhookId`, which works but is not what anybody would guess).

## Not fixed here

Found during BUG-038's repair. Filing rather than folding in — and it is **major**, so it
jumps the queue ahead of E6-S2, which has been returned to the backlog with its test plan.

## Fixed, 2026-09-04 — and the door was never broken

**`verify-doors.mjs` 8/8, twice. The form door stores documents again** (`DOC-2026-1337`, the
first since 2 September), and both doors produce the identical canonical document.

**The door was refusing correctly the whole time.** n8n binds a form release by **index** —
`field-0`, `field-1` — never by the label a human sees. The checker posted four indexed fields,
written when the form had four. **E4-S6 inserted "Who wrote this?" as the third field**, and
everything below it moved by one: the document text went into the authorship dropdown, and the
required `Text` field received an empty string. `Map form input` produced an envelope with no
`doc_type` and no `raw_text`, `Envelope ok?` refused it exactly as designed, and the form
trigger had already answered `200`.

n8n's own execution record settled it in one line: **every field arrived `null`** — keys
present, values empty, only `submittedAt` and `formMode` populated.

### The fix is that the contract is now re-read, not remembered

`verify-doors.mjs` reads `formFields.values` out of the shipped `WF1-ingest.json`, looks each
label up, and posts to the index the form actually assigns. **A positional binding is a contract
nobody can see.** Insert a field and the check follows it; rename one and the check stops before
submitting and says which label went missing, instead of posting into whatever now sits at that
number. **TC2c is the control**: it inserts a field in memory and asserts the derived index
moves — the exact move that went unnoticed in E4-S6.

### Two things on this card's own plan turned out to be wrong, and are corrected rather than dropped

- **The truncated message was not ours.** The card said `"Cannot read properties of undefined"`
  had been cut like BUG-041 and that fixing it first might have saved the investigation. The
  stored message is **35 characters against a 300-character cap** — n8n delivers it that way,
  without the `(reading '…')` clause a raw `TypeError` carries. Nothing to fix.
- **The explicit `path` is declined.** It would give a prettier `/form/ingest` and would change
  a working URL that the checker, `.env.example` and the video all reference. Churn against
  something that already works and already names itself.

### What is still true and is nobody's bug

**A form trigger replies before the workflow has stored anything.** WF1 refused, WF4 recorded,
the queue showed it — and the submitter still got `200`. That is inherent to the node and it is
*why* this hid for two days behind a success. It is now the sharpest example this project has of
its own rule: **a door that answers before it has stored anything cannot report its own
failure.**

### Two days, and the lesson that actually costs

E4-S6 shipped green on the verifiers it wrote and never ran `verify-doors`, which it had just
broken. That is **BUG-038's finding, demonstrated a second time and more expensively** — and
this card exists only because `check-all.mjs` was built yesterday. The door had been shut since
2 September; without one command that runs everything, it would still be shut.
