# Test cases: BUG-047 — three controls write into the real results directory

```
.\run.cmd evals\harness\verify-results-hygiene.mjs    3/3, and red on a planted caller
.\run.cmd evals\harness\verify-grading.mjs            12/12
.\run.cmd evals\harness\negative-control-c3.mjs       green
.\run.cmd evals\harness\negative-control-c4.mjs       green
.\run.cmd evals\harness\negative-control-c6.mjs       green
.\run.cmd evals\harness\negative-control-refusal.mjs  green
```

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **Every control that grades redirects its output** away from the ledger | 0 offenders | **Pass** | `--results=<tmpdir>` in c3, c4, refusal and all five of verify-grading's calls; c6 already had it |
| TC2 | **The reader follows the writer** — a control that grades into a temp directory must also look for its result there | same dir | **Pass** | `readdirSync`/`statSync`/`readFileSync` all moved with the writes; the four `-> path` regexes no longer assume `evals/results/` |
| TC3 | **`evals/results/` is unchanged by a full pass of the controls** | 370 → 370 | **Pass** | counted before and after running all five plus verify-grading |
| TC4 | **The rule is enforced by a derived check**, not a convention | scans, not lists | **Pass** | `verify-results-hygiene.mjs`: 5 caller files found by scanning two directories; nothing typed |
| TC5 | **CONTROL: a caller that does not redirect turns it red and names the file** | red, named | **Pass** | `RESULTS_HYGIENE_INJECT=…` → *"negative-control-planted.mjs (1 of 1 calls unredirected)"*, 2/3 |
| TC6 | **A filename in a list is not a call** | not counted | **Pass** | `verify-judge-isolation` enumerates gate files and `verify-grading` names its instrument; neither runs the stranger, and the detector requires `execFileSync`/`spawnSync`/`node(` on the line |
| TC7 | **A declaration must describe a real caller** | 1 of 1 | **Pass** | TC3 in that check. `produce.mjs` was declared and **does not grade** — it prints the command in a message — so the declaration was removed rather than kept as a rule protecting nothing |
| TC8 | **S2-TC7 no longer depends on ambient state** | seeded | **Pass** | it now grades once into its own temp directory to establish a baseline; it used to read the real `evals/results/`, so *"leaves the earlier one untouched"* passed vacuously whenever nothing had been left there |
| TC9 | **The controls still pass** — the redirect changed where they write, not what they assert | all green | **Pass** | c3, c4, c6, refusal, verify-grading 12/12 |

## What this found beyond the card

- **`produce.mjs` was declared as a publisher and does not call the stranger at all.** The
  declaration came from my own reading of a `grep` hit that was a `console.log`. The check
  caught it on its first run (TC3), which is the argument for a declaration that has to keep
  describing something real.
- **`verify-grading` had a fifth ungraded call** — `grade.mjs` with no case, used to prove the
  "nothing to grade" message. It writes nothing, but leaving one caller outside the rule is how
  a rule becomes advice.
- **S2-TC7 was reading ambient state** — the same shape as BUG-045, in a different file.

## Outcome

`evals/results/` now holds only measurements somebody decided to keep, and a check says so on
every run. **The ledger is 370 files before and after a full pass of the controls**, where one
`check-all` sweep previously added sixteen.
