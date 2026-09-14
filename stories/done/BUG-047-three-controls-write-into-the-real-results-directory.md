# BUG-047: Three controls write into the real results directory

**Severity:** minor · the seam to fix it already exists and is documented
**Found:** 2026-09-04, first run of `check-all.mjs`
**Area:** `evals/harness/negative-control-c3.mjs`, `-c4.mjs`, `-clause.mjs`, `verify-grading.mjs`

## What happens

One `check-all.mjs` run left **16 untracked files** in `evals/results/`:

```
2026-09-04-C2.md/.json  C2-run2  C2-run3
2026-09-04-C3.md/.json  C3-run2  C3-run3
2026-09-04-C4.md/.json  C4-run2
```

They are the by-products of controls grading a case two or three times — baseline, planted,
restored. **Nothing references them and nobody will read them**, but they arrive on every run,
so `git status` fills with noise and a real change gets buried in it.

## Why it is a small card and not a shrug

`evals/results/` is where **archived evidence** lives: a dated result file per eval-gated story,
cited from its card. A directory that also collects a dozen throwaways per check run stops being
a place you can trust to hold only things somebody decided to keep.

## The fix is already designed — three files just don't use it

`grade.mjs` has the seam, with this comment on it:

> `--results=` exists for the same reason `produce.mjs` has `--manifest=`: a negative control
> should not write into the real results directory.

**`negative-control-c6.mjs` passes it. `-c3`, `-c4`, `-clause` and `verify-grading` do not.**
So the fix is to pass `--results=` a temporary directory in the three (four, counting
verify-grading) that don't, and then to make the omission impossible to repeat:

1. Pass `--results=<tmp>` from every control that grades.
2. **Then assert it**, derived not typed: a check that every script in `evals/harness/` matching
   `negative-control*` or `verify-*` either passes `--results=` or is declared as one that does
   not grade. One control remembering and three forgetting is what a convention with no check
   looks like.
3. `verify-grading.mjs` already cleans up some sidecars after itself (an earlier fix). Prefer
   *not writing them* over *deleting them afterwards* — a cleanup that fails leaves the mess,
   and a cleanup that over-reaches deletes evidence.

## Not fixed here

Found by `check-all.mjs` on its first run — the fifth card it produced, and the only one that is
about the harness's own tidiness rather than about something being wrong. The 16 files were
removed rather than committed; they regenerate on demand.

## Fixed, 2026-09-04

**`evals/results/` is 370 files before and after a full pass of the controls**, where one
`check-all` sweep previously added sixteen.

Four callers now pass `--results=` a temporary directory — `negative-control-c3`, `-c4`,
`-refusal`, and all five of `verify-grading`'s grade calls — and **the reader follows the
writer** in each: the `readdirSync`/`statSync` that finds "the newest result" moved with the
writes, and the four `-> path` regexes no longer assume `evals/results/`.

**The rule is now enforced rather than remembered.** `evals/harness/verify-results-hygiene.mjs`
scans both script directories for invocations of the stranger — derived, nothing typed — and
requires each to redirect unless it is declared as publishing a real measurement. `--results=`
existed since E2 with a comment saying exactly what it was for, and one control in four used
it; that is what a convention with no check looks like.

**It can go red**: `RESULTS_HYGIENE_INJECT` plants a caller that does not redirect, and TC2
fails naming the file.

### Three things it found that were not on this card

- **`produce.mjs` was declared as a publisher and does not call the stranger at all.** My
  declaration came from a `grep` hit that turned out to be a `console.log` printing the command
  for a human. The check caught it on its first run — which is the argument for a declaration
  that must keep describing something real, rather than a comment nobody re-reads.
- **A fifth ungraded call** in `verify-grading` — `grade.mjs` with no case, used to prove the
  "nothing to grade" message. It writes nothing, but a caller outside the rule is how a rule
  becomes advice.
- **`S2-TC7` was reading ambient state.** It counted files in the real `evals/results/` and
  compared "the first report" byte-for-byte — so *"leaves the earlier one untouched"* passed
  **vacuously** whenever nothing had been left there. It now seeds its own baseline in its own
  directory. Same shape as **BUG-045**, in a different file, found by fixing something else.

### A filename in a list is not a call

The first version of the check counted any quoted `evals/harness/grade.mjs`, which made
`verify-judge-isolation` (which enumerates gate files) and `verify-grading` (which names the
instrument it verifies) look like offenders. The detector now requires `execFileSync`,
`spawnSync`, `process.execPath` or `node(` on the same line. **A check that fails on helpful
prose trains people to ignore it.**
