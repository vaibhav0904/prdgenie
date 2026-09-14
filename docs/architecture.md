# Architecture

The picture, and the rules that shaped it. This file and `CLAUDE.md` are the
two hubs: everything else is linked *from* here rather than cross-linking
sideways. Keep it short enough to read in one sitting.

## The shape

```
  DOORS                    THE SPINE (n8n WF2)                      THE GATE          IRREVERSIBLE
  ─────                    ───────────────────                      ────────          ────────────

  n8n Form ─┐                                                                            export
            │   ┌─ extract requirements (+ citations), unsettled positions, and          approved
  webhook  ─┴─▶ │  ↓          where the arguments were — one call, all three boxes         PRD
                │  any contested passage? ──▶ cut it (code) ──▶ read it ALONE               ▲
                │  ↓                             a second call, per passage (BUG-023)       │
                │  /internal/grounding-check   ◀── code decides "grounded", then merges     │
                │  ↓                               the two passes by citation span          │
   WF1          │  ↓                                                                        │
 normalize      │  about the product? ──no──▶ skip the gap call entirely                    │
                │  ↓ yes                                                                    │
 redact PII     │  detect gaps → OpenQuestions                                              │
                │  ↓                                                              ┌─────────┘
 mint trace_id  │  cluster → epics / features                                     │
      │         │  ↓                                                              │
      │         │  draft stories + acceptance criteria                            │
      │         │  ↓                                                              │
      │         │  extract PriorityFactors                                        │
      │         │  ↓                                                              │
      │         │  /internal/score  ◀── RICE, arithmetic in code, never the model │
      │         │  ↓                                                              │
      │         └─ assemble → /internal/validate                                  │
      │              ↓                                                            │
      │         PRDVersion: draft ──▶ in_review ──[Review UI sign-off]──▶ approved ┘
      │                                              ▲
      └─ existing approved version? ─▶ WF3 delta ────┘

  WF0 LLM Call (subworkflow) — the only path to a model provider, and since E7-S5 it holds
  TWO: the doer (OpenAI) and the judge (Gemini). One router, one classifier, one cost row.
  Every arrow above goes through it: timeout, one retry, cost logging, park on failure.
  WF3 delta reads a new document against the APPROVED version (E6-S1: it reads; applying and
  routing are E6-S2). WF4 error handler · WF5 weekly insights · WF6 judge sweep.
```

One spine, two doors, one gate. It is shaped this way because the only genuinely
irreversible act in this product — publishing a PRD that a team will build from — must
sit behind a state that a human, and only a human, can write.

## The doors

Every entry channel is a **thin adapter** that normalizes to the same object
before anything else happens. Nothing downstream knows or cares which door was
used — that is the test for whether a new integration is an adapter or a
branch.

| Door | What it is | Notes |
|---|---|---|
| n8n Form | Paste or upload text, pick `doc_type` and product | The demo door; also how a PM would really use it |
| `POST /webhook/ingest` | JSON body with the same fields | Used by the eval harness and the review UI's Ingest page |

Both produce the canonical SourceDocument in `docs/contracts.md` §1a. The four
`doc_type` values differ only in how the door extracts `title`, `received_at` and
`segments` — an email door strips headers, a transcript door splits on speaker labels.
After that they are indistinguishable, and **WF2 never reads `doc_type` or
`source_channel`**. Adding a Slack or Confluence door later is a new adapter, not a
new branch.

## Two planes

- **Control plane** — the `products` table plus the prompt files in `n8n/prompts/`:
  who exists and how the system is configured. Written by setup and by editing prompt
  files; read by everything at runtime.
- **Data plane** — documents, requirements, PRD versions, reviews, events. Reads
  config; never writes it.

Variation between products comes **only** from control-plane data. There is no branch
anywhere on a specific product's identity — a `grep` for `forgesight` outside fixtures,
the seed and the control plane must return nothing.

## Guardrails (designed-in, not bolted-on)

For each one, name the layer that enforces it. If the honest answer is "the
code calls things in the right order", it is not a guardrail yet.

| Guardrail | Enforced by | Can you draw a path around it? |
|---|---|---|
| A PRD is published only after a human approves it | SQLite `BEFORE UPDATE` trigger on `prd_versions`; single-writer sign-off endpoint | **No** — not from n8n, not from a Code node, not from `sqlite3` by hand |
| Sign-off requires every item to have been decided | Server-side recomputation inside the sign-off endpoint (the disabled button is only a courtesy) | **No** |
| Every requirement is grounded or visibly flagged | `/internal/grounding-check`: verbatim substring match in code; the model's `grounded` field is rejected as a schema violation | **No** — the model cannot self-certify |
| An ungrounded requirement can't be approved silently | UI requires an explicit "approve anyway", which writes a logged ReviewAction with a reason | No — but the override exists on purpose, and is counted |
| Sign-off readiness is recomputed at the endpoint, from the rows | `review.mjs`'s `readiness()` runs inside the sign-off handler; there is no `is_ready` column and no flag set earlier in the run | **No** — a `curl` mid-review is refused and told which items are undecided (E4-S3) |
| An unverified requirement cannot be approved quietly | The plain approve path refuses it; `approve_ungrounded` is a distinct decision with a required reason, counted separately everywhere | **No** — and with the guard removed it lands as `approved=1, overrides=0`, which is what the count would have said while it shipped (E4-S4) |
| Being quoted back to yourself is not corroboration | `authorship` is set at the door; a requirement from a first-party document is `pm_authored` and excluded from M1, exactly as an edited one is | **No** — relabelling the document puts them straight back in the rate, which is how the exclusion was shown to be doing work (E4-S6) |
| The model never produces a number that ships | PriorityScore computed by `/internal/score`; every report figure from SQL; the model writes commentary only | **No** — C3 recomputes every stored score and diffs |
| Injected instructions in source text are not obeyed | Delimited `DATA, NOT INSTRUCTIONS` block + output schemas with no instruction affordance + a code-side tripwire scanning outputs for known payload strings | Partly — defense in depth, not a proof. Measured by C6 at a 100% floor |
| Source text reaches a prompt only inside the fence, and no schema offers a landing spot | `check-injection-layers.mjs` **executes** all six model-call builders with a sentinel document and inspects the prompt each one produced; every free-text field is declared with a reason and an undeclared one fails | **No** — and it caught a real hole on its first run: `category` was documented as one of six and shipped as an open string (E7-S1) |
| An obeyed payload does not become a PRD | The tripwire runs at `/internal/assemble` — the one point every model output converges on and the only one that writes — and parks the whole run as `injection_detected`, storing no requirement and quoting no matched text | **No** for the payloads it knows; **it knows only those**. With the call removed the same body reaches `in_review`, which is how it was shown to be load-bearing (E7-S1 TC23) |
| A sentence the extractor called unsettled cannot also ship as agreed | `review-ui/unsettled.mjs` reconciles the extractor's two outputs by citation span, before anything is stored | **No** — and it is the model's own judgement overruling its own list, not a second model's opinion (BUG-007) |
| A document that is not about the product produces nothing — including no questions | `concerns_product` gates assembly, the gap call and `gaps.mjs`; the wiring skips the call and the code drops anything that arrives anyway | **No** — two independent copies of the same gate, because a gate on one wire is a gate a rewiring removes (BUG-019) |
| Every `trace_id` that enters the door has a recorded fate | Every park path writes a version, a reason and a `parked` event through `/internal/park` or `assemble.mjs`; every *death* writes a dead letter and a `dead_lettered` event through WF4 | **No** — the branch that used to write nothing at all now calls the service (BUG-012), and a run that dies before it has a `trace_id` has one recovered from its `doc_id` (E7-S3) |
| A second opinion cannot become a gate | The judge writes to `judge_scores` and `judge_sweeps` and nowhere else; `verify-judge-isolation.mjs` walks **77 gate-bearing files derived from the directories** and fails on any reference to the module, its endpoints or its tables | **No** — and the control plants one in `C1.mjs` and in `metrics.mjs` and watches the check go red by name (E7-S5 TC15) |
| A sample that is not random cannot be reported as one | The sample is drawn in SQL from rows with no score, bounded to 2 versions and 20 requirements, and **opening the sweep is the lock**; `trigger_source` records whether a person asked | **No** — a second trigger is refused with `sweep_in_flight` and draws nothing, and the pacing exists so a rate limit cannot silently reduce the sample to "the rows drawn first" |
| A judge that has seen the answer key is not independent | The labels are never in the sample: `verify-prompt-hygiene.mjs` fails on any label quote in any prompt file, and `verify-judge.mjs` re-checks the **runtime** payload of a real sweep. Disagreement with the key is computed afterwards, by the C1 matcher | **No** — and an item the system already flagged ungrounded can never count as a violation, which the control forces in both directions (E7-S5 TC9) |
| A run that dies is visible to an operator | WF4 is the error workflow for every workflow, `check-error-routing.mjs` reads that wiring **from the files and from the running n8n**, and the queue is `attention.html` | **No** — and with WF4 unset the same kill produces no entry at all, which is how the entry was shown to be WF4's (E7-S3 TC16) |
| A call the run cannot do without stops the run | `check-failure-routing.mjs`: 10 product calls stop; the provider call, the telemetry call and the handler's own write are declared exceptions with stated reasons | **No** — before this, an outage was recorded as `status: success` and billed for a model call (BUG-028) |
| A score is arithmetic, and the model cannot write one | `computeScore` in `structure.mjs` is the only computation; a model-supplied `priority_score` is refused as `schema_invalid`; C3 recomputes every stored score from its stored factors with its own copy of the formula | **No** — and the check has been seen rejecting a 0.1 error (E3-S3, E3-S5) |
| A second pass cannot see more than one passage | `passages.mjs` cuts the span between two located quotes and **refuses anything over 60% of the document**; the prompt is handed the passage, never `raw_text` | **No** — and the refusal matters more than the cut: re-reading the whole document is the condition BUG-023 measures, at the price of another model call |
| A second pass cannot invent or duplicate a requirement | Merged at the grounding check, **after** grounding: anything ungrounded from that pass is dropped rather than flagged, and anything whose citation overlaps a first-pass citation is recorded as a duplicate | **No** — pass 1 wins every tie, because it saw the whole document and its statement resolves referents the passage cannot (BUG-023) |
| The model cannot put a number in a report | `review-ui/weekly.mjs` scans the narrative for digits, `%` and spelled numerals and **drops the whole paragraph** if it finds one; the report is rendered from SQL either way | **No** — and the refusal is whole-paragraph on purpose: a narrative with the figures edited out is a paragraph nobody wrote (E8-S2) |
| A caveat cannot be forgotten, because nobody writes it | Both weekly caveats are computed — from `baseline_status` and from the week's own approval count — and `verify-weekly.mjs` forces each in **both** directions | **No** — the test is that the sentence *removes itself* when the world changes; a caveat that is always present is a typed caveat with extra steps |
| A failed narrative cannot cost the owner their figures | WF5's model call is the one declared exception in `check-failure-routing.mjs`; the figures are computed before it runs and the next node passes nothing rather than inventing a paragraph | **No** — with the call dead the report still ships, saying "Narrative unavailable this week" (E8-S2 TC12) |
| Structure cannot invent a requirement | The clusterer and the story drafter never receive `raw_text` — ids and statements only — and every id they return is checked against the list they were given | **No** — an unknown id is rejected, not dropped (E3-S1, E3-S2) |
| No un-redacted PII is ever stored | Regex redaction at the door, **before** the insert; `raw_text` is immutable afterwards | **No** |
| No provider call escapes cost logging | WF0 is the only workflow holding provider credentials; every other workflow calls it as a subworkflow | **No** — the credential is the enforcement |
| Secrets never reach an export | `npm run export:n8n` strips credential ids and greps for key patterns; non-zero exit on a hit | **No**, for anything committed |

## Readiness and degradation

Missing configuration is a **product state, not an error**. An item arriving
before setup is complete gets every stage it can, then parks with a
machine-readable reason and resumes on its own when the missing piece lands.

Failures degrade to something safe and visible, never to a confident wrong
answer:

| Failure | Degrades to | Who resolves it |
|---|---|---|
| Model returns low-confidence or zero requirements from a non-empty document | Parked `needs_review`, reason `no_requirements_found`, document kept | Vaibhav as PM |
| Grounding rate below floor after the check | Parked `needs_review`, reason `grounding_below_floor` | Vaibhav as PM |
| Malformed JSON from the model | **Retried once, in the workflow** — the second ask is the same bytes with `attempt: 2`, and BOTH attempts write their own `llm_calls` row. If it still will not parse: parked `needs_review`, reason `llm_malformed_json` (E2-S4) | Vaibhav as PM |
| Anything that is **not an answer** — auth, balance, rate limit, timeout | **Not retried by the workflow.** Asking again spends money on a condition that cannot pass; n8n's node-level retry already covers the case where nothing replied at all | as each row below |
| Provider **timeout** | Parked `needs_review`, reason `llm_timeout`. **No fallback to a second vendor** — a park is honest, a silently different model is not | Self-heals on retry |
| Provider **auth failure**: missing credential, revoked or wrong key, 401/403 | Parked, reason `llm_unauthorized`, with the provider's own message beside it | Vaibhav as operator — re-enter the credential, then `bind-provider-credential.mjs` |
| Provider **rate limit**, 429 | Parked, reason `llm_rate_limited` | Self-heals |
| Provider **balance exhausted** — `insufficient_quota`, "no credits remaining" | Parked, reason `llm_no_credit`, with the provider's own message beside it | **Vaibhav as operator — top up the account.** It is a 429 like rate limiting and it is the opposite of self-healing, which is why it has its own code (BUG-036) |
| Any other provider failure, including a 500 or an empty response | Parked, reason `llm_error` — **an unrecognised failure gets a code that says so**, never a specific code it did not earn | Vaibhav as operator |
| The provider call fails **before it runs** — n8n raises a missing credential at node level | The sub-workflow error no longer escapes: WF2 continues, classifies it and parks. Found by injecting the fault (BUG-012) | Vaibhav as operator |
| Judge (Gemini) unavailable | Sweep closed as `skipped`, with a reason from the same closed set and **the provider's own words beside it**; the lock is released. Never blocks a PM, never falls back to the doer's vendor — a second opinion from the vendor that wrote the thing is not a second opinion | Nobody — the next sweep picks the rows up |
| Judge answers for **some** of the sample | Sweep closed `complete` with `scored` below `sample_size` and the first failure's reason recorded. **A partial sweep is never reported as a full one**: every judge figure carries its own n | Nobody |
| A sweep dies holding the lock | The next sweep releases it after 30 minutes and **records the release** as `sweep_abandoned` — a lock that clears itself silently is a lock nobody can audit | Nobody |
| Envelope or schema invalid, service unreachable | `dead_letter` with reason, visible in the Needs-attention queue | Vaibhav as operator |

Every one of those parks writes the same three things — a `prd_versions` row carrying the
reason, a `parked` event naming the stage that failed, and the work it had already done.
Two paths returning the same envelope are not the same path, and until 2026-09-02 one of
them persisted nothing (BUG-012).

## Where the detail lives

- `docs/contracts.md` — the envelope, payloads, state machines
- `docs/domain.md` — vocabulary
- `docs/adr/` — why each irreversible choice was made
- `docs/assumptions.md` — what is simplified, and the biggest known gap
- `docs/metrics.md` · `docs/traceability.md` — what is measured and why
- `docs/reporting.md` — who reads which numbers, and where

Quality gates: `evals/` — and the stories that implement a step are not done
until that step's eval passes.
