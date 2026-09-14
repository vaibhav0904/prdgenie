# BUG-006: The two doors store different text for the same document

**Found while:** E2-S1, the first door-parity comparison that could run (immediately after BUG-005 was fixed)
**Severity:** major — it silently breaks the grounding guarantee for anything ingested through the form

## Repro

1. Post a three-line transcript to `POST /webhook/ingest`.
2. Submit the **same three lines** through the form at `/form/prdgenie-ingest-form`.
3. Compare the two stored `raw_text` values.

## Expected / Actual

- **Expected:** identical `raw_text`. The doors are adapters; nothing downstream of WF1 may
  be able to tell them apart.
- **Actual:**

```
webhook CR: 0      form CR: 2
```

The form door stores Windows line endings (`\r\n`); the webhook door stores `\n`. Same
document, two different immutable strings.

## Root cause

Browsers submit `<textarea>` content with CRLF line breaks — it is in the HTML spec, not an
n8n quirk. `normalize()` redacts and segments the text but never canonicalises line
endings, so whatever the door happened to receive is what became the immutable `raw_text`.

## Why it matters more than it looks

`raw_text` is immutable from insert onward *precisely because* every citation offset in the
system refers to it forever (ADR 0003). Two consequences, both silent:

1. **A verbatim quote spanning a line break matches in one door and not the other.** The
   grounding check searches for the model's quote as an exact substring. A quote the model
   copied from a CRLF document is not a substring of the LF version, and vice versa. The
   requirement would be marked ungrounded with no explanation available to anyone.
2. **Every character offset after the first newline is shifted** by the number of preceding
   line breaks, so the review UI's click-to-highlight would drift progressively further
   down a long transcript.

Neither failure announces itself. Both would have been diagnosed as "the model paraphrased".

## Fix (applied in E2-S1)

Canonicalise at the door, in `normalize.mjs`, **before** redaction and before storage:
`\r\n` and lone `\r` become `\n`, and a leading UTF-8 BOM is stripped. It is a no-op for
every document already in the corpus (the fixtures are LF), which is why it can be added
without invalidating a single label.

Verified by E2-S1 TC2: the same text through both doors now stores byte-identical canonical
documents, differing only in `doc_id`, `trace_id`, `created_at`, `received_at` and
`source_channel`.

## Lesson

**"One canonical document" has to include the bytes, not just the fields.** The contract in
`docs/contracts.md` §1a named the shape both doors must produce and said nothing about the
text itself, so both doors were compliant and still disagreed.

Worth noting how this was found: it took **fifteen minutes** after BUG-005 was fixed,
because the parity check compared stored rows rather than reading two adapters and judging
them equivalent. The adapters *are* equivalent. The environments feeding them are not, and
no amount of reading either one would have shown that.
