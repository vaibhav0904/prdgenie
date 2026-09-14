# BUG-019: The requirement-free document produces an open question

**Found while:** E3-S4, on the first full run after open questions were wired in
**Severity:** major — it re-opens, in a new field, the hole BUG-004 spent four prompt
versions and one structural change closing

## Repro

Produce **G1** — the all-hands about staff parking permits, the holiday calendar and the
coffee machine — and read the open questions on the parked version.

## Expected / Actual

- **Expected:** nothing. G1's correct output is an empty PRD *and* an empty question list.
- **Actual:** the version parks correctly with `no_requirements_found`, and carries

  > **[unanswered]** *What is the biscuit budget?*

  grounded, cited, and entirely real: somebody did ask, and nobody did answer.

## Root cause

**The gap detector has no `concerns_product` gate.** BUG-004 gave the extractor one — the
model names what the document is about, and code parks the run when the answer is not the
product. That judgement is made in the extraction call and is **never passed to the
detector**, which sees only `raw_text` and the requirement list and answers the question it
was asked: what did this document leave unsettled?

It is right. The biscuit budget is unsettled. It is not a *product* question, and nothing
told the detector that was the test.

## Why it matters more than one funny line

C2's third auto-fail rule counts **requirements** on the requirement-free document, so it
passes — the case cannot see this. The same fixture that took four prompt versions to
silence is now speaking again through a field the case does not read.

That is the shape worth naming: **a guard built for one output does not cover a second
output added later.** G1 was the fixture chosen precisely because its correct answer is
"nothing", and "nothing" has quietly come to mean "no requirements".

## FIXED — 2026-09-02. G1 asks nothing, 3 runs of 3; T3 still files its conflict, 3 of 3

The product decision was taken as **drop them, and count the drops** — the reasoning, its
accepted cost, and all eleven test rows are in
`BUG-019-parked-document-still-asks-a-question.tests.md`.

| | before | after |
|---|---|---|
| G1's parked version | *"What is the biscuit budget?"*, grounded and cited | **0 open questions ×3** |
| T3's conflict (the control) | filed, grounded | **filed, grounded ×3** |
| Model calls on G1 | 2 | **1** |
| `verify-gaps.mjs` | 25/25 | **31/31**, twice, identical |
| C1 / C2 | pass | **pass** (run 28 / run 38) |

Two gates, deliberately: the wiring stops the call being made, and `gaps.mjs` drops anything
that arrives anyway. **Building only the first would have repeated this card's own mistake in
a new place** — a gate that lives on one wire is a gate that a re-wiring removes silently.

**One defect found while fixing it**, in the instrument rather than the product:
`verify-gaps.mjs` claimed its own coverage with a hand-typed *"6 drop reasons, 6 exercised"*.
It would have printed 6 of 6 on the day the seventh was added. `DROP_REASONS` is now exported
from `gaps.mjs` and the row is derived; a reason nothing exercises turns the file red, which
was confirmed by adding one and watching it fail.

## Fix as first written — not yet applied, and not obviously the cheap one

The cheap fix is to pass `concerns_product` into the detector call and have code drop every
open question when it is `false`. That is a code gate, in keeping with the project's habit,
and it costs one field in the WF2 wiring.

The reason to think before doing it: **the detector's own judgement is currently
independent**, and there is some value in a document being able to say "I found nothing to
build here, but these three things are unresolved". The honest question is whether a PM
reviewing a parked run wants that. It is a small product decision, not a mechanical one.

**Re-run when:** C2, and E3-S4's own report over three runs.

## Lesson

**Every new output needs its own copy of every gate the old output has** — or an explicit
note saying why not. The extractor's subject judgement is the system's only defence against
documents that are not about the product, and the second consumer of that document was
built without it.
