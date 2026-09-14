# Test cases: BUG-053 — a paid control that rewrites the shipping prompt

```
.\run.cmd n8n\scripts\check-deployed-prompts.mjs            the file is the export
.\run.cmd n8n\scripts\negative-control-deployed-prompts.mjs  and it goes red when it should
.\run.cmd check-all.mjs --list                               what the sweep holds out, and why
.\run.cmd check-all.mjs                                      every standing check, one verdict
```

**Declaring it out is the easy half.** The hard half is that removing a control removes what it
proved — so the sweep has to gain something cheap that covers the hazard the expensive control
was accidentally protecting against: *the prompt in the repository is the prompt in the export.*

**And the declaration has to actually exclude.** It did not, which is the finding below.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **Which controls deploy or spend, derived not typed** — scan every `negative-control-*` for an import of `import-workflows`/`sync-prompts` and for a paid producer | the real answer | **Pass** | **two**: `negative-control-clause` (deploys + 6 paid runs) and `negative-control-error-routing` (mutates WF0 and WF2, restarts n8n ×4, TC15 costs a fixture). c3/c4/c6/refusal only call `grade.mjs` |
| TC2 | Both are **declared out**, with the reason naming what they cost | held out | **Pass** | `HELD OUT (2)` in `--list`, each with its sentence |
| TC3 | **A DECLARATION EXCLUDES.** Before this card it did not: `DECLARED` was only an accounting list, and the drills stayed out because `drill-` matched no prefix — not because they were declared | 58 → 56 | **Pass** | declaring the two changed nothing until `toRun` learned to subtract them. See below |
| TC4 | The exclusion is **printed**, not silent — an unrun check that nobody can see is worse than one that fails | `HELD OUT` block | **Pass** | printed on every `--list` |
| TC5 | **`check-deployed-prompts` covers the hazard for nothing**: every `n8n/prompts/*.md` against every `PROMPT_VERSION` stamp in the shipped workflows, both sides derived | 9 and 9 | **Pass** | 9 prompts, 9 stamps, all matching, in under a second |
| TC6 | **CONTROL: a prompt edited without a re-sync is caught** | DRIFT, named | **Pass** | `negative-control-deployed-prompts` TC2 |
| TC7 | **CONTROL: the mirror** — a stamp no file produces | orphan, named | **Pass** | TC3: `WF2-generate-prd.json → Build extraction call (deadbeef0000)` |
| TC8 | **CONTROL: it cannot pass by finding nothing** | refused | **Pass** | TC4: *"read 0 prompt(s) and 0 stamp(s) — the extractor is broken"* |
| TC9 | **A killed run is loud on the next one.** The `finally` restores on a throw; nothing covered being killed | crumb + refusal | **Pass** | `n8n/.deploy-in-progress.json` dropped before the first mutation, swept in the `finally`; the control refuses to start on one, and `check-deployed-prompts` fails on one |
| TC10 | **CONTROL: the crumb fires while every hash still matches** — the case hashes cannot see, because a swap rewrites both sides together | red on a consistent tree | **Pass** | TC5 |
| TC11 | **Run twice, same answer** (BUG-021) | 2 of 2 | **Pass** | check and control both run twice, identical |
| TC12 | **Every standing check green**, open cards named (BUG-038) | `check-all` | **Pass, two named** | **54 of 56**: BUG-046, and one `exit null` that is BUG-054 colliding — green alone. See the Outcome |

## TC3, which is the finding this card did not expect

Declaring `negative-control-clause.mjs` changed nothing. `--list` showed it in **both** lists and
the sweep ran it anyway:

```js
const toRun = scripts.filter((s) => RUNS.some((r) => r.test(s.file)));   // DECLARED not consulted
```

`DECLARED` read like an exclusion list and was only an **accounting** one — it existed to make
`uncovered` come out right. The drills have never been in the sweep because `drill-` matches no
prefix in `RUNS`, not because anybody declared them; the mechanism had never been asked to
exclude anything, so nobody had noticed it could not.

The two are now the same fact, and `HELD OUT` prints what a prefix would have run and a
declaration keeps out.

## What TC10 found in the check it was written for

The crumb path was built by stripping a trailing `/workflows` with a regex. `join()` on this
platform returns backslashes, the pattern never matched, and the check looked for the crumb in a
directory that cannot exist. **The control caught it on its first run** — which is the argument
for writing the two together rather than in sequence.

## Not tested here, and named

- **Whether n8n is running the prompt the export contains.** `check-deployed-prompts` compares
  the repository with the shipped JSON. The container matching them is a deploy step, and
  `import-workflows.mjs` is what reports on it. The check says so in its own output.
- **The lock.** Two sweeps overlapping is what actually lost the restore, and that is BUG-054.
  A breadcrumb makes an abandoned swap loud; it does not stop two runs from making one.
- **Whether the held-out controls still work.** They are run deliberately now, per story, like
  the drills. `negative-control-clause` currently fails to demonstrate its own claim — that is
  BUG-048, open, and unaffected by this card.

## Outcome

*(written when the card closes)*
