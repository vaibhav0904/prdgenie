# Test cases: E6-S2 — the second document takes the other road

```
.\run.cmd review-ui\scripts\verify-routing.mjs        the fork, the event, and the reason
.\run.cmd review-ui\scripts\verify-apply-delta.mjs    what the next version says, and what it kept
.\run.cmd n8n\scripts\check-node-references.mjs       every $('Node') names a node that exists
.\run.cmd n8n\scripts\check-internal-endpoints.mjs    every endpoint a workflow dials is really there
.\run.cmd n8n\scripts\check-spine.mjs                 the fork reads product state, nothing else
.\run.cmd check-all.mjs                               every standing check, one verdict
```

**The routing gate is the interesting test, not the happy path.** A fork that sends the second
document to WF3 is easy; a fork that sends it to WF2 *because the first PRD is not approved
yet* is the one that can be wrong in a way nobody notices until a PM has two drafts and no
idea which one is the product.

**And the second interesting test is what the new version KEEPS.** A modification that mints a
new `req_id` breaks the link to every review decision that referenced the old one, and would
inflate M2 next cycle by making every carried-over item look new — a metric moving because of
a bug in versioning, which is the worst kind of green.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **WF3 exists, is active, tagged `prdgenie`**, and routes its failures to WF4 | active, routed | **Pass** | `verify-routing` TC1: `active=true tagged=true errorWorkflow=prdgenieWF4error` |
| TC2 | **WF3 calls a provider only through WF0** — asserted from the shipped workflow, not from the diagram | 0 direct calls | **Pass** | `verify-routing` TC2: 5 http nodes, 0 to a provider host, 1 WF0 call |
| TC3 | **A product with no approved version sends its second document to WF2** — the normal path | WF2 | **Pass** | `verify-routing` TC3: `generate: product forgesight has no approved version yet` |
| TC4 | **The same document, same product, after approval, goes to WF3** | WF3 | **Pass** | `verify-routing` TC4: `delta: product forgesight has an approved version (1540)` |
| TC5 | **TC3 and TC4 are the same document in the same environment**, one thing varied: whether an approved version exists | one variable | **Pass** | 14 approved versions superseded on a DB copy — a legal transition, nothing else touched |
| TC6 | The precondition is **computed server-side** at call time, never read from a stored flag (contracts §4) | computed | **Pass** | the answer changed with no restart, no invalidation; `source_documents` has no route column |
| TC7 | **The routing decision is an event** carrying the trace, and it names *why* — readable later without re-deriving it | event stored | **Pass** | live door knock, `routed` event: `product routing-probe-… has no approved version yet` |
| TC8 | **CONTROL: the fork can send the other way.** Force the precondition false and TC4's document takes WF2, with the recorded reason changing to match | flips | **Pass** | `verify-routing` TC8: both route and reason change together |
| TC9 | **A modification keeps its `req_id`** — the carried requirement is the same row, not a new one wearing the same words | same id | **Pass** | `verify-apply-delta` TC9/9b/9c: identity in `origin_req_id`, all carried rows findable from the old version |
| TC10 | **Added requirements are appended** and get new ids that collide with nothing | appended | **Pass** | `verify-apply-delta` TC10: an addition is its own origin |
| TC11 | **Contradicted requirements are marked**, not deleted — a contradiction is a thing to review, not a thing to lose | marked | **Pass** | `verify-apply-delta` TC11: row carried unchanged, `prd_changes` row written |
| TC12 | **Everything the delta did not mention is carried through byte-identical** — asserted by comparing statements and citations, not by counting rows | identical | **Pass** | `verify-apply-delta` TC12: 12 untouched requirements, 0 drift |
| TC13 | **CONTROL: a planted change to an untouched requirement fails TC12 and names it** | fails, names it | **Pass** | `verify-apply-delta` TC13 |
| TC14 | The new version lands in **`in_review`**, through the same transition every other version uses, and the trigger still refuses `approved` | in_review | **Pass** | `verify-apply-delta` TC14/14b; UAT v1554 `in_review` |
| TC15 | It reaches **the same inbox by the same route** — the PM does not learn a second place to look | one inbox | **Pass** | `GET /api/prd-versions` is one query with no mention of `derived_from`, `prd_changes` or delta |
| TC16 | **An empty delta parks with a reason** and mints no version. A version whose changelog is empty is a version nobody needs to read | parked, 0 new | **Pass** | `verify-apply-delta` TC16: `delta_empty`, 1392 → 1392 |
| TC17 | Any new reason code is in the **closed set, in `docs/contracts.md`, and in every process that enforces it** (BUG-036's deploy-ordering hazard) | all three | **Pass, with a card** | `delta_empty` and `baseline_not_approved` in all three. Found two that predate this story and are in none: **BUG-050** |
| TC18 | **`check-spine.mjs` stays green** — the fork reads product state; it must not branch on `source_channel`, `doc_type` or `authorship` | PASS | **Pass** | 19 spine files, 0 references |
| TC19 | **Run twice, same answer** (BUG-021) | 2 of 2 | **Pass** | `verify-routing` and `verify-apply-delta` run twice, identical verdicts; both work on a fresh DB copy each run |
| TC20 | **Every standing check green**, not only the ones this story wrote (BUG-038) | `check-all` green | **Pass, two open cards red** | **53 of 55**, run alone. Both reds are open cards, neither this story's: **BUG-046** and **BUG-048**. Named, not counted — see below |

### Rows this story added to its own plan

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC3b | The caller is told **the same road that was recorded** | envelope = event | **Pass** | `verify-routing` TC3b |
| TC7b | **CONTROL: TC7 read the live database, not the copy it took first** — otherwise "no event" and "wrong database" look identical | absent from copy | **Pass** | the copy predates the door knock, as it must |
| TC3c | **Both branches of the fork call the workflow they name.** A fork whose branches end on a No-Op decides and does nothing | 2 calls | **Pass** | `Dispatch: WF3 delta` → `/webhook/delta`, `Dispatch: WF2 generate` → `/webhook/generate` |
| TC3d | The door can be exercised **without paying for a model**, in one named node | `dispatch` | **Pass** | `Run the pipeline?` reads `dispatch`, defaulting to true |
| TC21 | **UAT: a real follow-up document, through the real door, end to end** | new version | **Pass** | transcribed below |

## The UAT, transcribed

`T2` (4,140 chars), posted to `http://localhost:5678/webhook/ingest` as product `forgesight`,
no `dispatch` flag — the path a PM takes.

```
HTTP 200 in 6.2s
{ "envelope_version": "1.0", "product_id": "forgesight", "doc_id": "DOC-2026-1456",
  "trace_id": "cd8ea012-f917-41ea-a1ff-31b86db53215", "component": "delta", "status": "ok",
  "payload": { "prd_version_id": 1554, "base_version_id": 1540, "state": "in_review",
               "carried": 7, "changes": 3,
               "counts": { "added": 1, "modified": 2, "contradicted": 0, "removed": 0 },
               "dropped": [ { "kind": "added", "why": "no citation could be located in the new document" } ] } }
```

The trace, from the database rather than from the reply:

```
11:48:13  ingested       door    {"doc_id":"DOC-2026-1456","doc_type":"transcript","chars":4140}
11:48:13  routed         door    {"route":"delta","approved_prd_version_id":1540,
                                  "route_reason":"product forgesight has an approved version (1540)"}
11:48:19  delta_applied  delta   {"base_version_id":1540,"prd_version_id":1554,"carried":7,"changes":3}

prd_versions   1554  in_review
prd_changes    1554-REQ-003 modified · 1554-REQ-007 modified · 1554-REQ-008 added
identity       7 of 7 carried requirements still carry a 1540- origin
```

**The first attempt failed, and that is the more useful half.** WF4 caught it and named the node:

```
dead_lettered  error_handler  workflow_error — Apply the delta (code writes the version)
                              — The resource you are requesting could not be found
```

`/internal/apply-delta` was in `server.js` and not in the **process**, which had been running
since before the route was written. Fifteen checks were green because every one of them imports
the module instead of knocking on the door. `check-internal-endpoints.mjs` exists because of
this, and it found two more things nobody was looking for (**BUG-051**).

## What `check-all` says, exactly

**55 checks, 53 green, run with nothing else touching the repository.** Both reds are open
cards, and neither belongs to this story:

- **BUG-046** — `verify-statement-style`: a promoted example (*"such as weekly on Monday
  morning"*) in one of T1's 68 statements. Filed 2026-09-04, open. Its 62 occurrences in the
  database all sit in versions minted before E6-S2 existed, and **none is in the version this
  story's UAT created** — checked, not assumed.
- **BUG-048** — `negative-control-clause`: the control can no longer demonstrate its own claim.
  Open since 2026-09-04.

**Getting to that number took three sweeps and produced two more cards.** The first two overlapped
— my error — and several checks in the sweep are not read-only: they plant defects, swap prompts
and re-import workflows. They tripped over each other and reported the cleanup as failures:
`negative-control-strata` found "the tree unchanged", `verify-prompt-hygiene` found a fixture
quote in a prompt nobody had edited. **Four red rows, four wrong stories** (BUG-054), and
underneath them one real one: a sweep of standing checks spends money and deploys a
non-shipping prompt (BUG-053). The lost update between the two sweeps left that prompt running
in n8n until a `git checkout` and a re-import put it back.

`check-all` also went red on **one thing this story had just caused**, fixed before it closed:
`verify-judge-isolation` — the new `negative-control-node-references.mjs` **named WF6**, in a
typed list of workflow filenames. The list now reads the directory, which removes the reference
and turns a hand-typed denominator into a derived one in the same edit. *A check nobody wrote
for this story caught this story's file on its first sweep, which is the entire argument for
`check-all`.*

## Not tested here, and named

- **How good the delta is.** C5 (E6-S5) grades it against `T2.labels.json`. This story is about
  where the document goes and what the next version keeps; the quality of the proposal was
  measured in E6-S1 and will be graded in E6-S5.
- **The review screen for a delta** is E6-S4. TC15 asserts the version arrives in the existing
  inbox, not that anything new renders it.
- **What routing does to the eval corpus.** Every fixture shares the product `forgesight`, whose
  T1 is approved — so under real routing every fixture is now a follow-up. `produce.mjs` still
  calls `/webhook/generate` itself and therefore does not go through the fork. That is a
  corpus-design problem, not a routing one, and it is **BUG-052**.
