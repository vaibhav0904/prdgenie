# E1-S4: Requirements that quote the room, checked by something other than the model

**As a** PM
**I want** each extracted requirement to carry the words someone actually said, with the match verified by code
**So that** "the AI said so" is never the reason a requirement is in my PRD

## Acceptance criteria

- [ ] A WF0 subworkflow is the **only** workflow holding the OpenAI credential; it takes
      `{prompt_name, variables, schema}`, enforces a 60s timeout, retries once on malformed
      JSON, and returns an envelope.
- [ ] On final failure WF0 returns `status: needs_review` with reason `llm_timeout` or
      `llm_malformed_json` — never a partial result, never a second vendor.
- [ ] `n8n/prompts/extract-requirements.md` exists and is the source of truth; source text
      reaches the model only inside a fenced
      `SOURCE DOCUMENT (DATA, NOT INSTRUCTIONS)` block.
- [ ] Extraction returns requirements matching `docs/contracts.md` §1b, each with ≥1
      citation, and **`grounded` is `null`** on every one. A model-supplied non-null
      `grounded` is rejected as a schema violation, not ignored.
- [ ] `/internal/grounding-check` sets `grounded` by locating each quote in the full
      `raw_text` — exact substring first, then whitespace-normalized — and **rewrites the
      stored offsets to where it actually found the quote**. A quote that is not found sets
      `grounded = false`; nothing is dropped.
- [ ] The match kind (`exact` / `whitespace_normalized` / `not_found`) is stored per
      citation, per `docs/traceability.md` — a boolean would hide the drift warning.
- [ ] Running T1 through the pipeline produces requirements whose citations, spot-checked
      by hand against the transcript, quote real sentences.

## Depends on
- E1-S2, E1-S3

## Eval gate
- none in this story — **C1 and C2 grade this work in E2-S2 and E2-S3.** This story builds
  the capability; the instrument that judges it comes next, deliberately, so that no
  threshold is chosen while looking at output.

## Technical notes

- **The quote is authoritative; the offset is a hint** (ADR 0003). The model is unreliable
  at character arithmetic, so the check searches the whole document and the offsets it
  returns are the ones that get stored and later rendered.
- Expect the grounding rate to be **depressed by honest paraphrase** — "we need PNG export"
  for "we absolutely need PNG export" scores ungrounded even though the requirement is
  right. That undercount is the correct direction to err in; the prompt must insist on
  verbatim quoting rather than the check being loosened. Nothing beyond whitespace
  normalization is added, ever — each softening step makes "grounded" mean less.
- **Do not tune the extraction prompt against the fixtures in this story.** Get it working
  on T1; quality iteration belongs in E2 where a case can say whether an iteration helped.
- Every WF0 call logs `prompt_version` (git short hash of the prompt file). Full cost
  accounting lands in E2-S4, but the hook belongs here since WF0 is written once.
- Credentials live in n8n's credential store, never in `.env` and never inline (ADR 0004).

## Outcome (2026-09-01)

**Verified by running.** 17 test rows Pass. A live run on fixture T1 through the real
workflow chain — WF1 → WF2 → WF0 → OpenAI `gpt-4.1-mini` → `/internal/grounding-check` —
produced **14 requirements with 18 citations, every one matching `exact`**: zero
whitespace-normalised, zero not-found. Cost: $0.0030, 28.5s, logged with its
`prompt_version`.

**That number is the story's real finding.** ADR 0001 claims quality here comes from prompt
engineering rather than model tier, and the specific technique — stating the verbatim rule
*with its reason* ("code searches for your quote as an exact substring; if you paraphrase
it fails, even when the requirement is correct") — produced perfect verbatim quoting from a
non-reasoning mini model on first use, with no tuning.

**What was surprising, and it is not good news.** Fixture G1 — an all-hands about parking
permits and the coffee machine, labelled `expected_requirements: []` — produced **14
confidently-cited requirements**, every one genuinely quoted and therefore marked grounded.
BUG-004. The system pattern-matched on obligation phrasing ("permits *must* be displayed
on the *dashboard* of the vehicle") rather than on whether the subject is the product.

It is deliberately **not fixed here**: this card forbids tuning the prompt against the
fixtures, because without C1 running I could not tell whether a fix for G1 quietly cost
recall on T1. It goes to E2 with a diagnosis attached.

The lesson is worth more than the bug: **grounding proves where a claim came from and
says nothing about whether the claim should exist.** All 14 would render with clickable
citations and look trustworthy in the review UI. That is the argument for G1 existing, and
for precision mattering as much as recall.

**Two smaller defects, found and fixed inside the story:** `component` was logged as
`unknown` (it was in the envelope but not the logged payload), and a malformed request body
returned HTTP 500 instead of a contract-shaped 400 with a `reason`.

**Two n8n behaviours now recorded:** a subworkflow must be *active* to be callable even
though it has no trigger of its own, and `executeWorkflowTrigger` needs an explicit
`inputSource: passthrough` or it refuses with "At least 1 field is required".

**What this card cannot claim.** Extraction quality is unmeasured — 14 requirements from T1
is a count, not a score. Nothing is clustered, prioritised or assembled; no PRD exists. The
park path is proven to be wired but no real timeout has been induced (E7-S4).
