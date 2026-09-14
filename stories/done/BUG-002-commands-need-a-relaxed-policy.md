# BUG-002: Every documented command fails on a default Windows PowerShell

**Found while:** E1-S1 UAT, first real run by Vaibhav
**Severity:** blocker — the UAT, and therefore gate G6, could not be run at all

## Repro

1. Open a normal PowerShell window (no special flags).
2. `cd` into the project.
3. `npm run db:init`

## Expected / Actual

- **Expected:** `schema version 1 at …` / `created 20 tables`.
- **Actual:**

  ```
  npm : File C:\Users\…\node-v24.19.0-win-x64\npm.ps1 cannot be loaded because
  running scripts is disabled on this system.
      + FullyQualifiedErrorId : UnauthorizedAccess
  ```

  Every `npm run …` command in the UAT fails identically. Nothing in the script is
  reachable.

## Root cause

npm on Windows is invoked through `npm.ps1`, a PowerShell script, and PowerShell's
execution policy blocks unsigned scripts by default.

The reason it was never caught: the shell I verified in reports
`Process: Bypass`, set by the harness I run under, while every other scope is `Undefined`
— which means a normal shell falls back to Windows' `Restricted` default. So the same
commands succeeded for me and were impossible for the person the document was written for.
I had a permissive environment and no reason to notice it.

Confirmed alternatives, both working under the default policy: `npm.cmd run …` (cmd shims
are not policy-gated) and plain `node …` (no shim involved at all).

## Fix

**Documented commands use `node` directly.** The project has zero npm dependencies
(ADR 0009), so npm was only ever a script runner — dropping it from the docs costs nothing
and removes the failure entirely:

```
.\run.cmd review-ui/scripts/init-db.mjs
.\run.cmd review-ui/scripts/verify-gate.mjs
```

`package.json` keeps its `npm run` scripts — they are correct, conventional, and work on
macOS, Linux, and any Windows shell with a permissive policy. They are now documented as
the convenience path, not the instruction.

**Deliberately not done:** telling the reader to run
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. Requiring someone to relax a
machine-wide security setting in order to run a five-minute test is a bad trade, and a
stranger would be right to refuse. The fix belongs in our commands, not in their system.

## Lesson

**A command verified only in the author's shell is not verified.** My environment had
`ExecutionPolicy: Bypass` set for me, invisibly, and every instruction I wrote inherited
that assumption.

This is the second failure of the same shape in one story — TC14 was the same mistake about
*knowledge* (I knew there were no n8n workflows, so the script never said so); this is the
same mistake about *tooling*. The common cause is verifying from inside my own context.

The standing practice, now in CLAUDE.md: **documented commands must be the ones that work
in the most restrictive plausible environment**, not the ones that happen to work here. For
Windows that means `node` over `npm`, and no instruction that requires changing a system
policy. E9-S2's run-it-yourself README is where this would have cost the most — a stranger hitting
`UnauthorizedAccess` in minute two may never reach minute five — and its acceptance
criterion (someone follows it verbatim without asking a question) is now backed by two
real incidents rather than good intentions.
