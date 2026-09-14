# E2-S3: Nothing invented, nothing leaked, nothing found where there was nothing


**As a** PM
**I want** proof that a requirement marked grounded really is in the source, that contact details never reached storage, and that a requirement-free document yields nothing
**So that** the one claim I cannot check by eye — that the system does not invent — is checked for me, every run

## Acceptance criteria

- [x] Case **C2** exists at `evals/cases/C2-grounding-fidelity.md`, with its auto-fail rule
      stated **separately from** its score: any requirement with `grounded = 1` whose quote
      is not present in its document's `raw_text` fails the case **at any accuracy**.
- [x] C2 re-verifies grounding independently of `/internal/grounding-check` — it reads the
      stored quote and the stored `raw_text` and checks the substring itself. A case that
      called the same function it grades would agree with itself.
- [x] The match-kind distribution (`exact` / `whitespace_normalized` / `not_found`) is
      reported, not just the pass rate — the slide toward normalized matching is the early
      warning that precedes ungrounded (`docs/traceability.md`).
- [x] PII: on fixture **H2**, every labeled email and phone number
      is absent from the stored `raw_text`. **100% floor**; one leak fails the case.
      **Amended 2026-09-02 by Vaibhav: external names are KEPT, not redacted** — and the
      case gained a second half, `expected_retentions`, so an over-zealous redactor fails
      too. See the test plan for why this is a specification change and not a relaxation.
- [x] Garbage: fixture **G1** produces **zero** requirements and a `needs_review` park with
      reason `no_requirements_found`. A system that always finds requirements is broken.
- [x] Result file dated, per-item diffs naming every ungroundable quote verbatim, and a
      `## Verdict:` line.

## Depends on
- E2-S2

## Eval gate
- **C2** — built here and must pass. On FAIL: diagnose and file a BUG card. Never relabel,
  never soften what "grounded" means. Nothing beyond whitespace normalization is ever
  added to the matcher (ADR 0003).

## Technical notes

- **This case is the one that makes the product's central claim falsifiable.** Everything
  else measures how well it works; C2 measures whether it is honest.
- Expect the grounding rate to be **depressed by honest paraphrase** — the model writing
  "we need PNG export" for "we absolutely need PNG export" scores ungrounded even though
  the requirement is right. That is the correct direction to err in. If it happens often,
  the fix is the prompt insisting on verbatim quoting, never a looser matcher.
- Separate the fatal class from the merely wrong (`evals/README.md`): an ungroundable quote
  reported honestly as `grounded = 0` is *correct behaviour* and costs nothing. Only a
  quote marked grounded that is not there is fatal.
- PII redaction was built in E1-S2. This story grades it; if it fails, the bug is there,
  and it is filed as a BUG card rather than patched inside this story.
- G1's expected output is *nothing*, which makes it the easiest case to accidentally pass
  by breaking extraction entirely. C1 passing on T1/T3 is what stops that reading as
  success — the two cases constrain each other.
- Run the negative control once: plant a fabricated citation, confirm C2 auto-fails,
  remove it (BUG-001).

## Outcome — 2026-09-02, closed without a line of code

**11 of 11 test rows Pass. C2 is green, `evals/results/2026-09-02-C2-run24.md`.**

This story was built and then blocked for a day, holding the whole board under WIP=1, because
its case was red on three defects that lived in *other* code. It closes now because each of
those cards closed:

| Failure | Owner | Result |
|---|---|---|
| 3 phone numbers reached storage | **BUG-008** — match by shape, not by digit-group count | 0 of 13 survive |
| 8 name forms reached storage | **BUG-009** — *reversed by decision*: names are kept | key asks for 13, plus 22 retentions |
| 14 requirements from a document with none | **BUG-004** — name the subject rather than suppress | 0, parked correctly |

**The story's own technical note is what made this possible**, and it is worth quoting back
at itself: *"a redaction defect is filed, not patched inside the story that grades it."* Had
those three been fixed here, this card would have been a case that repaired what it measured
— BUG-001 in a new hat — and none of the three would have a card carrying its lesson.

### No UAT, and the reason is on the record (G6)

Every claim this story makes is machine-checkable: a substring search over stored text, a
count of survivors against a labelled list, a park reason, a coverage assertion. There is no
judgement in it that a human can make and a machine cannot. Per the G6 scoping rule
(`stories/README.md`), it is promoted on evidence, and this paragraph is the audit trail for
that choice.

**One judgement inside it did need Vaibhav and got him**: whether external names should be
redacted at all. That was BUG-009's question, it went over on its own page, and his answer —
keep the names, drop the contact details — is what the amended acceptance criterion now
states.

### What is now provable, in one line

Across 8 fixtures and 69 citations, **every quote marked grounded is verbatim in its source**,
checked by a search that does not call the code that produced it, and disagreeing with it on
zero citations. **No labelled contact detail reached storage, and nothing that should have
been kept was erased.** A document containing no requirements produced none.

That is the product's central claim, and it is now falsifiable on every run rather than
asserted in a deck.
