# BUG-054: Two sweeps at once fail each other, and report it as defects

**Severity:** major · the failure mode is **false red**, which is worse than false green in one
specific way: it teaches you to distrust the checks
**Found:** 2026-09-04, E6-S2, by starting a second `check-all` before the first had finished
**Area:** `check-all.mjs`

## What happens

`check-all.mjs` has no lock. Two sweeps run happily side by side, and several of the checks it
runs are not read-only:

- `negative-control-clause.mjs` swaps the extraction prompt and re-imports WF2 (BUG-053),
- `negative-control-judge.mjs` and `negative-control-strata.mjs` plant a defect in a tree and
  assert it is **gone afterwards**,
- the drills are excluded for exactly this reason — but the controls were not.

Run two and they trip over each other. The observed report:

```
49/55 passed in 611s

FAILED:
  negative-control-judge.mjs    FAIL  NC1  the check passes on the real tree  — exit=1
  negative-control-strata.mjs   FAIL  NC6  and the tree is unchanged afterwards — the plant
                                            was never written  — exit=1
  negative-control-clause.mjs   FAIL  1 fixture quote(s) appear verbatim in a prompt
  verify-prompt-hygiene.mjs     FAIL  1 fixture quote(s) appear verbatim in a prompt
```

**None of those four is a defect in the thing it names.** `verify-prompt-hygiene` was reading
the *older* prompt that the other sweep's clause control had deployed a moment earlier;
`negative-control-strata` found "the tree unchanged" because the other sweep had already
changed it back. Four red rows, four wrong stories, and every one of them plausible enough to
chase.

## The fix

1. **A lock, taken at the top and released at the end**, with the PID and start time in it —
   the same shape `openSweep` uses for the judge, and for the same reason: two samplers must
   not draw the same rows. A second sweep refuses with *"a sweep started at HH:MM is still
   running"* and exits non-zero.
2. **A stale lock names itself.** A killed sweep leaves one behind, so the refusal has to say
   how to clear it and what may have been left half-done — which is where BUG-053's breadcrumb
   belongs too.
3. Consider whether the mutating controls should run **serialised inside one sweep** rather
   than merely one-sweep-at-a-time. They already do run serially; the lock is about sweeps.

## The lesson, which is the reusable part

A check that is safe alone is not safe in company. **BUG-045 said this already** — *"a check
that passes alone and fails in company"* — about fixtures left behind by the previous check.
This is the same sentence with a second meaning: not a fixture left behind, but a fixture
taken away underneath. The suite is a shared resource and nothing was treating it as one.

## Third occurrence, 2026-09-04, and it widens the fix

While BUG-053's sweep was running I ran `negative-control-review-gate.mjs` **on its own** to
diagnose a red line I had just read in the sweep's output. The sweep was running that same
script at that moment. Both mutate `review-ui/server.js` and restart the service, so they waited
on each other until `check-all`'s 600-second per-check timeout killed one:

```
FAIL  review-ui\scripts\negative-control-review-gate.mjs
      exit null
```

`exit null` is a signal, not an assertion. Run alone immediately afterwards: **exit 0, every row
green.** And the sweep's own elapsed time went from 975s to **10,720s** — the collision did not
just kill one check, it dragged the rest.

**So the lock is not only about two sweeps.** `negative-control-review-gate`, the drills, and
`negative-control-clause` each mutate a file the others need; two of *any* of them at once is the
same failure. The lock has to be about **one mutator at a time**, and a sweep has to hold it for
its whole run:

1. `check-all` takes a lock naming its PID and start time, and releases it at the end.
2. Each mutating script takes the same lock, so running one beside a sweep is refused with a
   sentence rather than a timeout twenty minutes later.
3. A lock whose PID is gone is reported loudly and then cleared — the crumb from BUG-053 is what
   catches an abandoned *swap*, and `check-deployed-prompts` runs in every sweep to report it.

**Three occurrences, all caused by me, all diagnosed as something else first.** That is the
argument for the lock: the failure is silent, plausible, and expensive, and the person best
placed to notice it is the one least able to.

## Outcome — 2026-09-04

**One mutator at a time, enforced, and the coverage of that rule derived rather than listed.**

`exclusive.mjs` holds a lock file naming its holder, PID and start time. `check-all` takes it for
the whole sweep and **hands it to every child through the environment**, so a mutating check
inside the sweep proceeds while the same script started beside the sweep is refused:

```
Refused: check-all.mjs is holding the exclusive lock.
  started 2026-09-04T16:32:48.491Z, pid 6752
  it may be rewriting: review-ui/server.js
```

Nine scripts take it: `check-all`, `import-workflows`, the four drills, both deploying controls,
and `negative-control-tripwire`.

### The two things the checks found in my own work

**`negative-control-tripwire.mjs` was not on my list of mutators.** It rewrites
`review-ui/server.js` and restarts the service twice. `check-exclusive` derived it from what the
file does and named it — which is the entire argument for deriving the list rather than keeping
one. A register of mutators would have been wrong on the day it was written.

**The runner took the lock and never handed it down.** One of my patch scripts reported "already
patched" against the wrong anchor, so `exclusiveEnvFor()` was imported and never called. Every
mutating check inside the sweep would have queued behind its own parent and been refused —
**a lock that stops the thing it protects looks exactly like a working lock** until the sweep
goes red for a reason nobody can place. `check-exclusive` asserts the handoff by name, and TC4 of
the control plants its removal.

### And the sweep got thirteen times faster

```
54 of 58 passed in 75s
```

The same sweep took **975s** two cards ago and **10,720s** during the collision. Holding the two
paid, deploying controls out (BUG-053) took six model calls and four n8n restarts off every run;
the lock took the collisions off. A suite that finishes in a minute is one somebody runs before
committing, which is the whole point of having it.

### What the lock does not fix, said out loud

The final sweep was green on everything this card is about — no `exit null`, no interleaving, the
lock released cleanly — and red on three things it is not:

- **BUG-046** — `verify-statement-style`, open.
- **BUG-056** (filed) — `verify-strata` TC19c asserts a property of **one shuffle of one real
  judge sweep**. A stochastic claim tested with a single sample: the green runs are as
  uninformative as the red one.
- **BUG-057** (filed) — `verify-gaps` hit `database is locked`. One script against a long-running
  service, contending for a write lock. **No lock between checks would have prevented it**, and
  saying so is the point: the fix is a busy timeout and a read-only connection, not a wider
  mutex.

**A previous sweep also produced BUG-055** — M5's control can no longer tell a wrong derivation
from a right one, because the figure is published at a precision that swallows a 26% error and
its denominator is 51 verification fixtures out of 71 versions.

### The shape of the whole thing

Three collisions, all caused by me, all diagnosed as something else first — a stale prompt, a
tree "unchanged", a control that "failed". **A false red is worse than a false green in one
specific way: it teaches you to distrust the checks.** The lock removes the cause; the two cards
above are what was left once the noise stopped.
