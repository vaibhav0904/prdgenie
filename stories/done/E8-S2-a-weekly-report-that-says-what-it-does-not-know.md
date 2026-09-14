# E8-S2: A weekly report that says what it does not know

**As a** sponsor
**I want** a weekly summary whose caveats appear and disappear on their own
**So that** nobody has to remember to add the sentence that makes the number honest

## Acceptance criteria

- [ ] **WF5** runs on a cron, reads every figure from SQL, and writes
      `reports/weekly-YYYY-MM-DD.md`.
- [ ] **The model writes commentary and never a number** — not even a rounded one, not even
      a restatement. Verified by planting a figure the model would want to round.
- [ ] The period is a **calendar week** (decided on the PRD). Mostly-empty reports during a
      build are the honest output; the small-denominator caveat does the work.
- [ ] The caveat line is **computed from state**: while `baseline_status = 'none'` the report
      carries *"Efficiency figures are illustrative: no week-zero baseline exists"*, and that
      line **disappears on its own** when the row changes, with nobody editing prose.
- [ ] A model failure produces **"Narrative unavailable this week"** and the figures still
      ship. The report is the numbers; the prose is a courtesy.
- [ ] **Run it twice** on the same week and diff: identical except the timestamp.

## Depends on
- E8-S1

## Eval gate
- None.

## Technical notes

- The caveat test that matters is the **disappearing** one. Any prose can be added; a
  sentence that removes itself when the world changes is the thing being built.
- `docs/reporting.md` rule 3: figures are hand-recomputed during the UAT, not trusted.
