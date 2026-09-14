# Test cases: BUG-043 — the form door has been shut since the second

```
.\run.cmd review-ui\scripts\verify-doors.mjs    8/8, twice
```

**The door was never broken.** The checker was filling the wrong boxes, and the door refused
the result exactly as it should have. Everything below is about proving that, and about making
the same mistake impossible to repeat rather than merely corrected.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **The form door stores a document again** | a row appears | **Pass** | `DOC-2026-1337`, `doc_type=transcript`, first form document since 2 September |
| TC2 | **Both doors store the identical canonical document** | 7 fields equal | **Pass** | verify-doors TC2: 7 canonical fields equal; only `source_channel` differs, as designed |
| TC2b | **Parity holds through redaction** | same redactions | **Pass** | one email and one phone redacted on both paths; neither stores the address |
| TC2c | **CONTROL: the indices are derived, not typed** | index follows | **Pass** | `Text` is `field-3`; insert a field above it and the derivation follows to `field-4` — *the exact move nobody noticed in E4-S6* |
| TC3 | **A renamed label fails loudly and names it**, rather than posting to whatever now sits at that index | names the label | **Pass** | `missingLabels` short-circuits before submitting: *"the form no longer has: X — indices cannot be derived"* |
| TC4 | **Run twice, same answer** (BUG-021) | 8/8 twice | **Pass** | 8/8 on both runs |
| TC5 | **Nothing else in the repo hard-codes a `field-N`** | 0 outside this file | **Pass** | derived grep: only `verify-doors.mjs`, and only in its comments and its derivation |
| TC6 | The dead-letter trail was correct throughout | recorded | **Pass** | WF4 wrote every failure with the workflow and node; `#20` named `Map form input` and `#21/#22` named the content-type refusal |

## The diagnosis, in the order it actually went

1. **`/form/ingest` 404s; `/form/prdgenie-ingest-form` answers 200.** The form node has no
   `path` parameter, so its URL is its `webhookId`. The checker already used the right one.
2. **urlencoded and JSON both give HTTP 500** *"Workflow could not be started!"* — the trigger
   takes `multipart/form-data` only. Recorded as dead letters #21 and #22. **This is a
   distraction**: it is what a hand-probe hits first, and it is not what was wrong.
3. **A correct multipart post returned `{"status":200}` and stored nothing.** n8n's execution
   record settled it: every field arrived **`null`**, keys present, values empty.
4. **n8n binds form releases by index — `field-0`, `field-1` — never by label.** The checker
   posted four indexed fields written when the form had four. **E4-S6 inserted "Who wrote
   this?" as the third.** Everything below it shifted: the document text went into the
   authorship dropdown, and the required `Text` field received `''`.
5. So `Map form input` produced an envelope with no `doc_type` and no `raw_text`, and
   **`Envelope ok?` refused it — correctly** — while the form trigger had already replied 200.

## Corrections to this card's own investigation plan

- **Step 2 was based on a wrong premise.** The card said the dead-letter message
  `"Cannot read properties of undefined"` had been truncated like BUG-041, and that fixing
  that first would have made step 1 unnecessary. **It is not our truncation**: the stored
  message is **35 characters** against a 300-character cap. n8n delivers it that way, without
  the `(reading '…')` clause a raw `TypeError` would carry. Nothing to fix here; recorded so
  nobody re-opens it.
- **Step 3 is declined, with a reason.** Giving the form node an explicit `path` would produce a
  prettier `/form/ingest`, and would change a working URL that the checker, `.env.example` and
  the eventual video all reference. Churn against a URL that already works and already
  describes itself. Left alone deliberately.

## What actually gets fixed, and what it prevents

`verify-doors.mjs` now reads `formFields.values` out of the shipped `WF1-ingest.json`, looks up
each label, and posts to the index the form actually assigns. **A positional binding is a
contract nobody can see**; this makes it one the check re-reads every run. Insert a field and
the check follows it; rename one and the check stops and says which.

## What this does not fix, and it is worth stating

**A form trigger answers before the workflow has stored anything.** WF1 refused a bad envelope
and wrote a dead letter, and the caller still got `200`. That is inherent to n8n's form trigger
and is *why* this hid for two days behind a success. The mitigation already exists — the
refusal is a dead letter and the needs-attention queue shows it (E7-S3) — but **the door cannot
report its own failure to the person submitting**, and no change here alters that.
