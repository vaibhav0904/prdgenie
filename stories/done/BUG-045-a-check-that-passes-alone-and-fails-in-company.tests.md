# Test cases: BUG-045 — a check that passes alone and fails in company

```
.\run.cmd review-ui\scripts\verify-delta.mjs      14/14, whatever ran before it
.\run.cmd review-ui\scripts\verify-signoff.mjs    9/9, on a product of its own
.\run.cmd check-all.mjs                           every standing check, one verdict
```

**The defect is not that a check failed. It is that a check's verdict depended on what ran
before it** — so a green run said nothing about the code and a red one said nothing about the
delta. Both readings were wrong for the same reason.

**The proof has to be an ordering, not a run.** A single pass proves nothing here: the failure
mode *is* the sequence. Every row below that matters is "run it after the thing that used to
break it".

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **`verify-delta` builds its fixture instead of finding it** — its own product, its own approved version, its own newer draft | built | **Pass** | `verify-delta-<timestamp>`, its PRD, and the source version's requirements **with their citations** cloned into it |
| TC2 | **TC0a is true by construction**: the approved version it gets back is the one it approved, whatever else exists | chosen = approved | **Pass** | `approved=1817, newer draft=1818, chosen=1817` |
| TC3 | **THE ORDERING PROOF: `verify-signoff` then `verify-delta`**, the sequence that reproduced the red by hand | both green | **Pass** | signoff 9/9 → delta 14/14. The same two commands in the same order gave `chosen=1743` against `approved=1742` this morning |
| TC4 | **The reverse ordering too** | both green | **Pass** | delta 14/14 → signoff 9/9 |
| TC5 | **CONTROL: the assertion is not vacuous.** TC0a now passes *by construction*, which is the shape of assertion that passes because the situation cannot arise rather than because the code is right | fails on a plant | **Pass** | **TC0d**: sign off the later draft inside the copy and require the answer to move — *"planted v1818, chosen=1818 (was 1817)"*, then undone |
| TC6 | **`verify-signoff` approves a product of its own** and never a graded run | own product | **Pass** | `verify-signoff-<timestamp>`, two versions built through `ingest` + `assemble`, the pattern `verify-review-gate` has used since E4 |
| TC7 | **CONTROL: `forgesight` gains no approved version** across a full run of both checks, in both orders | count unchanged | **Pass** | **20 approved, newest 1793** — before, after TC3, and after TC4 |
| TC8 | **The routing consequence is gone.** Since E6-S2 an approved version decides which road the next document takes | route unchanged | **Pass** | `route=delta version=1793` after both orderings |
| TC9 | **`verify-delta` still tests what it always tested** — every row, not just TC0a | 13 + the new control | **Pass** | 14/14; the 13 delta assertions are untouched |
| TC10 | **`verify-signoff` still tests the endpoint that ships**, not a harness: HTTP, marker leak, readiness recomputed | 9/9 | **Pass** | TC6–TC14 unchanged; TC11 now reads `0 before, 1 after` instead of counting an ambient history |
| TC11 | **Run twice, same answer** (BUG-021) | 2 of 2 | **Pass** | `verify-delta` four runs, `verify-signoff` three, all identical |
| TC12 | **Every standing check green**, open cards named (BUG-038) | `check-all` | Not Run | |

## What changed, and the part that is easy to get wrong

`verify-delta` still **borrows** requirements — they need real citable text, and inventing
prose that a grounding matcher will locate is a worse fixture than copying one that already
works. What changed is that they are cloned into a product **created microseconds earlier**.
Nothing else can have approved a version of a product that did not exist until that line ran,
whatever the suite did first.

**Borrowing the rows and building the product is the distinction.** A fixture that invented
everything would test the delta against text no model ever produced; a fixture that found
everything is the bug. The citations travel with the requirements for the same reason — a delta
locates quotes, and rows with no evidence behind them would exercise a different path.

## Not tested here, and named

- **The other direction of company.** This card is about state left *behind* by an earlier
  check. State taken *away* underneath a running check is BUG-054, and it needs a lock, not a
  fixture.
- **Whether the metrics corpus should contain verification runs at all.** `verify-review-gate`
  has always built throwaway products and approved them, and M5 already prints how many of its
  approved versions were hand-made and cost nothing. That disclosure is the current answer;
  whether it is the right one is a question for E8, not a bug. **What this card fixes is
  narrower and worse: approvals landing on the *graded* product.**

## Outcome

*(written when the card closes)*
