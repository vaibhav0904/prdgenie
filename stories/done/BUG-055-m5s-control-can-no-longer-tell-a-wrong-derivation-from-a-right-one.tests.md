# Test cases: BUG-055 — a published figure whose checker cannot fail

```
.\run.cmd review-ui\scripts\recompute-metrics.mjs   eight derivations, and the controls that bite
.\run.cmd review-ui\scripts\verify-metrics.mjs      the definitions and the SQL behind them
.\run.cmd check-all.mjs                             every standing check, one verdict
```

**The defect is not a wrong number.** Both derivations of M5 agree and both are right. What
broke is the *proof*: a 26% error between the right and the wrong derivation disappears at the
precision the figure is published at, so the control cannot demonstrate that the checker would
notice.

**A check that cannot fail is not checking anything** — and the row that says so is the one this
card exists to restore.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **The precision is DECLARED, not inferred from a stringified value** | each metric carries its own | **Pass** | `DP = { M1: 2, M2: 2, M3: 3, M4: 2, M5: 4 }`, published as `decimals` beside every value; the checker reads it and warns loudly if a metric declares none |
| TC2 | **M5-C bites again**: the double-counting derivation is a different number at M5's published precision | control fails the wrong way | **Pass** | `wrong way $0.001168 vs right way $0.0009` |
| TC3 | **The other four still agree** — the precision change must not turn a correct metric red | M1–M4 green | **Pass** | M1 97.88%, M2 77.88%, M3 0.122, M4 0.02, all unchanged |
| TC4 | **CONTROL: a metric whose declared precision is wrong is caught**, not silently trusted | disagreement surfaces | **Pass** | **DP-C**: M5 re-declared at 1dp swallows a difference 40× its resolution; at 4dp it refuses. That is the proof the declaration is *read* rather than ignored |
| TC5 | **One place per number** (E7-S5): the digits a metric rounds to and the digits it declares are the same constant | derived | **Pass** | one `DP` constant drives the `toFixed`, the declaration and the page |
| TC6 | **The denominator question is decided and recorded**, not left implied | decision written | **Pass** | **not changed**, and `docs/metrics.md` carries a section saying why |
| TC7 | **The companion figure is beside the headline**, with its own denominator | row present | **Pass** | `of those the pipeline actually produced, cost each (USD)` = **0.002**, beside a headline of 0.0009 over 74 versions, 40 of them free |
| TC8 | **The `provisional` block still computes itself** from the data and still says why | unchanged | **Pass** | still derived from the count of zero-spend versions; still says the average is "not the cost of anything" |
| TC9 | **`verify-metrics` still passes** — the definitions, the SQL, and the "computed by" claims | green | **Pass** | 51/51; and `audit-render` **79 fields homed, 0 with no home** |
| TC10 | **Run twice, same answer** (BUG-021) | 2 of 2 | **Pass** | `recompute-metrics` 8/8 twice |
| TC11 | **Every standing check green**, open cards named (BUG-038) | `check-all` | **Pass, one named** | **57 of 58 in 78s** — the only red is BUG-046, open |

## The row that would have been skipped

Every other row passes when the two derivations agree. **None of them would notice a tolerance
that had gone slack** — and a tolerance is precisely the thing that widens quietly, because
widening it makes everything greener.

**DP-C** declares M5 at one decimal and requires the same comparison to accept a difference it
must not, then requires the real declaration to refuse it. Without that row, "the checker uses
the declared precision" and "the checker ignores precision entirely" look identical.

## What this card did not do

- **Loosen M5-C so it passes.** That is tuning a check to output, and the number it guards
  appears in the deck.
- **Rename the metric to make the control comfortable.** "Cost per approved PRD" is what was
  published. The figure a reader actually wants now sits *beside* it with its own denominator —
  two populations, two figures, both named, neither a correction of the other.

## Outcome

*(written when the card closes)*
