# E3-S5: Every link resolves, every score recomputes

**As a** builder
**I want** case C3 proving the PRD's structure is internally sound and its scores are code-computed
**So that** "the model never writes a number that ships" is a checked property rather than a claim in a document

## Acceptance criteria

- [ ] `evals/cases/C3-structure-and-determinism.md` exists with threshold **100%**, its
      auto-fail rule stated separately, the stories it gates, `Automated? YES`, and a
      *re-run when:* list.
- [ ] Every story resolves to a feature; every feature to an epic; every acceptance
      criterion to a `req_id`; every `req_id` to a stored requirement. **No orphans.**
- [ ] Every stored `priority_score` equals RICE recomputed from its stored factors, exactly.
- [ ] The assembled PRD validates against the schema.
- [ ] **No requirement is silently lost between extraction and assembly** — the count in
      equals the count placed plus the count explicitly reported unclustered.
- [ ] Dated result file with per-item diffs and a `## Verdict:` line.
- [ ] **Negative control run once**: corrupt a stored score, confirm C3 goes red naming the
      feature, restore.
- [ ] Coverage asserted: subjects checked vs subjects existing, failing on a gap (BUG-003).

## Depends on
- E3-S2, E3-S3

## Eval gate
- **C3** — this story builds it and must leave it passing at 100%.

## Technical notes

- 100% with no partial credit, because every one of these is a *deterministic* property.
  A structural link either resolves or it does not; there is nothing to average.
- The recomputation check is what would catch a second writer of `priority_score`. If it
  ever fails, the bug is almost certainly "something other than `/internal/score` wrote
  this", not "the arithmetic is wrong".
- C3 must **recompute independently**, not call `/internal/score` and compare its output to
  itself. A case that calls the function it grades agrees with itself by construction —
  the same disease as BUG-001.

---

## DONE — 2026-09-02. C3 exists, is green three times, and prints what it cannot fail on

`evals/cases/C3-structure-and-determinism.md` + `evals/harness/cases/C3.mjs`, registered
in the stranger.

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| Orphans | 0 | 0 | 0 |
| Scores recomputing exactly | all | all | all |
| Verdict | PASS | PASS | PASS |

**Zero factors is a FAIL, not a pass.** "Every score matched" over no scores is not a result,
and this case has one job that only exists when there is something to recompute — the
BUG-017 lesson, applied while writing rather than after being bitten.

**The case reports a figure it is forbidden to fail on**: requirements per feature. It came
back **1.00** on the first real run and is now BUG-026. The paragraph explaining why that
number is printed was written into the case **before** there was anything embarrassing to
print.

**Negative control, both directions, 6 of 6:** a 0.1 change to one stored score turns C3 red
and names the feature; restoring it turns it green. *"The model never writes a number that
ships"* is now a sentence with a check behind it that has been observed rejecting a wrong
number.
