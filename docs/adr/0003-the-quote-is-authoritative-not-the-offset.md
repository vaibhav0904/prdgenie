# ADR 0003 — Make the quote authoritative and the character offset a hint

**Status:** accepted · **Date:** 2026-09-01

## Context

The central claim of this product is that every requirement is traceable to the words
someone actually said. That claim is only worth making if something checks it. Two
things make checking hard: language models are unreliable at character arithmetic, and
long documents get chunked, so an offset the model returns is relative to a chunk while
the citation must point into the whole document.

Alternatives:

- **Trust the model's `start_char`/`end_char`** — disqualified: off-by-tens errors are
  routine, and a citation that highlights the wrong sentence is worse than no citation,
  because it looks verified.
- **Ask the model to return only a quote, no offsets** — nearly chosen. It loses the
  ability to disambiguate a phrase that appears twice in a document, and the offset is
  free to ask for. So: keep it, but demote it.
- **Sentence ids instead of spans** — disqualified: it forces a sentence-splitting
  convention onto transcripts, where speakers interrupt each other, and a requirement is
  frequently half a sentence.
- **A second model call to verify grounding** — disqualified for the reason the whole
  design exists: a model cannot be the check on a model's honesty, and it would double
  cost on the most-run path.

## Decision

A citation is `{doc_id, quote, start_char, end_char}`. The **quote is authoritative**.
`/internal/grounding-check` searches for the quote in the full immutable `raw_text`:
exact substring first, then whitespace-normalized, then not found. The offsets are used
only to disambiguate when a quote occurs more than once, and are rewritten by the check
to the location it actually found. `grounded` is set by this check and by nothing else;
a model-supplied `grounded` value is a schema violation.

Chunking, when a document exceeds the single-call size, splits on segment boundaries and
passes a `chunk_base_offset`, but the check always searches the whole document — so a
wrong base offset costs nothing.

## Consequences

- "Grounded" becomes a code-decided, testable property rather than a model's assertion,
  which is exactly what eval case C2 needs to be meaningful.
- The failure mode is honest and visible: a paraphrased quote is reported ungrounded and
  badged in the UI, rather than silently accepted.
- **Accepted cost:** a model that paraphrases lightly ("we need PNG export" for "we
  absolutely need PNG export") is marked ungrounded even though its requirement is
  correct. This will depress the grounding rate for real reasons, and the prompt must
  insist on verbatim quoting. That undercount is the honest direction to err in.
- **Accepted cost:** whitespace normalization is a deliberate softening; anything beyond
  it (stemming, fuzzy matching) is refused, because each step makes "grounded" mean less.
- Forces `raw_text` to be immutable after redaction — otherwise every stored offset rots.
