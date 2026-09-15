# ADR 0008 — Match extracted requirements to labels by span overlap

**Status:** accepted · **Date:** 2026-09-01 · *amended 2026-09-01 (the `missing_nfr` exception)*

## Context

Eval case C1 measures extraction recall and precision against hand-written labels. That
requires deciding whether an extracted requirement "is" a labeled one — and the model
will phrase it differently from the label almost every time. How that matching is done
decides whether the score means anything.

Alternatives:

- **Exact or fuzzy string match on the statement text** — disqualified: "Users can export
  charts as PNG" versus "PNG export for dashboard charts" is the same requirement and
  would score as both a miss and a false positive, punishing the system twice for
  phrasing.
- **An LLM judge deciding equivalence** — disqualified by this project's rule that the grader is
  never the doer and that judge scores are monitoring, not ground truth. It is the most
  accurate matcher available and that is worth conceding; using it would make the headline
  accuracy figure a model's opinion, which is precisely the claim this project refuses to
  make elsewhere.
- **Embedding similarity with a threshold** — disqualified: it introduces a tuned number
  into the measurement instrument itself, and a threshold tuned while looking at results
  is label-tuning by another name.

## Decision

Each labeled requirement carries the **character region of the source text it was drawn
from**, written when the dataset is created. An extracted requirement **matches** a label
when at least one of its citation spans overlaps that label's region, and the extracted
`kind` agrees. Matching is therefore decided by *where the evidence came from*, not by how
the sentence was worded — which is deterministic, needs no threshold, and cannot be tuned
after the fact.

Consequences for scoring: recall is labels matched ÷ labels; precision is extracted
requirements matching some label ÷ extracted requirements. Two extracted requirements
overlapping one label count as one match and one false positive — over-splitting is a real
defect and is scored as one.

## Consequences

- The headline quality figure is produced by arithmetic over stored rows, with no model
  and no tuned parameter anywhere in the instrument.
- It composes with ADR 0003: matching depends on citations being real, so C1 quietly
  depends on C2, and a system that stopped citing honestly could not score well by accident.
- **Accepted cost:** a correct requirement that a stakeholder stated in two places may cite
  the passage the label did not mark, and score as a miss. Labels therefore list *every*
  region a requirement was stated in, and this is a documented labeling obligation.
- **Accepted cost:** writing labels is slower, since each needs its regions marked. Paid
  once, before any tuning, which is the order this project requires anyway.
- Forces the label format to store regions, and forces labels to be written against the
  final redacted `raw_text` so offsets line up.

## Amendment — 2026-09-01: span matching cannot apply to `missing_nfr`

Surfaced while writing the fixtures (E1-S3). An OpenQuestion of kind `missing_nfr` reports
a category the sources **never mentioned** — accessibility, data retention, localization.
By construction it has no span, because its evidence is an absence. Two labels (T1-Q03,
F1-Q02) are of this kind and legitimately carry empty `quotes`.

The decision above therefore has a hole: applied literally, every `missing_nfr` label is
unmatchable and would score as a permanent miss no matter how well the system worked.

**The exception, stated narrowly:** items of kind `missing_nfr` are matched **by category**
— the named NFR category must agree — and are never matched by span. Everything else, and
in particular every Requirement, still matches only by span overlap. The categories come
from a fixed checklist held in the prompt (PRD-E3 technical constraints), so the match is
still against a closed set rather than free text.

- This is the one place a match is not evidence-anchored, which is precisely why it is
  written down rather than absorbed quietly into the harness.
- **Accepted cost:** a system could score well on `missing_nfr` by naming categories from
  the checklist without reasoning about the document at all. C4 therefore reports
  `missing_nfr` matches **separately** from `conflict` and `unanswered`, so the
  cheap-to-game half can never be averaged into the honest half.
- Requirements are untouched by this amendment. If span matching were ever relaxed for a
  Requirement, the headline accuracy figure would stop being evidence-anchored.
