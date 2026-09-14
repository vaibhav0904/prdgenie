# BUG-010: I shipped a UAT I had never run, twice, in the same way

**Found by:** Vaibhav, running E1-S3's UAT step 1
**Severity:** major — it is the second time every documented command has been unrunnable by
the person the documentation was written for, and this time I had already seen the error
myself and worked around it

## Repro

Open the project in VS Code's terminal and type the first command in E1-S3's UAT:

```
node evals/harness/verify-labels.mjs
```

## Expected / Actual

- **Expected:** 11 rows of PASS.
- **Actual:** `The term 'node' is not recognized as the name of a cmdlet, function, script
  file, or operable program.`

## Root cause

Three separate defects, all of which had to be fixed before the card could be honest.

**1. `node` is not on that shell's PATH.** Node was installed by winget in E1-S1, which put
it on the *User* PATH in the registry. A process inherits its environment at launch and
never re-reads it, so any shell — and VS Code, which caches the environment for every
terminal it opens — started before that install cannot see it. The registry is correct; the
running process is stale. Verified: a shell constructed from the current Machine + User PATH
resolves `node.exe` at the winget location and reports v24.19.0.

There is also a **dead entry on the Machine PATH**, `C:\nvm4w\nodejs`, which does not exist.
It is harmless today and would shadow the working install if nvm-for-Windows were ever used.

**2. The negative control in step 2 could not fail.** It ran

```powershell
(Get-Content ...T1.labels.json -Raw) -replace '"quotes": \["', '"quotes": ["ZZZ' | Set-Content ...
```

The labels are pretty-printed, so `"quotes": [` is followed by a newline and the pattern
matches **zero** times. The file was rewritten unchanged, the checker stayed green, and the
step "passed" while testing nothing. Verified by `grep -c` — zero matches.

That is the **fourth** check in this project that could not fail (BUG-001, BUG-003, E1's
TC14, this), and the first one shipped to a user.

The same commands carried a second hazard: `Get-Content | Set-Content` re-encodes UTF-8 as
ANSI in Windows PowerShell 5.1. T1's labels happen to be pure ASCII so nothing would have
broken — but it is the same operation that silently mangled the extraction prompt during
E2-S2, and teaching it as a pattern invites it back.

**3. Step 3's commands were stale.** They ran `produce.mjs` unqualified, which since E2-S1
also triggers generation — nine model calls, ninety seconds and real spend for a step
described as taking one minute — and they never said the review service must be running,
without which every ingest fails.

## Why I did not catch it, which is the part that matters

**I hit this exact error myself, in this session, before Vaibhav did.** My first command
returned `node: command not found`. I diagnosed it as a stale PATH, prefixed
`$env:Path = "...winget path..." + $env:Path` onto every subsequent command, and carried on
for the rest of the session. It never occurred to me that the workaround *was* the finding.

BUG-002's lesson was written as "verify docs in the most restrictive plausible shell, not
yours". I had something stronger available and ignored it: my shell **was** the broken one,
and I made it work for me instead of making the docs work for everyone. A workaround applied
silently is a bug report you decided not to file.

## Fix

- **`run.cmd`** at the project root. It finds `node.exe` via PATH, then winget's install
  location, then Program Files, and runs it with `--env-file-if-exists=.env`. A `.cmd` file
  is not a PowerShell script, so BUG-002's execution-policy problem cannot apply either.
  Both failure modes are now closed by one file.
- **`.\run.cmd` is the documented form.** PowerShell does not search the current directory,
  so a bare `run.cmd` reproduces the original error. Verified.
- **`review-ui/scripts/preflight.mjs`**, run by `.\run.cmd` with no arguments, is step 0 of
  every UAT: Node version, `node:sqlite`, `.env`, the review service, n8n, and whether WF1's
  webhook is actually registered. Each failure prints the command that fixes it.
- **`evals/harness/negative-control.mjs`** replaces the four hand-typed commands, edits the
  labels through JSON rather than a text filter, restores in a `finally`, and asserts the
  restored file is byte-identical.
- **Every printed and documented command was swept** — 7 source files and 21 markdown files.
- **`.gitattributes`** pins `*.cmd` to CRLF (below).

## Three defects found while fixing it, each verified

1. **My first sweep corrupted the source.** Replacing into JavaScript string literals turned
   `'.\run.cmd evals\harness\x.mjs'` into `.` + carriage-return + `un.cmd evals` + tab — the
   backslashes are escape sequences. Repaired to `'.\\run.cmd evals/harness/x.mjs'` and
   checked by running each script and reading its output.
2. **`exit /b %ERRORLEVEL%` inside a `( )` block always returns 0.** Batch expands it when
   the block is *parsed*, not when it runs. `run.cmd` would have swallowed every failing exit
   code — silently breaking `evals/README.md` rule 6, on which every eval gate depends.
   Restructured with `goto`; all four paths now verified to return 1 and 0 correctly.
3. **A batch file with LF line endings breaks cmd.exe.** It seeks by byte offset and lands
   mid-token, producing `'tlocal' is not recognized` from `setlocal`. An editor normalised
   the file and broke it. Rewritten with explicit CRLF and pinned in `.gitattributes`, with
   the rest of the repo pinned to LF because fixture text is byte-compared against stored
   `raw_text` (BUG-006).

## A fifth defect, found by re-running everything at the end

`verify-grading.mjs` went from 12/12 to 10/12 with no code change between the runs. Both
C2 controls — the fabricated-citation auto-fail and its honest counterpart — had become
flaky, and for two independent reasons:

1. **They copied a live SQLite database file-by-file** (`.db`, `-wal`, `-shm`) while the
   review service held it open. Recent commits live in the WAL, and a copied `-shm` is a
   stale index that can make SQLite ignore the WAL. Replaced with `VACUUM INTO`, which
   writes one consistent file.
2. **They planted the citation on the oldest requirement in the database** — which, once
   more documents had been ingested, belonged to a superseded PRDVersion that C2 correctly
   never examines. The plant was invisible and the control proved nothing. Now the victim is
   chosen from a version the current run manifest actually grades.

Both passed twice before failing, and only because the database happened to be freshly
reset. **A check that depends on incidental state is worse than no check**: it teaches you
to re-run until it goes green. This was BUG-001's disease in its fifth costume, and it was
caught only because the fix for BUG-010 meant re-running everything rather than the one
thing that had changed.

## Lesson

**"Verified" means I typed it, in the state the reader will be in, and read the output.**
Not that the code is correct — the code *was* correct. Every one of these failures lived in
the gap between working code and a runnable instruction, and that gap is invisible from
inside a shell you have already fixed for yourself.

The rule that follows: a UAT is not written, it is **transcribed**. Run the steps, paste
what actually came back, and if a step cannot be run, it does not go on the card.
