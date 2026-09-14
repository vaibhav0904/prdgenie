# Test cases: E6-S3 — version two, without losing version one

```
.\run.cmd review-ui\scripts\verify-version-chain.mjs             the chain, end to end
.\run.cmd review-ui\scripts\negative-control-version-chain.mjs   and it can still go red
.\run.cmd review-ui\scripts\verify-gate.mjs                      supersede has one door too
.\run.cmd review-ui\scripts\verify-apply-delta.mjs               prd_changes, all four kinds
.\run.cmd check-all.mjs                                          every standing check
```

**The row that decides this story is TC5.** Everything else is reporting; either an approval and
the supersede it causes are one transaction, or the version chain has a state in which a PRD has
two current versions and nothing to say which.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **`prd_changes` accepts all four kinds** — `added`, `modified`, `contradicted`, `removed` | 4 of 4 | **Pass** | all four inserted and read back — *asked of the database, not read off the constraint* |
| TC2 | **A delta containing a removal applies**, and the row is read back. Today it takes the whole apply down (**BUG-062**) | version minted | **Pass** | `removed` stored on the fixture version; the migration rebuilds the table, preserving all 110 existing rows |
| TC3 | **Every change row carries the `doc_id` that caused it** — the source, not just the text | per row | **Pass** | all 4 name the fixture document; `applyDelta` writes it from `doc` |
| TC4 | **The closed set of kinds is derived**, from `delta.mjs` and `docs/contracts.md` §10 | derived | **Pass** | 4 kinds derived from the emitter, each checked against the table's own DDL and the contract |
| TC5 | **Approving version N supersedes the previously approved version in the SAME transaction** | one write | **Pass** | `v1 superseded · v2 approved · superseded=1`, and the PRD has exactly **one** approved version afterwards |
| TC6 | **A failure between the two writes leaves ONE approved version, not two** | 1, never 2 | **Pass, and the first draft was wrong** | see below |
| TC7 | **`superseded` is reachable only by a later approval** | refused | **Pass** | direct `UPDATE` → `illegal PRDVersion transition (docs/contracts.md §3)` |
| TC8 | **The `approved` gate is not weakened to allow it** | refused | **Pass** | direct `UPDATE` → `approval requires the review UI sign-off endpoint (ADR 0006)`; `verify-gate` **14/14** unchanged |
| TC9 | **A superseded version's content is byte-identical** to what was approved | identical | **Pass** | reads back `"export a chart as PNG"` after being superseded |
| TC10 | **The changelog is read from `prd_changes`, never recomputed by diffing** | derived | **Pass** | asserted from `versionHistory`'s source — and the regex had to be tightened, see below |
| TC11 | **Version history is browsable** | page + API | **Pass** | `GET /api/prds/:prd_id/history` + `history.html`; counts are over the whole PRD, not the page |
| TC12 | **The predecessor is `derived_from`, not "the previous version number"** | derived_from | **Pass** | `predecessorOf` reads it from the content `applyDelta` wrote; a first version returns null rather than reaching for a lower number |
| TC13 | **The review screen's trend renders a real comparison** where one exists, and still says "no prior version" where none does | both | **Pass, after a fix** | and TC13c below is the fix |
| TC14 | **The pre-existing multiple approvals are reported, not hidden** | figure printed | **Pass** | **4 PRDs, worst `PRD-forgesight` with 20.** Printed every run |
| TC15 | **CONTROL: each rule planted broken goes red** | all red | **Pass** | **8/8**, and two of them failed first — see below |
| TC16 | **Run twice, same answer** (BUG-021) | 2 of 2 | **Pass** | 20/20 twice; control 8/8 twice |
| TC17 | **Every standing check green**, open cards named (BUG-038) | `check-all` | **Pass, one named** | **64 of 65 in 171s** — the only red is BUG-046 |

Rows the plan did not have, each forced by something going red:

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC13c | **A version derived from another compares against it even with no change rows** | available | **Pass** | the trend asked `prd_changes` *first*, so a version whose `derived_from` pointed at a real row reported "no prior version". Found by asking the **endpoint**, not the module |
| TC18 | **The check leaves the marks a real sign-off leaves** — an `approved` event and a review session | audit green | **Pass** | `audit-approvals`: **94 of 94** |
| TC19 | **A green run leaves no fixture behind**; a red one leaves all of it, and says where | 0 rows | **Pass** | `removed again: 5 version(s)` |

## TC6: the first draft passed for the wrong reason

It made `signOff` throw by naming a version that does not exist. That fails at the **approval**,
which proves the approval is guarded and says **nothing** about whether the supersede shares its
transaction — it would have gone on passing with the supersede moved outside `tx()` entirely.

It now injects a temporary trigger that breaks the supersede specifically, while the approval
above it succeeds. What must survive is the approval rolling back too:

```
threw at the supersede: yes · approved 1 -> 1 · v2253 still in_review · v2252 still approved
```

TC6b is its control: with the fault removed, the same call succeeds and supersedes exactly one.

## What the negative control caught in the checker

- **TC10 matched `FROM prd_changes` loosely enough to accept `prd_changes_disabled`.** A word
  boundary is the difference between asserting the table and asserting the first eleven
  characters of its name.
- **NC4's plant healed itself.** Narrowing the CHECK in `schema.sql` did nothing, because
  `migrate()` rebuilds the table whenever its DDL lacks `removed`. **The migration, not the
  schema file, is what guarantees the table's shape** — worth knowing, and the fault now has to
  be injected in both.

## What I broke, and fixed, on the way

- **`audit-approvals` went red on seven versions — all mine.** The check called `signOff()`
  directly, which moves the state without the event and session the endpoint writes. Its own
  message names the two possibilities and this was the second: *"a check that called signOff()
  directly on the live database."* Fixed by leaving the marks, **not** by teaching the audit to
  ignore this PRD — an audit with an exemption for the checks audits the parts nobody worried
  about. The 30 debris versions from earlier runs were removed.
- **`verify-metrics` TC3 went red for the same reason** (92 observations vs 98 state-approved),
  and is green at **94 = 94**. But it is now *latently* wrong for a reason this story created,
  and that is **BUG-064**: the row compares `approved` events against `state='approved'`, and a
  supersede leaves the state while keeping the event. The first real chain turns it red.
- **`negative-control-review-gate` died** locating a span in `server.js` by literal text that
  this story edited. Re-anchored on the shape of the span, so it stops spending its failures on
  unrelated edits nearby.
- **The exclusive lock refused me** mid-sweep, for the fourth time I have reached for that
  mistake — the first time the guard caught it rather than the record catching it afterwards.

## The decision this story had to take, and my answer

**There is no backfill.** Twenty `PRD-forgesight` versions are approved and none superseded, most
of them debris from when `negative-control-review-gate` signed off whatever it found (BUG-045).
Rewriting them into a chain would assert an editorial history that never happened, to make a
screen look tidier. So the invariant *"a PRD has at most one approved version"* is **false today
and becomes true going forward**, by the rule applying at the moment of an approval. TC14 prints
the count, and the history page marks it where the chain is drawn.

## Not tested here, and named

- **C5 (delta correctness).** E6-S5, and it grades what the delta *found*; this story is what
  happens to versions afterwards. The eval gate on this card is `None` for that reason.
- **Whether the twenty stale approvals should ever be cleaned.** Recorded and deliberately left.
- **The other metrics' populations.** M1, M2, M3 and M5 all count something, and `superseded` is
  a new value for all of them. Part of BUG-064, not assumed to be fine here.
