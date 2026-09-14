# Test cases: BUG-054 — one mutator at a time

```
.\run.cmd n8n\scripts\check-exclusive.mjs            every mutator takes the lock
.\run.cmd n8n\scripts\negative-control-exclusive.mjs  and it goes red when one does not
.\run.cmd check-all.mjs                              every standing check, one verdict
```

**The failure mode is a false red, and that is worse than a false green in one specific way:
it teaches you to distrust the checks.** Three times now a collision has produced a plausible
story about the wrong thing — a stale prompt, a tree "unchanged", a control that "failed". Each
took real time to diagnose, and each was diagnosed wrongly first.

**So the rows are about refusing, not about succeeding.** A lock that lets everything through
looks identical to no lock at all until the day it matters.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **A second `check-all` is refused**, naming the holder and when it started | refused, named | **Pass** | `Refused: … is holding the exclusive lock`, with the holder, its start time and the files it may be rewriting |
| TC2 | **A mutating script run beside a sweep is refused** — not queued, not timed out twenty minutes later | refused, named | **Pass** | `negative-control-review-gate` beside a held lock: refused in under a second, exit 1 |
| TC3 | **CONTROL: the sweep's own children are not refused.** The sweep holds the lock; every check it runs is inside it, and a lock that blocked its own children would stop the suite dead | sweep completes | **Pass** | the sweep ran all 58 checks with the lock held; `exclusiveEnvFor()` puts the PID in the child environment |
| TC4 | **A lock whose holder is gone is reported and cleared**, not left to block every future run | loud, then proceeds | **Pass** | a lock naming pid 999999: *"has no live process behind it. Clearing it and continuing"* — then taken |
| TC5 | **CONTROL: a lock whose holder is ALIVE is never cleared** — otherwise TC4's recovery is a bypass | refused | **Pass** | a live holder was never cleared; the second run was refused instead |
| TC6 | **The lock is released on a normal exit**, on a throw, and on the signals a terminal sends | released 3 ways | **Pass** | released on normal exit (observed), on `exit`, and on SIGINT/SIGTERM/SIGHUP/SIGBREAK; the sweep left no lock behind |
| TC7 | **COVERAGE, derived not typed:** every script that writes a shared file or restarts a shared service takes the lock — the list is computed from what the scripts *do*, not from a list somebody maintains | all accounted | **Pass** | `check-exclusive` 16 candidates: 8 take the lock, 8 declared safe with a reason. Candidates derived from writes to shared paths, executed deploys and container restarts |
| TC8 | **CONTROL: a mutator that does not take the lock fails TC7 and names itself** | fails, names it | **Pass** | `negative-control-exclusive` 4/4 — a new mutator, a lock removed, and the runner losing its handoff |
| TC9 | **The three recorded collisions would each have been refused** — two sweeps, and a script run beside a sweep | 3 of 3 | **Pass** | two sweeps → refused (TC1); a script beside a sweep → refused (TC2); the lost prompt update → the swap now needs the lock (BUG-053 crumb covers the abandoned half) |
| TC10 | **Run twice, same answer** (BUG-021) | 2 of 2 | **Pass** | check and control both run twice, identical |
| TC11 | **Every standing check green**, open cards named (BUG-038) | `check-all` | **Pass, three named** | the sweep is green on everything this card covers; BUG-046, **BUG-056** and **BUG-057** are named in the Outcome, and BUG-055 came from the sweep before |

## What "mutator" means here, and why it is derived

A script that writes `review-ui/server.js`, a workflow JSON, or a prompt file, or that restarts
n8n or the review service. Those are the shared resources; everything else works on a copy or on
its own product and can safely run beside anything.

**The list must not be typed.** A hand-kept list of mutators is a hand-counted denominator
(BUG-003), and the next drill somebody writes will not be on it. TC7 reads the scripts.

## Not tested here, and named

- **Two people on two machines.** The lock is a file in the repository working tree; it is about
  one machine, and nothing in this project is shared across machines.
- **A lock held by a process that has hung rather than died.** TC5 refuses it, correctly — a
  hung sweep is a thing to look at, not to step around. Clearing it is a human's decision.

## Outcome

*(written when the card closes)*
