# Eval case: C1 — extraction quality

**Measures:** Of the requirements a room actually stated, how many does the system find,
and how much of what it reports was never asked for?

**Method:** Reads a run that already happened (the manifest at
`evals/results/.last-run.json`) and compares the stored `requirements` rows for each
fixture's PRDVersion against `evals/datasets/labels/<fixture>.labels.json`.

An extracted requirement **matches** a label when one of its citation spans **overlaps** a
region that label was drawn from *and* its `kind` agrees (ADR 0008). Overlap, not equality:
the model quotes the minimal span carrying the requirement and the label quotes the
sentence, so demanding identical spans would measure how the answer key was punctuated.

Labels resolve against the **stored, post-redaction** `raw_text`, never the authored
fixture — resolving against the wrong string misaligns every span silently and reads as an
extraction failure (E1-S3).

There is **no string similarity, no embedding, no edit distance, no model and no tuned
constant** anywhere in the matcher. A headline accuracy figure produced by an instrument
with a knob on it is a figure someone can turn.

Verdict classes, one per extracted requirement:

| Verdict | Meaning | Counts as |
|---|---|---|
| `match` | overlaps an unclaimed label of the same kind | true positive |
| `over_split` | overlaps a label another extraction already claimed | **false positive** |
| `wrong_kind` | overlaps a label but calls it something else | **false positive**, and the label is still a miss |
| `false_positive` | overlaps no labelled region at all | false positive |

Over-splitting is counted as one match plus one false positive, deliberately: three cards
where the room stated one requirement is three things for an engineer to reconcile, not one
requirement found harder.

**Pass threshold:** recall **≥ 0.80** AND precision **≥ 0.75**, evaluated **per fixture**
and never averaged across them.

**Auto-fail, stated separately:** the case fails if any fixture it names was not graded.
A case that can silently skip its subject is a case that cannot fail (BUG-003). Grading one
of two fixtures is a FAIL, not a footnote.

**Why this threshold:** the two errors are not symmetric. A missed requirement is caught by
the PM reading the source pane beside the draft — it costs time. A **fabricated** one is
caught only if they happen to disbelieve a sentence carrying a plausible citation, and it
can travel into an epic. Precision is the more expensive half; recall is set slightly higher
only because a PRD missing a fifth of the room is not a draft anyone would use.

The bar is not "as high as possible". A threshold set where the system happens to land is
not a threshold, and neither is one nobody could ever meet.

**Fixtures:** **T1** (kickoff transcript, 14 labelled requirements) and **T3**
(conflicting stakeholders, 6 labelled requirements). T3's conflicts are C4's subject, not
this case's — C1 grades requirements only (PRD-E2, decided).

Not here: **G1**, the requirement-free document, is graded by **C2** (E2-S3), which owns
the "correct output is nothing" property along with grounding and PII. `evals/README.md`'s
coverage matrix originally pointed the G1 row at C1; it has been corrected to C2 to match
the story cards, and the correction is noted rather than made quietly.

**Gates:** E2-S2, E2-S3. Also re-run before anything in E3 is called done, because
clustering makes bad extraction look *more* credible, not less.

**Automated?** YES — `.\run.cmd evals/harness/grade.mjs C1`.
A FAIL verdict is a non-zero exit. With no run in the database it prints the `produce`
command and exits non-zero; it never reports success and never throws a stack trace.

**Re-run when:**
- `n8n/prompts/extract-requirements.md` changes, in any way, including the few-shot example
- the extraction node in `n8n/workflows/WF2-generate-prd.json` changes
- the model or its temperature changes
- `review-ui/normalize.mjs` changes — redaction rewrites the text every span resolves against
- `review-ui/grounding.mjs` changes — it writes the offsets this case matches on
- `evals/harness/match.mjs` changes
- **`n8n/prompts/detect-ambiguity.md` is built or changed (E3-S4).** Not obvious, and
  added because of BUG-007: while unsettled disagreements have nowhere to go, the extractor
  files them as requirements and T3's precision is capped at 66.7%. Giving conflicts a
  destination is expected to move this case, so the case is re-run when it lands.
- any fixture or label file changes (which should be almost never; see rule 2)

**Result file:** `evals/results/<YYYY-MM-DD>-C1.md`, never overwritten. A second run on the
same day writes `-run2`.

**On failure:** at most **three prompt iterations**, then stop and file a BUG card naming
the failure *pattern* — what kind of requirement is being missed, not "recall is low"
(PRD-E2, decided). The threshold never moves. The labels are never edited.
