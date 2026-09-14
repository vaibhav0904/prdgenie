# BUG-062: A delta that removes a requirement cannot be applied

**Severity:** major · the whole apply fails, and it has never happened
**Found:** 2026-09-05, reading `delta.mjs` and `schema.sql` before starting E6-S3
**Area:** `review-ui/schema.sql` `prd_changes` · `review-ui/delta.mjs` `applyDelta`

## What happens

`applyDelta` builds a change row for each of the four delta kinds, `removed` among them:

```js
changes.push({ kind: 'removed', ref, old_text: r.statement, new_text: null, ... });
```

`prd_changes` will not accept it:

```
removed: REFUSED — CHECK constraint failed:
  kind IN ('added','modified','contradicted','new_open_question')
```

Asked of the database rather than read off the constraint — a `prd_changes` insert of
`kind='removed'` on the live schema is refused today.

The insert is inside `applyDelta`'s transaction, so the failure is not "one change is lost":
**the whole delta application rolls back**, no version is minted, and WF3 sends the run to WF4
with whatever the throw looked like. A document that says "we are dropping the CSV export" takes
down the follow-up it was supposed to produce.

## Why nothing has broken

No delta has produced a removal. On the live database:

```
added 100 · modified 9 · contradicted 1 · removed 0
```

`docs/contracts.md` §10 is explicit that this is the rare one — *"`removed` requires the document
to say so. What silence means: nothing."* — so the corpus has simply never exercised it. The
code, the contract and the prompt all know about `removed`; only the table does not.

## The fix

1. `prd_changes.kind` admits `removed`. The CHECK cannot be altered in place, so it is a table
   rebuild in `migrate()` — the `judge_sample` rebuild is the pattern, and the rows are a record,
   not a cache, so they are copied rather than dropped.
2. A test that applies a delta **containing a removal** and reads the row back. A call returning
   `ok` is not a row that changed (BUG-026/032), and this bug is exactly a write that a passing
   caller would never have noticed.
3. Whatever asserts the closed set of change kinds must derive it from `docs/contracts.md` §10
   or from `delta.mjs`, not restate it — the contract, the code and the table disagreed for a
   whole epic and nothing was looking.

## Closed by

**E6-S3**, whose first acceptance criterion already requires `prd_changes` to carry
`added / modified / contradicted / removed`. Carded separately because it is a defect in shipped
E6-S2 behaviour with its own severity, and a story that stalls should not take the record of it
down too.

## Not a fix

Dropping `removed` from `delta.mjs`. The contract names it, the prompt is asked for it, and a
delta that cannot say "this requirement is gone" makes a living PRD a document that only ever
grows.

---

## Closed 2026-09-05 by E6-S3

`prd_changes` is rebuilt in `migrate()` — the CHECK admits `removed`, a `doc_id` column arrives,
and **all 110 existing rows are copied across** rather than dropped, because they are a record of
what a delta decided and not a cache.

`verify-version-chain` TC1/TC2 insert one and read it back, asking the database rather than
reading the constraint. TC4 derives the closed set from `delta.mjs` and requires the table *and*
`docs/contracts.md` §10 to answer for every kind it finds — which is what nothing was doing while
the three disagreed for a whole epic.

**The negative control found something the card did not know.** Its first plant narrowed the
CHECK in `schema.sql` and the check stayed green: `migrate()` rebuilds the table whenever its DDL
lacks `removed`, so the fault was repaired on the way in. **The migration, not the schema file, is
what guarantees the table's shape.** NC4 now injects into both.
