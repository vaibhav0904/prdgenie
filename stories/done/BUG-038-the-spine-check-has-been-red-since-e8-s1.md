# BUG-038: the spine check has been red since E8-S1, and nothing said so

**Severity:** minor (the code is fine) · **major** as a process finding
**Filed:** 2026-09-03, during E7-S5, by running an audit the story did not need to run

## What happens

```
.\run.cmd n8n\scripts\check-spine.mjs
FAIL  2 reference(s) to a door-only field on the spine:
  review-ui/metrics.mjs:65  authorship
  review-ui/metrics.mjs:66  authorship
```

M1 excludes PM-authored requirements from the grounding rate and **shows what it excluded**,
split by why (`first_party` versus edited). That is a recorded fact being carried to a screen,
which is exactly what `check-spine.mjs` says is allowed — it is not a branch, nothing behaves
differently, and the numbers would be identical without the split.

**The code needs one `// spine-ok:` comment with its reason. That is the whole repair.**

## The finding worth keeping is not the missing comment

`check-spine.mjs` has been red since E8-S1 was committed (2026-09-03, `e5d9a27`), and E8-S1,
S2 and S4 all shipped green on **their own** verifiers without anyone running this one. The
story that changed `review-ui/` ran `verify-metrics`, `verify-weekly` and the render audit —
all of which it wrote — and never ran the standing check that its change could break.

**A verifier a story does not own is a verifier a story does not run.** Every audit in
`n8n/scripts/` is written to be run by hand and there is no command that runs them all, so
"the audits pass" has quietly meant "the audits I remembered pass".

## The fix, when this card is taken

1. Add the `spine-ok` reason to the two lines in `review-ui/metrics.mjs` (the reason: M1's
   exclusion is *reported*, split by authorship, and nothing downstream reads the split).
2. **Then the actual repair:** one command that runs every standing check — the five in
   `n8n/scripts/` plus the verifiers in `review-ui/scripts/` — and reports a single verdict, so
   a story cannot pass by running only what it wrote. E9-S5's dress rehearsal needs exactly
   this list anyway, and building it there would be building it after it was needed twice.
3. Do not weaken the check to accommodate step 1. The exemption carries a reason or it is not
   an exemption (E5-S4).

## Not folded into E7-S5

E7-S5 found it and stopped, per the rule: a defect found mid-story is a card, at once. The
story records the red check as a known, carded state rather than quietly making it green,
because a story that fixes what it finds is a story whose evidence cannot be read afterwards.

## Fixed, 2026-09-04 — and the runner found four red checks on its first run

**Step 1, the trivial half.** Two `spine-ok:` comments on the M1 exclusion in
`review-ui/metrics.mjs`, with the reason: the split is *reported*, nothing branches on it, and
the rate is identical without it. `check-spine.mjs` is green — **19 spine files, no reference to
`doc_type`, `source_channel` or `authorship`** — and `recompute-metrics` confirms M1 is
unchanged at 98.46%.

**Step 2, the repair that mattered.** `check-all.mjs` at the repo root runs every standing
check in `n8n/scripts/`, `review-ui/scripts/` and `evals/harness/` and reports one verdict.

**Its list is derived, not typed.** Every `.mjs` in those three directories is either RUN (by
prefix: `check-`, `verify-`, `negative-control`, `audit-`, `recompute-`) or DECLARED with a
reason, and **a script that is neither fails the run**. A runner with a hand-written list stops
covering whatever is added after it, which is the same failure one level up. `--list` prints the
whole accounting: 49 run, 23 declared, 0 uncovered.

Declined deliberately, each with its reason on the file: the five **drills** (they take a
provider or the service away and put it back), and everything that **calls a paid provider** —
`produce`, `spread`, `judge-sweep`, the two probes. Those are run on purpose, never on a sweep.

### What it found immediately, which is the whole argument

**45 of 49 passed. Four checks were red and nobody was running any of them.**

| card | check | what was wrong |
|---|---|---|
| **BUG-043** | `verify-doors` | **the form door has been shut since 2 September** — accepts multipart, answers `200`, stores nothing; `Map form input` throws and WF4 has been recording it the whole time |
| **BUG-044** | `negative-control-clause` | the control for **C2** cannot run since the prompt was restructured — so C2's green has demonstrated nothing since 3 September |
| **BUG-045** | `verify-delta` | **13/13 alone, red in company** — its fixture is whatever the previous checks left in the database |
| **BUG-046** | `verify-statement-style` | one extracted statement carries the room's example (*"such as weekly on Monday morning"*) |

**One of those is a door that was down for two days behind an HTTP 200.** The card that says
*"the audits I remembered pass"* was not being rhetorical.

### A note for whoever runs it

`check-all.mjs` exits non-zero on any failure — but **piping it through `tail` returns `tail`'s
exit code**, which is the `exit /b %ERRORLEVEL%` trap in a new costume (BUG-010). Read the
verdict line, not the shell's.

### Consequently

- E9-S5's dress rehearsal now has its check list, built once rather than twice.
- **E6-S2 was moved back to the backlog** (its test plan kept). It had been started; building a
  routing story on four red checks would be building on exactly the silence this card is about.
