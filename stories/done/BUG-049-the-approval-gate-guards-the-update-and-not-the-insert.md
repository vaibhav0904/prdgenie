# BUG-049: The approval gate guards the UPDATE and not the INSERT

**Severity:** **blocker** — it is the project's headline guarantee, and it is one SQL statement wide
**Found:** 2026-09-04, mid E6-S2, while looking for a way to build routing fixtures without a full sign-off
**Area:** `review-ui/schema.sql` · `prd_versions_state_machine` · the hard rule in `CLAUDE.md` and ADR 0006

## What happens

`prd_versions_state_machine` is declared `BEFORE UPDATE OF state ON prd_versions`. It refuses
every road to `approved` that it can see, and `verify-gate` has proved that nine times over.

It never sees an INSERT.

```sql
INSERT INTO prd_versions (prd_id, version_no, trace_id, state, content)
VALUES ('<any prd>', 9999, 'probe', 'approved', '{}');
```

On a copy of the live database this **succeeds**. There is now an approved PRDVersion that no
human signed off, with no `signoff_marker` row, no review session, and no review actions —
indistinguishable in every query from one that went through the gate.

## Why the existing checks all stayed green

Every one of them approaches from the direction the trigger watches.

- `verify-gate` and `verify-signoff` take a version that already exists and try to **move** it.
- The UI, `assemble.mjs` and `applyDelta` all insert `draft` or `in_review` and then transition,
  because that is the honest path — so no test ever had a reason to insert `approved`.

**The gate was tested through the door it opens.** Nothing tested the wall beside it. This is
the same shape as BUG-005 — *a door never opened is not a door* — turned inside out: an entrance
nobody thought to try is an entrance nobody guarded.

## Why it matters more than the exploit does

Nothing in the codebase writes this statement, and the review service is the single writer
(ADR 0002), so there is no known path that reaches it today. That is not the point. The claim
this project makes to a stranger is:

> **No PRDVersion reaches `approved` except through the review-UI sign-off endpoint** — not from
> n8n, not SQL. Trigger-enforced.

The second sentence is currently false. A guarantee that holds because no caller happens to
write the bypass is a convention, which is exactly the thing the trigger exists to replace.

## The fix

1. A **`BEFORE INSERT ON prd_versions`** trigger admitting only `draft` and `in_review`. A
   version is born unreviewed; there is no legitimate caller that inserts an approved one, and
   `applyDelta` (`in_review`) and `assemble` (`draft`) are both unaffected.
2. The same treatment for **every other state-guarded table**, derived rather than typed: find
   the guards that are `BEFORE UPDATE` and ask each one what an INSERT would do.
   `source_documents_raw_text_immutable` and `prd_versions_content_immutable` are about *change*
   and are correct as they are; a `state` is different, because the row can be born wrong.
3. A control that **inserts** `approved` and requires the refusal — added to `verify-gate`, whose
   claim is the one that was overstated.
4. Re-read the hard rule in CLAUDE.md against what the schema actually enforces, and, if the two
   still differ anywhere, fix the schema rather than soften the sentence.

## Not yet known

Whether any row in the live database arrived this way. The fix should carry a **census**: every
`approved` version without a matching `signoff_marker` row, counted and named, before the trigger
goes in. Expected zero — and an expectation is not a measurement.

## Outcome — 2026-09-04

**Fixed, and the claim is true again.** `prd_versions_born_unreviewed` (`BEFORE INSERT ON
prd_versions`) admits `draft` and `in_review` and refuses everything else. `verify-gate` 14/14
twice; `audit-approvals` clean twice; `verify-assembly`, `verify-apply-delta`, `verify-signoff`
and `verify-review-gate` all unchanged, which is the point — the two states the product
actually writes still go in.

**The check refused to run before the trigger existed**, which is how it should have behaved
all along:

```
GATE VERIFICATION FAILED before any case ran.
  MISSING TRIGGER: prd_versions_born_unreviewed
```

### The census asked the wrong question first, and it mattered

This card told me to count approved versions with no `signoff_marker` row. That count came back
**53 of 53** — every approval in the project, apparently unauthorised.

It was the question that was wrong. `signOff()` inserts the marker, performs the `UPDATE`, and
**deletes the marker inside the same transaction**: it is a one-shot token authorising exactly
one version, not a receipt that survives. "Approved with no marker" is the normal state of every
version that has ever been approved.

The marks a real sign-off actually leaves are the `approved` event the endpoint writes and the
review session the decisions live in. On those: **53 approved, 53 events, 53 sessions, zero
without.** No bypass has ever happened.

**A census that indicts everything has asked the wrong question, not found a catastrophe.** It
is worth saying plainly because the first number looked exactly like the disaster the card was
written to be afraid of, and the temptation to believe a frightening number that confirms your
own hypothesis is the whole reason this project writes controls.

### The coverage question, derived rather than typed

Fixing one column is a claim about one column. `verify-gate` TC13 now reads every
`BEFORE UPDATE OF <column>` guard out of the schema and requires each to answer *"what would an
INSERT do here?"* — either with an insert-side trigger on the same table naming that column, or
with a stated reason. **3 guards, 1 answered by trigger, 2 by declaration, 0 unanswered**, and
both lists print on every run so a new guard cannot join quietly.

The two declarations are `prd_versions.content` and `source_documents.raw_text`, and they are
correct as they are: immutability is a rule about *change*, and the insert is where the first
value legitimately arrives. **A `state` is different, because the row can be born wrong.**

### The census is now a standing audit

`audit-approvals.mjs` — picked up by `check-all` from the `audit-` prefix with no edit — asserts
that every approved version carries a sign-off event and a review session, and refuses to pass
on an empty database. **A card that says "expected zero" has measured nothing**; this measures
it on every sweep. It also says out loud what it cannot see: a version approved and then
deleted leaves no trace either way, so it describes the database as it stands and not its
history.

### What it does not claim

The trigger is a guarantee about the future; the audit is a measurement of the past. Neither is
a substitute for the other, and the schema comment says so.
