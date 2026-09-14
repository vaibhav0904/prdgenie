# BUG-001: verify-gate.mjs recreates the trigger it is supposed to verify, so it can never fail

**Found while:** E1-S1, running a negative control against the gate verification
**Severity:** major

## Repro

1. `npm run verify:gate` — passes 9/9, exit 0.
2. `npm run db:query -- sql "DROP TRIGGER prd_versions_state_machine"`
3. Confirm it is gone: `npm run db:query -- sql "SELECT name FROM sqlite_master WHERE type='trigger'"`
   — `prd_versions_state_machine` is absent.
4. `npm run verify:gate` again.

## Expected / Actual

- **Expected:** with the gate's trigger deleted, TC3, TC5, TC7 and TC8 all fail loudly and
  the command exits non-zero. The whole point of the script is to notice this.
- **Actual:** 9/9 passed, exit 0. Re-querying `sqlite_master` afterwards shows the trigger
  is back — the script recreated it.

## Root cause

`verify-gate.mjs` calls `initSchema()` at module load, for convenience, so it can be run
against a fresh database. `schema.sql` is written with `CREATE TRIGGER IF NOT EXISTS`, so
that call silently restores any missing trigger *before* the assertions run. The script
therefore verifies a database it has just repaired, and reports on a state that may not be
the state anyone else will run against.

The failure is worse than a false pass. The gate is the one guarantee this whole product
rests on (ADR 0006), and this script is what proves it — including in the UAT, in E1-S6,
and in the demo video.

## Fix

`verify-gate.mjs` no longer calls `initSchema()`. It asserts the four expected triggers
exist, by name, and exits non-zero naming any that are missing before it runs a single
transition case. Creating schema is `npm run db:init`'s job; verifying it is this script's,
and the two must not be the same command.

Re-proven by repeating the negative control: with the trigger dropped, the script must now
exit non-zero.

## Lesson

**A check that repairs what it checks is always green, and an always-green check is the
same as no check.** Setup and verification must be separate commands — the same split the
eval harness already makes between `produce` and `grade` for exactly this reason.

The generalizable practice: a check is not trustworthy until it has been *seen to fail*.
Every verification script in this project gets a negative control run once — break the
thing deliberately, confirm the check goes red, restore. That is now a standing step in
`/implement` verification, and it is what caught this.
