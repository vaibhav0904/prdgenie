# E6-S5: Four changes found, and nothing else reported

**As a** builder
**I want** the delta graded against labels written before it existed
**So that** "it found the changes" is a number and not an impression

## Acceptance criteria

- [ ] **Case C5** grades the T1→T2 delta against `T2.labels.json`: **two modifications, one
      contradiction, one addition — 4 of 4.**
- [ ] **Churn is a first-class number, not a footnote to recall: `churn = 0`.** T2 restates
      several requirements verbatim; every one of them that appears in the delta is counted and
      named. A run that finds all four changes and reports three unchanged requirements has
      **failed** this case.
- [ ] Matching is by the same instrument the rest of the suite uses — **span overlap and
      `req_id`, no string similarity, no tuned constant** (ADR 0008).
- [ ] The case **asserts its own coverage**: every labelled delta item is graded or named as
      not graded, and a label the case cannot see fails it rather than being silently skipped.
- [ ] **A negative control**: a planted delta item that matches no label turns C5 red and names
      it; and a planted *unchanged* requirement in the delta raises churn above zero. A case
      that cannot fail proves nothing.
- [ ] C5 is added to `evals/README.md`'s coverage matrix with its *re-run when:* line, and to
      C1's `GRADED_ELSEWHERE` — which has carried "T2 requirements are ungraded today, and this
      line is the record of that rather than a silence" since E2. **That line comes out when
      this case goes in.**
- [ ] The result is reported with its **spread** — three runs, min/median/max — like every other
      published figure (docs/reporting.md rule 6).

## Depends on
- E6-S2 (something to grade)

## Eval gate
- This story *is* the gate. It grades the epic.

## What the first measurement already says (E6-S1, 2026-09-04)

The prompt was probed twice against T1 approved + T2, before this case existed
(`evals/harness/probe-delta.mjs`, and the result is archived beside the eval results):

| | run 1 | run 2 |
|---|---|---|
| **churn** | **0 of 4** | **0 of 4** |
| contradicted | 1 (T1-R13) ✓ | 1 ✓ |
| modified | 1 (T1-R01) — **expected 2** | 1 |
| added | 2 — **expected 1** | 2 |

**The hard part worked on the first try: churn is zero, twice.** All four labelled changes are
present, but **one of them arrives under the wrong kind**: T1-R06 (the scheduled report going
from PDF-only to PDF-or-CSV for twenty recipients) comes back as `added` rather than
`modified`. It is a change to a requirement that exists, so it names no `req_id` and reads as a
new requirement — which would mint a second requirement about scheduled reports beside the one
it was meant to change.

**That is this case's first job**: grade it, decide whether it is a prompt problem or a
labelling one, and remember that the kind-confusion family (BUG-030/037) is where this project
spends its prompt budget. Do not fix it before the case can see it.

## Technical notes

- **Labels first, and they already exist.** `T2.labels.json` was written on 2026-09-01, before
  any delta code, and it does not move. If the case and the labels disagree, the investigation
  weighs both — and the labels win unless a specific, argued error is found in them.
- **Churn deserves its own denominator**: unchanged requirements in T2 that the delta did not
  mention, over unchanged requirements in T2. Reported as a count and a rate, because a rate
  over four items moves for uninteresting reasons.
- Expect the first measured churn to be non-zero (PRD-E6 says so plainly). **Do not tune the
  prompt inside this story** — measure, then file, then fix under the iteration budget.
- No threshold is invented here beyond the two the PRD states: 4 of 4, and churn = 0.
