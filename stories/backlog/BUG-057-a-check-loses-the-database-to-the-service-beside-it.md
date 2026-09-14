# BUG-057: A check loses the database to the service beside it

**Severity:** minor · one check, one run, and it recovered on its own
**Found:** 2026-09-04, inside the first sweep to hold the exclusive lock
**Area:** `review-ui/scripts/verify-gaps.mjs` · `review-ui/db.mjs` connection settings

## What happens

```
FAIL  review-ui\scripts\verify-gaps.mjs
      Error: database is locked
```

Run alone, immediately afterwards: **exit 0**.

The review service holds `data/prdgenie.db` for the whole session, and the checks open it too.
SQLite in WAL mode allows concurrent readers and one writer, so this is a **writer meeting a
writer** — the check wanted the write lock while the service had it, and gave up instead of
waiting.

## What it is not

Not BUG-054. The exclusive lock is about two *scripts* rewriting each other's files; this is one
script and a long-running service contending for a database, and no lock between checks would
have prevented it. The sweep that produced it held the lock correctly and released it.

## The fix

1. **A busy timeout.** `node:sqlite` accepts one; without it a contended write fails instantly
   rather than waiting the few milliseconds the other writer needs. Set it once, in `db.mjs`,
   where every caller inherits it.
2. **Then ask which checks write at all.** A check that only reads should be opening the
   database read-only, and a read-only connection cannot lose this race. `verify-gaps` looks like
   one of those.
3. **Do not fix it by retrying in the check.** A retry loop in one file is a workaround that the
   next file will not have.

## Not yet known

Whether any earlier red in this project's history was this and was diagnosed as something else.
The message is distinctive enough to grep for in the result files, and that is worth doing when
this is taken.
