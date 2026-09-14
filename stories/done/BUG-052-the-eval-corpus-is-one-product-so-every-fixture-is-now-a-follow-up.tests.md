# Test cases: BUG-052 — the eval corpus is one product, so every fixture is a follow-up

```
.\run.cmd evals\harness\verify-corpus-routing.mjs             every fixture's road, for free
.\run.cmd evals\harness\negative-control-corpus-routing.mjs   and it can still go red
.\run.cmd evals\harness\produce.mjs --ingest-only             ten doors, ten roads, no spend
.\run.cmd evals\harness\produce.mjs                           the whole corpus  (PAID)
.\run.cmd evals\harness\grade.mjs C1                          ... C2 C3 C4 C6
.\run.cmd check-all.mjs                                       every standing check, one verdict
```

**The row that decides this card is TC8.** Everything else can be argued about; either the
producer posts once to the real door and the pipeline runs because the door chose it, or it
does not.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **Each fixture is its own product.** Ten first documents, not one document and nine follow-ups | 10 distinct | **Pass** | `productFor` in `labels.mjs`; the manifest of the real run carries **10 distinct `product_id`s** |
| TC2 | **Every one of those products routes to `generate`** — asked of the shipped `routeFor()`, the function WF1 decides with, not a copy | 10 of 10 | **Pass** | `10 of 10 — e.g. E1: product forgesight-e1 has no approved version yet` |
| TC3 | **Asserted without spending anything and without writing a row.** A check that ingests ten documents per sweep to prove they would route correctly is BUG-059 in a new place | no writes | **Pass** | NC7 counts rows before and after: `source_documents=2027 prd_versions=1897 events=6031 requirements=8101 prds=384`, identical |
| TC4 | **The products are distinct on purpose, and the check says why**: one approval cannot contaminate the other nine | printed | **Pass** | `worst case 10% of the corpus, against 100% when all ten shared a product` |
| TC5 | **`dispatch: false` is gone from the producer's normal path**, derived from the source rather than believed | absent | **Pass** | `1 occurrence(s), all guarded by INGEST_ONLY` |
| TC6 | **It survives where it is honest** — `--ingest-only` still means "the door and nothing else", and `verify-doors` / `verify-routing` still knock without paying | 3 kept, named | **Pass** | the three are the only remaining users; all three test *the door*, which is a different statement from "the corpus is wrong" |
| TC7 | **The labels do not move.** They join on fixture, not product — *verify that, do not assume it* (the card's point 3) | untouched | **Pass** | derived: no `product` reaches `resolveLabels` or `match.mjs`. And `git status evals/datasets/` is **empty** — not one fixture or label byte changed |
| TC8 | **One post to the real door runs the pipeline**, and the caller still learns `doc_id`, `trace_id`, the state and the counts | one post | **Pass** | `ok T1 DOC-2026-2045 v2204 in_review 14/14 grounded` — from a single POST to `/webhook/ingest`. The producer no longer references the generate webhook at all |
| TC9 | **The manifest records the road each document actually took**, not the road it was expected to take | per fixture | **Pass** | `components: assembler` for all ten; `any delta: 0`. `--ingest-only` records the door's own `route`/`route_reason` |
| TC10 | **A full produce fills the manifest for all ten fixtures**, and the stranger still grades it | 10 of 10 | **Pass** | `10/10 attempted fixtures reached storage`, 9 generated + G1 correctly parked `no_requirements_found` |
| TC11 | **C1/C2/C3/C4/C6 all still pass on the moved corpus** — see the caveat below, which is the honest version of this row | 5 of 5 | **Pass, with a caveat** | C1 **PASS**, C2 **PASS**, C3 **PASS**, C4 **PASS**, C6 **PASS** |
| TC12 | **CONTROL: put the corpus back on one approved product and the check goes red**, naming the road | red, named | **Pass** | NC2 replants the literal BUG-052 state: `TC3 FAIL`, `has an approved version` |
| TC13 | **CONTROL: a shared product with NO approval — TC2 red, TC3 green.** Two claims, not one | split | **Pass** | NC3. A check that ran them together would report one verdict here and be unable to say which was true |
| TC14 | **Run twice, same answer** (BUG-021) | 2 of 2 | **Pass** | check byte-identical twice; control **7/7** |
| TC15 | **Every standing check green**, open cards named (BUG-038) | `check-all` | **Pass, one named** | **62 of 63**, the only red BUG-046 |

## The caveat on TC11, which is the row a reader should not skip

**"Unchanged" is not what happened and the plan should not have said it would be.** The corpus
moved products; the *content* is byte-identical, so nothing about this change can move a score.
What moved is the run — a fresh produce means fresh model output, and the figures move with it:

| | 2026-09-03 | 2026-09-05 |
|---|---|---|
| T1 | 80.0% / 92.3% | **93.3% / 100.0%** |
| T4 | 100% / 85.7% | 100% / **75.0%** |
| T3, N1, E1, F1 | 100/100, 100/100, 100/100, 85.7/85.7 | identical |

T1 crossing its floor by 0 to 13 points between runs is **BUG-040**, already filed and already
saying exactly this. **T4's precision landed on 75.0%, which is the floor to two significant
figures** — a pass, and the closest any fixture has come to failing on the wrong side of a
rounding rule. That is a figure for BUG-040's file, not a new card, and it is written here so
the next reader of a green C1 knows how much room it had.

## The thing that must not happen

**Approving nothing so the fork never fires** — the card names this as the non-fix. The fork is
the product's central feature; an eval environment that removes it grades a system nobody ships.
The extraction corpus routes to `generate` because each document *is* a first document.

The second is a corpus whose correctness depends on **a state nobody asserts**. `dispatch:
false` was at least visible. "Ten products that happen to have no approved version" would be
worse — invisible, and one stray sign-off from wrong. TC2 and TC12 exist so that state is
checked every sweep, for nothing.

## Not tested here, and named

- **C5 and the delta corpus.** Where the approved baseline lives is answered — `forgesight`
  keeps its twenty approved versions and is the living product a delta deltas against — but C5
  is E6-S5 and is not built. This card makes the extraction corpus route naturally; it does not
  build the delta corpus.
- **T2's real relationship to T1.** T2 *is* T1's follow-up and is graded here as a first
  document, which is sound for C1/C2/C3 and exactly wrong for C5. Recorded in
  `docs/assumptions.md` as a named fiction rather than left to be discovered.
- **The 1,206 versions already under `forgesight`.** Nothing rewrites history; the producer
  stops adding to it. Metrics compute over everything and are unaffected.
- **Every other file in `evals/harness/` that posts to a door.** `probe-missing-deadline.mjs`
  has the same two-post shape and no `dispatch: false`, so since the fork shipped it fires a
  delta *and* a generation per run. Filed as **BUG-061**, not folded in — and its fix widens
  TC6 from one file to the directory, because a fix that covers one file is a fix for one file.
