# Test cases: BUG-049 — the approval gate guards the UPDATE and not the INSERT

```
.\run.cmd review-ui\scripts\verify-gate.mjs        the gate, from both directions now
.\run.cmd review-ui\scripts\audit-approvals.mjs    every approval, against the marks one leaves
.\run.cmd check-all.mjs                            every standing check, one verdict
```

**The defect is a direction nobody approached from.** `verify-gate` has proved nine times that
an approved state cannot be *reached*; nothing asked whether one could be *born*. So the rows
below are mostly about the second question, and about making the first one's claim honest.

**A control that only inserts `approved` proves too little.** The trigger must refuse the state
it is there to refuse and admit the two a version legitimately starts in — otherwise a trigger
that rejected every insert would pass.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **CENSUS FIRST, before the trigger exists.** Every `approved` version, counted against the marks a real sign-off leaves: an `approved` event from `review_ui` naming it, and a review session | 0 without | **Pass** | **53 approved, 53 events, 53 sessions, 0 without** — taken before the schema changed |
| TC2 | The census asks the **right** question | question stated | **Pass** | my first census asked for a `signoff_marker` row and indicted **53 of 53**. The marker is a one-shot token, inserted and deleted inside `signOff`'s transaction — see below |
| TC3 | **`INSERT` with `state='approved'` is refused**, with a message naming ADR 0006 | ABORT | **Pass** | `verify-gate` TC10: *"a PRDVersion is born draft or in_review (ADR 0006): approval is the review UI sign-off endpoint, and superseded is a transition"* |
| TC4 | **`INSERT` with `state='superseded'` is refused** | ABORT | **Pass** | `verify-gate` TC11 |
| TC5 | **CONTROL: `INSERT` with `draft` and with `in_review` still succeed** | both admitted | **Pass** | `verify-gate` TC12a/TC12b — without these, a trigger that refused every insert would pass TC3 and TC4 and stop the product dead |
| TC6 | **Every existing writer still works** — assembly (`draft`), a park (`draft`, degraded), `applyDelta` (`in_review`) | 3 of 3 | **Pass** | `verify-assembly` 15/15, `verify-apply-delta` 15/15 |
| TC7 | The **UPDATE** guard is untouched | 9 of 9 | **Pass** | `verify-gate` TC3–TC9c, all nine unchanged |
| TC8 | **Sign-off through the endpoint still approves** | approves | **Pass** | `verify-gate` TC6, `verify-signoff` 9/9, `verify-review-gate` 23/23 |
| TC9 | **COVERAGE, derived not typed:** every `BEFORE UPDATE OF <column>` guard answers *"what would an INSERT do here?"* — by a trigger on the same table naming that column, or by a declaration | all accounted | **Pass** | `verify-gate` TC13: **3 guards found, 1 answered by trigger, 2 by declaration, 0 unanswered** |
| TC10 | **The immutability guards are correct as they are**, and say why | declared | **Pass** | printed every run: `prd_versions.content` and `source_documents.raw_text` — *"immutability is a rule about CHANGE; the insert is where the first value arrives"* |
| TC11 | **The trigger reaches an existing database**, not only a fresh one | present in live DB | **Pass** | `CREATE TRIGGER IF NOT EXISTS` in `schema.sql`, applied by `init-db.mjs`; `verify-gate` **refused to run at all** until it was there — *"MISSING TRIGGER: prd_versions_born_unreviewed"* |
| TC12 | **CLAUDE.md's hard rule is true again** | rule matches schema | **Pass** | *"Trigger-enforced on **both** UPDATE and INSERT: a version is born `draft` or `in_review`"*, and `docs/contracts.md` §3 carries the table of who writes which state |
| TC13 | **Run twice, same answer** (BUG-021) | 2 of 2 | **Pass** | `verify-gate` 14/14 twice, `audit-approvals` clean twice |
| TC14 | **Every standing check green**, open cards named (BUG-038) | `check-all` | **Pass, open cards named** | **53 of 56 in 905s**; the three reds are BUG-045, BUG-046, BUG-048, all open — see below |

### One row the plan did not have

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC15 | **The census becomes a standing audit**, not a sentence in a card | runs every sweep | **Pass** | `audit-approvals.mjs`, picked up by `check-all` from the `audit-` prefix with no edit. **55 approved, 55 events, 55 sessions.** A card that says *"expected zero"* has measured nothing |

## The question the first census got wrong

The card told me to count approved versions with no `signoff_marker` row. That census reported
**53 of 53**, which read like every approval in the project had bypassed the gate.

It had not. `signOff()` inserts the marker, does the `UPDATE`, and **deletes the marker in the
same transaction** — it is a one-shot token authorising exactly one version, not a receipt. So
"approved with no marker" is the normal, correct state of every version ever approved, and the
census was asking whether a door was closed by looking for the key still in the lock.

**A census that indicts everything has asked the wrong question.** The right marks are the ones
a sign-off leaves *behind*: the `approved` event the endpoint writes, and the review session the
decisions were recorded in. On those, 53 of 53 were clean.

## What `check-all` says, exactly

**56 checks, 53 green in 905s.** The three reds are open cards, and none of them is this fix:

- **BUG-046** — `verify-statement-style`, a promoted example in one of T1's 68 statements.
- **BUG-048** — `negative-control-clause` can no longer demonstrate its own claim.
- **BUG-045** — `verify-delta` TC0a, now persistently red: the versions this card's own
  verification approved on the live database outrank its fixture. Taken next.

**BUG-045 was seen again, outside the sweep**, and the card now records it: running
`verify-signoff` before `verify-delta` by hand reproduces `verify-delta`'s TC0a failure, because
`verify-signoff` approves a version on the **real** database and `verify-delta`'s copy inherits
it. The dependence is not on `check-all`'s ordering — it is on whatever approved a version most
recently, anywhere. The same card now also asks whether a check should be walking through the
one gate this project calls human-only, unattended, at all.

## Not tested here, and named

- **Whether anything ever exploited it.** The service is the single writer and no code writes
  that statement, but the census measures the database's *current* contents, not its history.
  An `approved` version deleted before today would leave no trace either way. TC1 says what is
  true now; it cannot say what was true on Tuesday, and `audit-approvals` says so in its own
  output rather than leaving the reader to assume otherwise.
- **Other databases.** n8n's own SQLite is not covered by this and never should be.
