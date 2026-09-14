# BUG-015: The ignore rule that excludes the database commits it anyway

**Found while:** cloning the pushed repo from GitHub to see what a stranger actually receives
**Severity:** major — four megabytes of live database state, including source document text,
tracked in a repo whose `.gitignore` says the database is excluded

## Repro

```
git clone https://github.com/vaibhav0904/prdgenie
ls data/
```

## Expected / Actual

- **Expected:** `data/` empty, or absent. The database is derived state, rebuilt from
  fixtures by `init-db.mjs` and `produce.mjs`.
- **Actual:**

```
prdgenie.db-shm
prdgenie.db-wal
```

`prdgenie.db` itself is correctly absent. `prdgenie.db-wal` is **4,124,152 bytes** and
contains, verifiably, `ForgeSight`, `Northwind`, `Marcus` and `SAML` — transcript text and
extracted requirements, in binary.

## Root cause

```
data/*.db
data/*.db-journal
```

The service runs SQLite in **WAL mode**, where committed transactions are appended to
`<name>.db-wal` and only later checkpointed into `<name>.db`. The ignore list was written
for rollback-journal mode, so it names `-journal` — a file this database never creates —
and misses `-wal` and `-shm`, the two that exist.

The rule is not wrong about `prdgenie.db`. It is wrong about where the data is.

## Why it matters more than it looks

Three separate problems, none of which announce themselves:

1. **It reads as excluded.** `.gitignore` has a line about the database, with a comment
   explaining why the database is excluded. Nothing suggests a second file holds the same
   rows.
2. **It is the largest thing in the repository** — bigger than every source file, document
   and fixture combined — so the clone a stranger is asked to make is dominated by a binary
   artefact that is meant to be regenerated.
3. **It changes on every run.** A file that is rewritten by merely opening the app makes
   `git status` permanently dirty, which trains the reader to ignore it — and that is how
   the next thing that should not be committed gets committed.

No credential was exposed: the WAL was searched for `sk-`, `AIza` and `gho_` and contains
none, and provider keys never reach this database by design (ADR 0004). The fixture text it
does contain is already in the repo in the open, under `evals/datasets/`. The damage is
hygiene, not disclosure — but the mechanism would have leaked exactly as quietly if the
rows had been someone's real meeting.

## Fix

`data/*.db*` — one glob covering the database and every sidecar SQLite may create, present
or future, with the reasoning written next to it.

History rewritten to drop both blobs. The repository was four minutes old, private, with
one author and no clone but the verification one, so a rewrite costs nothing here; it would
not have been available a day later, which is the argument for looking at the first push
rather than the tenth.

## Negative control

Verified by cloning **from GitHub**, not from the local repo and not by reading
`.gitignore` — `git status` was clean throughout, on a working tree where both files were
tracked.

## Lesson

**An ignore rule is a claim about the filesystem, and it expires when the storage engine
changes.** ADR 0009 chose `node:sqlite`, which opens databases in WAL mode; nothing went
back to re-read a `.gitignore` written before that choice, because the rule still mentioned
the right directory and the right product and looked maintained.

Third defect found at the door in the same ten minutes, after BUG-013 and BUG-014, all by
the same move: **stop describing what you are shipping and go receive it.** Every one was
invisible from inside the working copy and obvious from outside it.
