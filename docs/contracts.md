# Contracts

**The single source of truth for how components talk to each other and what
states exist.** Any change here bumps the version and gets an ADR if it is
irreversible.

Write this before the components exist. A contract discovered by reading the
implementation is not a contract.

## 1. The envelope

One versioned wrapper that every component **accepts and returns**. The
symmetry is the point: same shape in and out means any component can be
replaced, tested in isolation, or reordered.

```json
{
  "envelope_version": "1.0",
  "product_id": "forgesight",
  "doc_id": "DOC-2026-0001",
  "trace_id": "3f2a...-uuid-minted-at-the-door",
  "component": "extractor",
  "status": "ok | error | skipped | needs_review",
  "payload": {}
}
```

Three rules that turn a data shape into a contract:

- Components **validate the envelope on entry**; invalid → route to the error
  handler, **never partial-process**.
- `trace_id` is **minted once at the front door** (WF1) and carried unchanged through
  every hop and every log row.
- `status != ok` payloads carry a machine-readable reason:
  `{ "reason": "...", "missing": ["..."] }` — never a bare failure.

Reason codes are a closed set: `envelope_invalid`, `schema_invalid`,
`empty_source`, `no_requirements_found`, `llm_timeout`, `llm_malformed_json`,
`llm_unauthorized`, `llm_rate_limited`, `llm_no_credit`, `llm_error`,
`no_approved_version`, `injection_detected`,
`grounding_below_floor`, `service_unreachable`, `workflow_error`.

**Amended 2026-09-05 (BUG-050): there are two closed sets, and this is the first of them.**

The set above is what a **component** answers with, carried on an envelope's non-`ok` payload.
Every code in it is *park-able* — a park is a `prd_versions` row that keeps the work and names
why it stopped.

The second set is what a **door** answers when the call itself could not be answered. These
never travel on an envelope, are never a park and are never a dead letter; the endpoint replies
and the run stops. Declared as `DOOR_REASONS` in `review-ui/assemble.mjs`:

| Code | When |
|---|---|
| `unauthorized` | the caller did not present the internal key (every `/internal/` route, BUG-051) |
| `unknown_version` | no `prd_versions` row with that id |
| `unknown_document` | no `source_documents` row with that id |
| `unknown_sweep` | no `judge_sweeps` row with that id |
| `unknown_dead_letter` | no `dead_letters` row with that id |
| `unknown_prd` | no `prds` row with that id (the version-history read model, E6-S3) |
| `unknown_route` | the URL matched no route — the service's own 404 |
| `sweep_in_flight` | a sweep is already open, and opening is the lock (§9) |
| `sweep_not_in_flight` | a close or a score arrived for a sweep already finished |
| `not_in_review` | a decision or a sign-off arrived for a version in another state |
| `already_resolved` | a dead letter was resolved twice |
| `reason_required` | a decision that overrides or edits arrived without its note (§4) |
| `ungrounded_requires_override` | an ungrounded requirement was accepted without the explicit override |
| `signoff_refused` | the sign-off itself was refused by the database gate (§4) |
| `items_undecided` | sign-off arrived while requirements or stories still have no decision (§4) |
| `nothing_to_review` | sign-off arrived for a version with nothing decidable on it at all |
| `internal_error` | not a refusal: an unhandled throw, answered by the door because nothing else is left |

**Why two sets rather than one longer one.** Fifteen of these were emitted by shipped code and
declared nowhere. Adding them to the set above was the obvious repair and it is wrong:
everything above is park-able, and `unknown_version` cannot mint a version to record that the
version is unknown. The two sets are **disjoint**, and `check-reason-codes.mjs` fails if they
ever share a member.

**`low_confidence` was removed the same day.** It was in the closed set from the first draft of
this document and nothing ever emitted it — a code for a model reporting its own certainty,
which this project forbids on another page. A closed set that only ever grows is a glossary.

**Every `reason` field in the system belongs to a declared set, or is prose.** Four sets:
`REASONS` and `DOOR_REASONS` here, `DROP_REASONS` (why an extracted item was set aside;
`gaps.mjs` and `unsettled.mjs`) and `SKIP_REASONS` (§9), plus `VETTING_REASONS`, which is
`buildReport` talking to itself. `check-reason-codes.mjs` derives all of them by import,
derives every emission by scanning the shipped modules and the workflow exports, and fails on
anything it cannot place. Prose is allowed — but never in the `reason` field of an object that
also carries `status:`, because that is the field a caller branches on. Prose goes in `detail`.

**Amended 2026-09-05 (BUG-063).** The check reads a reason's whole **value expression**, not the
token after the colon. It could not previously see
`reason: gate.empty ? 'nothing_to_review' : 'items_undecided'` — the two codes the human gate
refuses a sign-off with, in no set and in no contract, while the check reported *"every one
accounted for"*. **A check with a false negative is worse than no check, because it reads as an
audit**, and that sentence was already written down (BUG-051) three commits earlier.

A value it cannot read statically — `reason: err.reason`, `reason: classifyProviderError(e)` —
is a **pass-through**: listed by name and explicitly subtracted from the coverage figure, because
a denominator that silently excludes what it could not see is the hand-counted denominator this
project has been bitten by three times. Fourteen of those exist, and two `reason` fields that are
JSON **schema** declarations rather than code slots.

**Amended 2026-09-04 (E6-S2).** Two more, both about the delta path: `delta_empty` — the
new document changed nothing, so no version is minted and the park says so — and
`baseline_not_approved`, which refuses to build a delta on a draft nobody has agreed to.

**Amended 2026-09-03 (E7-S3).** The last two are for the failures that happen *around* a
component rather than inside one, and they exist because WF4 had nowhere honest to put them.
`service_unreachable` is the review service not answering — the drill in E7-S3, and the
failure a two-process local setup makes most likely (`assumptions.md`). `workflow_error` is
the unrecognised n8n failure: a node that threw, an expression that could not evaluate. It is
deliberately vague **because the dead letter carries the workflow, the node and the message
beside it** — the code says which queue a row belongs in, and the detail says what to do. A
vague code with no detail would be the decorative kind this contract already refused once.

**Amended 2026-09-03 (BUG-036), and the set grew because reality named something new.**
`llm_no_credit` is an exhausted account balance. It was found by an outage rather than a drill:
every fixture parked at once, correctly and with the provider's own message kept beside the
code — and the code was `llm_error`, the one reserved for a failure nobody recognised. But the
provider had named it, in words, in the message.

**`llm_rate_limited` would have been the wrong answer too**, and that is why the set grew
rather than the regex. The degradation table says rate limiting **self-heals** and needs
nobody; an empty balance heals when a human goes and pays. Filing it there would have sent an
operator a code meaning *"wait, it will pass"* about the one provider condition that never
passes on its own. **A closed set is only worth having if it is allowed to grow when the world
names something it does not contain** — the alternative is a code that is nearly right, which
is the failure BUG-011 already wrote this section about.

The clause is ordered **before** the rate-limit clause, because an exhausted balance arrives as
a 429: matched second, it would never be reached.

**Operational note, learned from the drill rather than an outage:** the closed set is enforced
in two processes — the classifiers inside the workflows, and `/internal/park`'s gatekeeper in
the review service — and they deploy separately. While only one side knows a new code, every
park wearing it is refused as `schema_invalid` and the run records **nothing**. Growing the
set means restarting both together.

**Amended 2026-09-02 (BUG-011).** The three `llm_*` codes on the second line are new, and
the reason for adding them is not that the set was short. WF0 mapped every provider failure
except one to `llm_timeout`, so a missing credential — the failure that actually happened
during the Docker rebuild — was recorded as a latency problem and read as one. **A code
whose meaning is "something went wrong" is decorative, and a code that names the wrong
thing is worse than decorative.** `llm_error` exists so that the unrecognised case has
somewhere honest to go rather than borrowing a specific code's name.

Where a provider failure is classified: `review-ui/llm-errors.mjs`, with a copy inside WF0's
"Parse or park" node because a Code node cannot import. `verify-degradation.mjs` runs both
copies over the same cases and fails when they disagree.

### 1a. The canonical SourceDocument

What **every door must produce**, and the only shape anything downstream sees. Nothing
after WF1 may read `source_channel` — it is recorded for the operator, never branched on.

```json
{
  "doc_type": "transcript | notes | email | feature_brief",
  "title": "ForgeSight kickoff — 2026-08-14",
  "received_at": "2026-08-14T10:00:00Z",
  "source_channel": "form | webhook",
  "raw_text": "…the immutable text every citation points into…",
  "segments": [
    { "segment_id": 1, "speaker": "Priya (Eng Lead)", "start_char": 0, "end_char": 214 }
  ],
  "pii_redactions": [
    { "kind": "email | phone | customer_name", "replacement": "[EMAIL-1]", "count": 2 }
  ],
  "target_prd_id": "PRD-forgesight | null"
}
```

`raw_text` is **post-redaction and immutable from this point on**. Redaction happens at
the door, before storage, so no un-redacted text is ever persisted and every span offset
refers to the same string forever. `segments` are advisory (speaker attribution,
chunk boundaries); a citation never depends on them.

### 1b. The Requirement

```json
{
  "req_id": "REQ-001",
  "kind": "functional | nonfunctional | constraint",
  "statement": "Users can export any dashboard chart as a PNG.",
  "stakeholder": "Priya (Eng Lead)",
  "confidence": "high | medium | low",
  "citations": [
    { "doc_id": "DOC-2026-0001", "quote": "we absolutely need PNG export",
      "start_char": 1042, "end_char": 1073 }
  ],
  "grounded": null
}
```

`grounded` is **always `null` on the wire out of the model** and is filled only by
`/internal/grounding-check`. A model-supplied non-null `grounded` is a schema violation,
not a value to trust. `start_char`/`end_char` are hints: the **quote is authoritative**
and the check relocates it by substring search (see ADR 0003).

### 1b-ii. The UnsettledPosition

```json
{ "subject": "trial sign-up",
  "position": "A prospect can create a login with an email address.",
  "stakeholder": "Tom (Sales)",
  "citations": [ { "doc_id": "…", "quote": "…", "start_char": 0, "end_char": 0 } ] }
```

**One entry per position, not per argument** — a two-sided argument produces two, each with
the quote where that side was stated. One citation is enough, because the other side is a
separate entry carrying its own; a `conflict` OpenQuestion needs two because one quote cannot
show a disagreement, and that difference is deliberate.

`grounded` and `match_kind` are code's, exactly as on a Requirement. Shape is enforced by
`review-ui/unsettled.mjs`, and a malformed entry is dropped and counted — never fatal, never
silent, for the same reasons as an OpenQuestion.

**The extractor's two outputs are reconciled against each other** (BUG-007). A Requirement
whose citation span overlaps an UnsettledPosition's is withdrawn from the requirement list
and its statement attached to that position, because one response cannot both call a sentence
unsettled and ship it as agreed. This is not a second component overriding the extractor — it
is the extractor's own explicit judgement winning over its own list, the rule
`concerns_product` already follows.

### 1c. The OpenQuestion, PriorityFactors, and Delta

```json
{ "kind": "conflict | unanswered | missing_nfr",
  "category": "performance | security | accessibility | data retention | scale | localization | null",
  "question": "Is PNG export required at launch or post-launch?",
  "citations": [ { "doc_id": "...", "quote": "...", "start_char": 0, "end_char": 0 } ] }
```
`category` is set **only** on `missing_nfr`, and only from that closed list — free text would
drift every run and make C4 unstable. `grounded` and `match_kind` are code's, exactly as on a
Requirement; an OpenQuestion arriving with either set is `schema_invalid`.

**Shape is enforced by code, and a malformed item is dropped and counted — never fatal, never
silent** (`review-ui/gaps.mjs`). It cannot be fatal because open questions must never block
assembly; it cannot be silent because "0 open questions" would then mean both "the document
settled everything" and "the detector emitted nothing usable". A `conflict` needs **two**
citations, one per side; an `unanswered` needs one; a `missing_nfr` must carry none, because
its evidence is an absence. `grounded` on a `missing_nfr` is **`null`**, not `false` — there
is nothing to look for, and `false` would read as "we looked and it wasn't there".
```json
{ "feature_id": "FEAT-003", "reach": 7, "impact": 2, "confidence": 0.8, "effort": 3,
  "rationale": "…", "citations": [ … ] }
```
`reach` 1–10 · `impact` ∈ {0.25, 0.5, 1, 2, 3} · `confidence` 0.5–1.0 · `effort` 1–8
person-weeks. The model supplies **only** these four numbers and its rationale;
`PriorityScore = round(reach × impact × confidence ÷ effort, 1)` is computed by
`/internal/score` and by nothing else.

```json
{ "added": [ Requirement ],
  "modified": [ { "req_id": "REQ-004", "old": "…", "new": "…", "citations": [ … ] } ],
  "contradicted": [ { "req_id": "REQ-002", "prd_quote": "…", "new_quote": "…",
                      "citations": [ … ] } ],
  "new_open_questions": [ OpenQuestion ] }
```
An unchanged Requirement **must not appear** in a Delta. Churn is measured (C5).

## 2. Per-component payloads

Write these as **needs / adds**, not as transformations. The payload accretes;
nothing upstream is overwritten, so any stage can be replayed from the record.

| Component | Payload needs | Payload adds |
|---|---|---|
| `door` (WF1) | raw input + doc_type + product_id | canonical SourceDocument (§1a), `trace_id`, `doc_id` |
| `extractor` | `raw_text` | `requirements[]` with `grounded: null`, `unsettled_positions[]`, `document_subject`, `concerns_product` |
| `grounding_check` | `requirements[]`, `raw_text` | `grounded` per requirement; `grounding_rate` |
| `gap_detector` | `raw_text`, `requirements[]` | `open_questions[]` |
| `clusterer` | `requirements[]` (ids + statements only) | `epics[]`, `features[]` referencing `req_id`s |
| `story_drafter` | `features[]`, their `requirements[]` | `stories[]` with acceptance criteria → `req_id`s |
| `factor_extractor` | `features[]`, their `requirements[]` | `priority_factors[]` |
| `scorer` | `priority_factors[]` | `priority_score` per feature (code only) |
| `assembler` | everything above | `prd_version` document; withdraws requirements that duplicate an unsettled position |
| `validator` | `prd_version` | `valid: true` or `status: error, reason: schema_invalid` |
| `delta_analyzer` | approved `prd_version` + new SourceDocument | `delta` (§1c) |
| `judge` (WF6) | a sampled `prd_version` + its sources | `judge_scores[]` — **monitoring only, never a gate** |

The clusterer deliberately receives statements without `raw_text`: it groups what was
extracted, it does not get a second chance to invent requirements.

## 3. State machines

### PRDVersion — the one that matters

```
draft ──> in_review ──[review UI sign-off ONLY]──> approved ──> superseded
              │                                        ▲
              └──[rejected, with reason]──> draft ──────┘ (via a new version)
```

- `approved` is reachable from `in_review` **and from nowhere else**, and only via
  `POST /api/prd-versions/:id/sign-off`.
- `superseded` is set automatically when a newer version of the same PRD is approved.
- A version is **immutable once written**: rejection produces a *new* draft, never an
  edit in place (ADR 0005).

**Amended 2026-09-05 (E6-S3): the supersede is PART of the approval, not a step after it.**

Both writes happen inside `signOff()`'s single transaction. A separate step is a step that can
fail on its own, and what it leaves behind is **two approved versions of one PRD** — the exact
ambiguity the version chain exists to remove. If the supersede cannot complete, the approval
rolls back with it and the PRD keeps the version it already had.
`verify-version-chain` TC6 forces that failure with an injected trigger rather than assuming
the transaction holds; its first draft made `signOff` throw *before* the supersede, which proved
the approval was guarded and said nothing about the property being claimed.

**An approval supersedes every other approved version of its PRD**, not only version N−1. In the
normal case those are the same row. They were not on `PRD-forgesight`, which carried twenty
approvals from before this rule existed (BUG-045's control used to sign off whatever versions it
found), and the rule makes the invariant true when it next runs rather than a migration
inventing a chain that never happened. `verify-version-chain` TC14 counts the PRDs still in that
state, and the history page marks them where the chain is drawn.

Until this story `superseded` was a value in the CHECK constraint that no code path could reach.
**A state machine with an unreachable state is a diagram, not a machine.**

Plus the orthogonal escape hatches, reachable from any stage. Distinguish them
by **who fixes it** — that is what makes them different states rather than one
"error":

| State | Meaning | Who resolves it |
|---|---|---|
| `needs_review` | The run finished but the system is not confident enough to present it as a normal draft — LLM fallback engaged, grounding rate below floor, or zero requirements found in a document that claimed to have some. | Vaibhav, as **PM**, in the review UI |
| `dead_letter` | Genuine unrecoverable failure: envelope invalid, schema invalid after retry, service unreachable. | Vaibhav, as **operator**, from the Needs-attention queue |

`needs_review` is a *park*, not an error: the work is kept, visible, and resumable.
Nothing is discarded on either path.

**Enforce the transitions in the layer with no bypass** — a SQLite `BEFORE UPDATE`
trigger on `prd_versions` that `RAISE(ABORT)`s any transition not in the table above,
and specifically any transition into `approved` where the session variable proving it
came through the sign-off endpoint is absent (ADR 0006). The irreversible step —
exporting an approved PRD — reads only from `state = 'approved'`.

**And enforce the FIRST state as well as every later one (BUG-049).** A row's initial state
is not a transition, so the `BEFORE UPDATE` trigger never sees it, and for two weeks
`INSERT INTO prd_versions (..., state) VALUES (..., 'approved')` walked straight past the
human gate — refused as an `UPDATE`, admitted as an `INSERT`. A second trigger,
`prd_versions_born_unreviewed` (`BEFORE INSERT`), admits only `draft` and `in_review`:

| Written by | State at insert |
|---|---|
| assembly, and a park | `draft` |
| `applyDelta` (§10a) | `in_review` |
| anything else | refused |

`approved` is a decision and `superseded` is a consequence; **a version is born unreviewed.**
A census taken the day this was found put 53 of 53 approved versions through the endpoint,
with an event and a review session each — which is not what makes the rule true. **A guarantee
that holds because no caller happens to break it is a convention**, and the whole point of
putting it in the database is that it stops being one. `verify-gate` now approaches from both
directions, and asserts — derived from the schema, not typed — that every `BEFORE UPDATE OF`
guard has answered the question *"what would an INSERT do here?"*, by a trigger or by a stated
reason.

## 4. Readiness gates

Each stage declares what it requires; readiness is **computed, never a stored
flag** — derived state cannot go stale.

| Precondition (computed at call time) | Gates which stage |
|---|---|
| A stored SourceDocument with non-empty `raw_text` | extraction |
| ≥1 requirement with `grounded = true` | PRD assembly (else park `needs_review`, reason `grounding_below_floor`) |
| Every feature has PriorityFactors | scoring |
| `prd_version` validates against the PRD schema | transition to `in_review` |
| An open ReviewSession in which **every** requirement and story has a ReviewAction | the sign-off button being enabled, and the endpoint accepting |
| An `approved` version exists for this product | routing a follow-up document to WF3 instead of WF2 |

The sign-off endpoint recomputes the last precondition server-side. A disabled button is
a courtesy; the recomputation is the gate.

## 5. Traceability clause

Reported numbers are computed from the event log and the record tables only.
**If a metric cannot be traced back to rows, it does not ship.** Every row carries
`trace_id`; every metric in `docs/metrics.md` names the query that computes it; and any
number rendered in a report or the UI must be reproducible by running that query by hand.

## §9 — The judge sweep (E7-S5, sampling E7-S6)

**The judge gates nothing.** Nothing in this section may be read by a case, a threshold, a
metric or a report figure, and `verify-judge-isolation.mjs` fails if anything does.

| Call | Body | Answers |
|---|---|---|
| `POST /internal/judge-sweep/open` | `{trigger_source: cron\|manual}` | `{status:'ok', sweep_id, sample_size, items[]}`, or **409** `{status:'error', reason:'sweep_in_flight', sweep_id}` |
| `POST /internal/judge-scores` | `{sweep_id, scores[]}` | `{status:'ok', stored, rejected[]}` — a verdict outside the closed set is rejected, never coerced |
| `POST /internal/judge-sweep/close` | `{sweep_id, sweep_status, skipped_reason, skipped_detail, rubric_version}` | `{status:'ok', disagreement, bug}` |
| `GET /api/judge` | — | every sweep with its sample size, its verdict counts, and what it could not compare |

**Opening is the lock.** Sampling and locking are one operation: a caller that could sample
and then decide whether to open is two callers double-sampling the same rows.

**Closed sets.** `trigger_source` ∈ {cron, manual}. Sweep `status` ∈ {in_flight, complete,
skipped}. Judge `verdict` ∈ {supported, unsupported, cannot_tell}. `skipped_reason` is a
provider reason code from §5's set, or `sweep_abandoned`, `nothing_left_to_judge`,
`judge_misaligned`.

**A skip carries a reason or it is refused.** `status:'skipped'` with no `skipped_reason`
returns `envelope_invalid` — a sweep that got no opinion and said nothing is exactly the
failure BUG-028 was about, arriving in a new place.

**`provider` on a WF0 payload** ∈ {openai, gemini}, absent meaning openai. It is written by
`sync-prompts.mjs` from the prompt's own declaration, so a node cannot quietly switch vendors:
the grader is never the doer (ADR 0001).

**Identity is owned by code.** The judge is never asked to echo an item id — an id it wrote is
an id it could get wrong, in a field something else could occupy. The sample, the calls and
the replies are one list in one order, and WF6 asserts all three lengths match before storing
anything; a mismatch skips the sweep as `judge_misaligned` rather than attaching opinions to
the wrong rows.

**Disagreement is computed by the C1 matcher, never by the judge.** Only requirements from a
labelled fixture run are comparable; everything else is counted and named as not comparable
rather than treated as agreement. An item the system itself flagged ungrounded is **excluded
before counting** — a flagged item is never a violation.

**The sample is stratified, and the rate is not (E7-S6).** Twenty requirement slots are drawn
by quota across named strata — `ungrounded` 4, `approved_anyway` 2, `human_edited` 2,
`nonfunctional` 3, `constraint` 3, `uniform` 6 — plus one PRD version per state. The quotas
are constants and must sum to `MAX_REQUIREMENTS`, derived rather than asserted.

| Rule | Why |
|---|---|
| **`uniform` is never zero** | a sample made only of interesting rows describes nothing |
| **A row drawn *because* it is hard never enters the disagreement rate** | otherwise the sampler manufactures its own alarm: over-sample the difficult rows, pool them, and >40% fires on a draw chosen for difficulty. Exclusion is by *targeted stratum*, so a row of unknown provenance still counts — the conservative direction |
| **Targeted strata report counts per stratum, never a rate** | over four rows a rate moves for uninteresting reasons (§reporting rule 6) |
| **An unfillable quota reports wanted/got and flows to `uniform`** | stored on the sweep, not just printed: a quota that quietly shrank is a coverage claim nobody can check |
| **No stratum reads `source_channel`, `doc_type` or `authorship`** | the spine rule holds for the monitor too. Every stratum is an *outcome* property, and the check derives the forbidden columns from the SQL |
| **The stratum never reaches the model** | telling the judge "we already suspect this one" ends its independence — the same failure as showing it the labels. WF6's builder forwards four fields and the check reads the shipped node |

`GET /api/judge` reports **coverage per stratum**, judged over total. One corpus-wide
percentage stopped describing anything the moment 1.5% of the corpus became 20% of the sample:
"6,758 never judged" is true and says nothing about whether the defensive clause has ever been
applied to a real row. On 2026-09-04 it had not — 27 judged, 0 of them ungrounded.

## §10 — The delta (E6-S1)

A document about a product that already has an approved PRD is read **against that version**,
never against the latest draft: a draft awaiting review is not what anyone agreed to.

| Call | Body | Answers |
|---|---|---|
| `GET /internal/approved-version?product_id=` | — | `{has_approved_version, prd_version_id, requirements[], requirements_for_prompt}`. **"No approved version" is a 200, not an error** — it is the normal answer for a product's first document, and WF1 routes on it (E6-S2) |
| `POST /internal/delta-check` | `{prd_version_id, doc_id, payload}` | `{delta, dropped[], counts, total_items}` |

**Closed set.** A delta item is `added`, `modified`, `contradicted` or `removed`, plus
`new_open_questions`. A fifth kind is a decision, not a field.

**The model proposes; code decides three things:**

1. **Which requirement.** `req_id` is the link between a delta item and the PRD, and a link is
   not something a model may invent. An id that is not in the approved version is **rejected
   and the item thrown away** (PRD-E6 decision 5). `added` names nothing — that is what makes
   it added.
2. **Whether the evidence exists.** Every quote from the new document is located in `raw_text`
   by the same matcher a citation goes through. An item whose evidence cannot be found is
   **dropped with a reason** — not kept and flagged, because a delta item is a proposal to
   change a document somebody already approved.
3. **What silence means: nothing.** `removed` requires the document to say so. A requirement the
   document does not mention produces no item of any kind (PRD-E6 decision 2).

**The PRD side is recorded, not enforced.** `modified`, `contradicted` and `removed` carry
`prd_quote` — the approved requirement's own sentence — and its match against the stored
statement is stored as `prd_quote_match`. It does not drop the item: the `req_id` is the link,
and losing a real change to protect a caption would be the wrong trade.

**`dropped` is part of the answer.** A delta that quietly shrank is a delta nobody can audit.

### §10a — Applying it, and the road there (E6-S2)

**WF1 routes on product state, never on what the PM typed.** The question is
`has_approved_version` for the document's product, answered server-side by
`GET /internal/approved-version`. The optional "update an existing PRD" box on the form is a
convenience, not the decision: a PM who leaves it blank on a follow-up must not get a rival
draft, and a follow-up ingested *before* the first PRD is approved must still take the normal
path. The choice is written as a `routed` event carrying `{route, route_reason,
approved_prd_version_id}` — readable afterwards without re-deriving it.

| Call | Body | Answers |
|---|---|---|
| `POST /internal/apply-delta` | `{prd_version_id, doc_id, payload}` | `{status, prd_version_id, base_version_id, state, carried, changes, counts, dropped[]}` |

WF3 **reads before it writes**: `delta-check` refuses a bad payload before anything is minted,
then `apply-delta` writes. `applyDelta` re-checks the payload itself regardless — a caller able
to hand the writer an unchecked delta is a caller able to bypass grounding.

**Identity survives; the row id cannot.** `req_id` is `"<version>-REQ-nnn"`, a global primary
key, and versions are immutable (ADR 0005) — so a carried requirement is necessarily a new row.
Identity therefore lives in its own column, `origin_req_id`, set to the ancestor's and to its
own id for a requirement with no ancestor. Without it every carried requirement looks new: the
review decisions taken against the old row stop resolving, and **M2 rises next cycle because
the denominator was replaced, not because anybody accepted anything.**

**Silence changes nothing.** A requirement the delta does not mention is copied across word for
word, citations included — not re-extracted, not re-grounded.

**A contradiction is not an edit.** `contradicted` and `removed` record a change in
`prd_changes` and leave the requirement standing. The new document disagreeing with an approved
requirement is a question for the PM (E6-S4), not a fact about the product; applying it here
would be the system settling the argument it exists to surface.

**Two refusals, both from the closed set.** `delta_empty` parks without minting a version —
a version whose changelog is empty is one nobody needs to read. `baseline_not_approved` refuses
a delta against a draft. Both are the writer answering, so WF3's park names *them*, not the
provider; a 400 from this endpoint is a contract fault and belongs to WF4.

**The version lands in `in_review`, by the same door as any other.** `content` is written once,
in the same insert — the first version of `applyDelta` tried insert-then-update and the
immutability trigger refused it.
