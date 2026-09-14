# BUG-037: the prompt holds T4's boundary rules or F1's period rule — measured, never both

**Severity:** minor · **Filed:** 2026-09-03, at the end of BUG-035's third iteration
**One requirement is misclassified in the shipped state, and it is a known, chosen casualty:**
`F1-R06` comes back `constraint` where the label says `nonfunctional`. F1 still clears both
C1 floors at 85.7 / 85.7. Vaibhav accepted this trade when he shipped `7f9c3916173e` (Option A).

## The finding, which resolves a prediction against its author

BUG-030's card predicted: *"I expect BUG-032 can have both. If it turns out it cannot, that is
a real finding about how much a single prompt can carry."* **It cannot, and this card is that
finding.** Across four prompt states and thirteen graded runs:

| prompt state | `F1-R06` | `T4-R03/R05` | C1 | the section's shape |
|---|---|---|---|---|
| `dd2ce8269321` | **right 4/4** | wrong | FAIL | period rules as three top-level paragraphs, no ordering |
| `7f9c3916173e` **(shipped)** | wrong 3/3 | **right** | **PASS 3/3 + control** | ordering, guards under step 2 |
| `a53d9edc8ba5` | right 1/4 | right | PASS 1/4 — T3 and N1 destabilised | + a 5th headed paragraph under step 2 |
| `44b29bb6500d` | wrong 1/1 | right | PASS, T1 at its floor | case folded into an existing heading |

Every arrangement that makes the period rule prominent enough to win `F1-R06` either loses
T4's boundary rules or adds enough weight to step 2 that *other* fixtures start wobbling. The
prominence is a budget, and it is spent.

## What was tried, so nobody tries it again by accident

1. **A dedicated heading for the period-from-an-event case** — recovers `F1-R06` ~1 run in 4,
   breaks T3 to 71.4% twice and N1 to 83.3/71.4 once (N1 had never failed before).
2. **Folding the case into the heading that already wins** — paragraph count constant, and
   `F1-R06` stays wrong while T1 falls to its 80.0% floor.
3. **The naming-the-collision wording** (BUG-030 iteration 2's, inside the current structure) —
   subsumed by the above; the word "contract" in the sentence still finds step 1's list.

## The candidate fix is structural, and it has precedent

This project has already solved exactly this shape once: **BUG-023 was fixed by a second call
over a smaller scope, not a better wording** — the card had even ruled the wording out. The
same move here: a cheap second call given ONE requirement and the three kind definitions,
asked only "which kind", fired **only** for requirements whose citation matches both a
duration pattern and a boundary word — a handful per corpus. Code decides *when* to ask; the
model only ever answers the narrow question. Bounded cost, no change to extraction.

Not built now: it is an architecture addition, this card is minor, and the eval is green
without it. It should be weighed against simply accepting one wrong `kind` on one fixture
forever — which is also a defensible answer, and cheaper.

## Verified by
- either `F1-R06` correct 3 of 3 with T1, T3, N1, E1, T4 all no worse than `7f9c3916173e` —
  or a recorded decision to accept the misclassification, on this card
- and in both cases: **no further prompt iterations spent on this diagnosis.** Three states
  are measured above; a fourth wording is not a new idea.
