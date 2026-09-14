# BUG-053: An unattended sweep runs a paid control that rewrites the shipping prompt

**Severity:** **major** — six paid extraction runs and two deployments of a non-shipping prompt,
every time somebody runs the standing checks
**Found:** 2026-09-04, E6-S2, from `git status` showing two files modified that nobody had touched
**Area:** `check-all.mjs`'s declaration list · `evals/harness/negative-control-clause.mjs`

## What happens

`check-all.mjs` derives its list by prefix — `check-`, `verify-`, `negative-control`, `audit-`,
`recompute-` — and 23 scripts are declared not-a-check with a printed reason. Everything that
calls a provider or mutates deployed state is in that list:

```
drill-provider-failures.mjs   mutates the provider binding, same reason
judge-sweep.mjs               CALLS A PAID PROVIDER. Never in a check that runs unattended
spread.mjs                    CALLS A PAID PROVIDER three times over
probe-delta.mjs               CALLS A PAID PROVIDER — a probe
```

**`negative-control-clause.mjs` is not.** It matches the `negative-control` prefix, so the sweep
runs it — and what it does is:

1. rewrite `n8n/prompts/extract-requirements.md` to an older wording,
2. run `sync-prompts.mjs` and **re-import WF2 into n8n**,
3. produce T3 **three times** through the real provider,
4. restore the prompt, re-sync, re-import, and produce three more times.

That is six paid extraction runs and two deployments of a **non-shipping prompt** into the live
workflow, every time somebody runs the standing checks.

## The failure it actually produced

An interrupted sweep leaves the old prompt deployed. `git status` afterwards:

```
 M n8n/prompts/extract-requirements.md      (21 lines: the OLD bullet, restored)
 M n8n/workflows/WF2-generate-prd.json      (the old prompt, hashed in)
```

**The repository and the running n8n were left carrying the prompt the control had swapped in
to prove a defect with.** Nothing said so. Every extraction run after that point — including
anything a person did by hand — would have used it, and the only sign was two files in
`git status` that look like somebody's edit.

### A correction, because this card first said something stronger and wrong

It first claimed the control **fails to restore even on a sweep that completes**, on the
evidence of an 831-second sweep that printed its report and left the old prompt in place:

```
FAIL  verify-prompt-hygiene.mjs   1 fixture quote(s) appear verbatim in a prompt:
        extract-requirements.md  <-  T3.labels.json T3-R07  "Let's call it cut for now."
```

**A later sweep, run alone, restored cleanly** — 810 seconds, `git status` empty on both files,
`verify-prompt-hygiene` green. So the non-restore was not a plain completion bug. Two sweeps
were overlapping (BUG-054), and the mechanism is a lost update: A swaps, B snapshots the
*already-swapped* prompt as its "shipping" state, A restores, B restores to A's swap. The
evidence belongs to BUG-054, and the severity here comes back to major.

What survives, undisputed and on its own: **a sweep of standing checks spends money and deploys
a non-shipping prompt into the live workflow.**

## The fix

1. **Declare it**, with the same sentence its neighbours carry: *CALLS A PAID PROVIDER six
   times and deploys a non-shipping prompt; run deliberately, never in a sweep.*
2. **Make the restore survive an interruption.** A control that deploys must restore in a
   `finally`, and — because a process can be killed outright — it should **write a breadcrumb
   before it swaps** and refuse to start while one is present, the way the judge sweep's lock
   works. An interrupted swap should be loud on the next run, not silent in `git status`.
3. **Assert the shipping prompt is deployed** as a standing check: `hashOf(prompt file)` equals
   the hash in the shipped WF2 node, and both equal what n8n is running. BUG-044 built exactly
   this comparison inside the control; it belongs outside it, where it protects everything.
4. Ask the same question of every other `negative-control-*`: which of them deploy, and which
   spend? The prefix earns a script a place in the sweep; **what it does should earn it the
   right to stay there.**

## Why this outranks its blast radius

The money is pennies. The exposure is that **a sweep of checks changed what the product runs**
and left it changed. This project's whole claim is that the artefact that ships is the artefact
that was verified (BUG-041); a control that can quietly leave a different prompt deployed is a
hole straight through it.

## Outcome — 2026-09-04

**Both deploying controls are held out of the sweep, and the sweep gained a check that covers
the hazard for nothing.**

```
HELD OUT (2) — a prefix would have run these; a declaration keeps them out:
  negative-control-error-routing.mjs  mutates WF0 and WF2, re-imports, restarts n8n four
                                      times, and TC15 costs a fixture of model calls
  negative-control-clause.mjs         CALLS A PAID PROVIDER six times and DEPLOYS a
                                      non-shipping prompt into WF2; run deliberately
```

`check-deployed-prompts.mjs`: **9 prompts, 9 stamps, every one matching**, in under a second.
Its control is 5/5.

### The finding this card did not go looking for

**Declaring the control out changed nothing.** `--list` showed it in both lists and the sweep ran
it anyway:

```js
const toRun = scripts.filter((s) => RUNS.some((r) => r.test(s.file)));   // DECLARED not consulted
```

`DECLARED` read like an exclusion list and was only an **accounting** one — it existed so
`uncovered` came out right. The drills have never been in the sweep because `drill-` matches no
prefix in `RUNS`, not because anyone declared them; **the mechanism had never been asked to
exclude anything, so nobody had noticed it could not.** `toRun` now subtracts declarations, and
`HELD OUT` prints what a prefix would have run and a declaration keeps out — an exclusion nobody
can see is worse than a check that fails.

### Removing a control removes what it proved

So the sweep gains the cheap half. `check-deployed-prompts` compares every `n8n/prompts/*.md`
against every `PROMPT_VERSION` stamp in the shipped workflows, both sides derived from the
directory rather than listed — a tenth prompt is covered the day it is written, and a stamp with
no prompt behind it is as loud as a prompt with no stamp.

**And a breadcrumb for the case the hashes cannot see.** A swap rewrites the prompt and re-stamps
the workflow together, so a run killed between those two points leaves a tree that looks
perfectly consistent and a model reading text nobody chose. `n8n/.deploy-in-progress.json` is
dropped before the first mutation and swept up in the same `finally`; the control refuses to
start on one, and the standing check fails on one. **An abandoned swap is loud on the next run
instead of silent in `git status`.**

### Its own control found the bug in it

The crumb path was built by stripping a trailing `/workflows` with a regex. `join()` returns
backslashes on this platform, the pattern never matched, and the check looked for the crumb in a
directory that cannot exist. **TC5 caught it on the first run** — which is the argument for
writing the check and its control together rather than one after the other.

### The sweep: 54 of 56

- **BUG-046** — `verify-statement-style`, open since 2026-09-04.
- **`negative-control-review-gate` — `exit null`, and not a defect.** I ran that script on its own
  to diagnose a line I had just read, while the sweep was running the same script. Both mutate
  `server.js` and restart the service; they waited on each other until `check-all`'s 600-second
  timeout killed one. **Run alone immediately afterwards: exit 0, every row green.** The sweep's
  elapsed time went from 975s to 10,720s for the same reason.

That is BUG-054's third occurrence, all three caused by me, all three diagnosed as something
else first — and it widens that card's fix from *one sweep at a time* to **one mutator at a
time**. Taken next.
