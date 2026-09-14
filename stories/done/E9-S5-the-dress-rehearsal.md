# E9-S5: The dress rehearsal

**As a** submitter
**I want** the whole thing performed once, end to end, before any of it is sent
**So that** the first person to run it from scratch is me and not the stranger

## Acceptance criteria

- [ ] **Clean database** → produce all nine fixtures → **all six cases pass three times**,
      with the spread published, not the best run.
- [ ] End to end on **≥5 documents across ≥3 doc types**.
- [ ] **Export hygiene green**, with its negative control run once.
- [ ] The run-it-yourself README followed **verbatim**, from a fresh clone, against a fresh n8n import.
- [ ] The release checklist completed and dated: demo, deck, video, export, Q1, Q2.
- [ ] **Anything that fails becomes a BUG card**, not a note to self and not a quick fix
      applied mid-rehearsal.

## Depends on
- E9-S1, E9-S2, E9-S3, E9-S4

## Eval gate
- All six cases, three runs each, spread published.

## Technical notes

- **Go receive what you ship** (BUG-013/014/015): every check made from inside the working
  copy passes. The rehearsal is only worth anything if it runs from the clone.
- C4, C5 and C6 must exist by this point or the "all six cases" criterion is a lie. If any
  is unbuilt, the criterion changes to name exactly which, in writing, before the rehearsal
  — not after it.

---

## Performed 2026-09-05, the night before release

**It found something, which is the only outcome that makes a rehearsal worth doing.**

### Against the acceptance criteria, one row at a time

| Criterion | Result |
|---|---|
| Clean database → produce all fixtures | **NOT DONE.** Reason recorded in `deliverables/RELEASE.md`: the figures on slide 7 describe this database, and emptying it tonight leaves the deck quoting numbers that no longer exist. Backed up to `data/backup/` first; the rehearsal ran against the real one |
| **All six cases pass three times, spread published, not the best run** | **C1: PASS ×2, FAIL ×1.** C2, C3, C4, C6: PASS ×3. C5 has no dated result and did not contribute |
| ≥5 documents across ≥3 doc types | **green** — 2,301 documents across transcript, notes, email, feature_brief |
| Export hygiene green, control run once | **green** — PASS, and its control 10/10 |
| README followed verbatim from a fresh clone | **NOT DONE — deferred by Vaibhav** |
| Release checklist completed and dated | **done** — `deliverables/RELEASE.md` |
| **Anything that fails becomes a BUG card** | **BUG-068 filed.** No fix applied mid-rehearsal |

### What the spread said

```
C1 verdict:  PASS x2, FAIL x1        <- the verdict itself moved between runs
T4 precision:  62.5 | 85.7 | 85.7    floor 75    STRADDLES THE FLOOR
T1 recall:     86.7 | 93.3 | 93.3    floor 80    settled
```

Two days ago this same instability sat on **T1**, was filed as BUG-040, and was closed. T1 is
settled now and T4 is not. **C1 is not unstable in a fixture — it is unstable in a run.** Filed as
BUG-068, and deliberately not fixed: re-running until it passes is what `spread.mjs` exists to
prevent, and a prompt change needs a graded re-run.

**Slide 9 now leads with it.** A release that shows its own eval case moving between runs is
worth more than one that quotes a median and hopes nobody re-runs it.

### Three other things the rehearsal caught, all before they shipped

1. **Slide 8 claimed every checker has a negative control.** Counted: 51 checkers, 20 with a
   script, 12 with a case inside, **19 with neither**. BUG-067, and `check-control-coverage` now
   prints the sentence the deck is allowed to say.
2. **Four separate counts drifted in one evening** — the check count twice, the story count, the
   open-bug count. `build-deck.mjs` now **refuses to write** if a count on a slide disagrees with
   the folders. It caught the fourth one itself.
3. **The script's hand-typed timings were fiction** — 5:55 typed, 9:26 measured. Timing is now
   derived from the words at a stated 150 wpm.

### What the rehearsal did NOT establish, said rather than implied

The stranger's actual first five minutes: a fresh clone, an empty schema, a shell where `node` is
not on the PATH, a README followed literally. **That is still untested**, it is the largest open
risk on the release checklist, and it is the one thing on this page most likely to be the first
thing a stranger hits.
