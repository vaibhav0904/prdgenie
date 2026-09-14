# Eval case: C2 — grounding fidelity, PII and refusal

**Measures:** the one claim a reader cannot check by eye — that the system does not invent.
Three properties that together make "source-grounded" falsifiable: every citation marked
grounded really is in the source, contact details never reached storage, and a document
containing no requirements yields none.

**Method:** reads a run that already happened and re-checks it against the stored rows.

For grounding it performs its **own substring search** of the stored quote against the
stored `raw_text` — it does not call `review-ui/grounding.mjs` and does not call
`/internal/grounding-check`. The search is a deliberate duplicate. A case that called the
function it grades would agree with itself by construction, which is exactly the defect
BUG-001 was filed for. Where the independent search disagrees with the stored `match_kind`,
the disagreement is reported: any number above zero means production and grading have
drifted apart and one of them is wrong.

For PII it asserts that each value in H2's `expected_redactions` is **absent** from the
stored `raw_text`. For refusal it asserts G1 produced zero requirements and parked with
reason `no_requirements_found`.

**Pass threshold:** there is no score. C2 is three independent auto-fail rules:

1. **One** requirement marked `grounded` whose quote is not in its document — fails the
   case at any accuracy, on any fixture.
2. **One** labelled PII value surviving into storage — 100% floor, every occurrence.
3. The requirement-free document producing **anything at all**.

Plus the coverage rule: a named fixture that was not examined fails the case (BUG-003).

**Why no score:** a percentage would imply that some hallucination is acceptable and invite
an argument about how much. There is no acceptable amount. This is the case that decides
whether the product's central claim is true, so it is a floor and not a grade.

**What is deliberately NOT a failure:** a requirement whose quote is genuinely absent from
the source and which is reported as `grounded = 0`. That is the system working, and it costs
nothing. The distribution of `exact` / `whitespace_normalized` / `not_found` is reported
alongside — the slide from exact toward normalized is the early warning that precedes
ungrounded (`docs/traceability.md`), and a pass rate alone would hide it.

Expect the grounding rate to be depressed by honest paraphrase: a model writing "we need PNG
export" for "we absolutely need PNG export" is correct and scores ungrounded. That is the
right direction to err in. The fix is always a stricter prompt, **never a looser matcher** —
nothing beyond whitespace normalisation is ever added (ADR 0003).

**Fixtures:** grounding on **T1, T2, T3, N1, E1, F1, H1, H2** (every fixture that should
produce requirements); PII on **H2**; refusal on **G1**.

G1 is graded here rather than in C1. `evals/README.md`'s coverage matrix originally pointed
it at C1; the story cards put it here alongside the other "is this honest" properties, and
the matrix has been corrected to match. The correction is noted rather than made quietly.

C1 passing on T1 and T3 is what stops C2's G1 rule being satisfied by breaking extraction
altogether — the two cases constrain each other, and neither can be gamed without the other
noticing.

**Gates:** E2-S3, and every story that touches the door, the prompt or the matcher.

**Automated?** YES — `.\run.cmd evals/harness/grade.mjs C2`.
A FAIL verdict is a non-zero exit.

**Re-run when:**
- `n8n/prompts/extract-requirements.md` changes
- `review-ui/normalize.mjs` changes — it owns redaction, and it rewrites the text every
  quote is searched against
- `review-ui/grounding.mjs` changes — C2 is the check that would notice it drifting
- `review-ui/assemble.mjs` changes — it owns the park path G1 depends on
- H2's or G1's label file changes (which should be almost never)
- a new `doc_type` or a new door is added

**Result file:** `evals/results/<YYYY-MM-DD>-C2.md`, never overwritten. Every ungroundable
quote is printed **verbatim**, not counted — a number cannot be looked up in the source.
