# Traceability plan

**Written before instrumenting.** The question this document answers, per call
site: *what must we capture, what does "bad" look like, which metric does it
feed, and who acts on it?* Nothing is logged that isn't decided here.

Why this file exists first: deterministic code fails loudly, but judgment steps
fail **plausibly**. A wrong answer that looks right is invisible without
instrumentation designed in advance to catch it.

## The failure classes we are instrumenting against

1. **Behavioural drift** — output quality changes without the code changing.
   Here that means: extraction quietly starts paraphrasing instead of quoting, or the
   clusterer starts producing one giant epic.
2. **Economic drift** — cost per unit of work rises unnoticed. Here: a longer prompt or
   a retry loop doubles the cost per PRD and nothing says so.
3. **Trust erosion** — outputs stop being defensible and nobody can tell when
   it started. Here: the grounding rate slides for a month and the first person to
   notice is a PM who stops clicking citations.

## Capture matrix

| Call site | What we capture | What "bad" looks like | Feeds | Who acts |
|---|---|---|---|---|
| WF1 door | `trace_id`, `doc_id`, `doc_type`, `source_channel`, char length, redaction counts by kind, `ingested` event with timestamp | Redaction count of 0 on a document type that always has contact details; a length far outside fixture range | M4 (start endpoint), PII check in C2 | Operator |
| WF0, every model call | `trace_id`, `component`, **`prompt_version`** (git short hash of the prompt file), `model`, prompt/completion tokens, `latency_ms`, `cost_usd`, `attempt` (1 or 2), outcome | Attempt-2 rate climbing (the model is returning malformed JSON more often); cost per call rising with no prompt change | M5, economic drift | Operator, then builder |
| Extractor output | Requirement count, count with ≥1 citation, `confidence` distribution | Zero requirements from a non-garbage document; every requirement `low` confidence | C1, `no_requirements_found` park | PM |
| `/internal/grounding-check` | Per requirement: `grounded`, match kind (`exact` / `whitespace_normalized` / `not_found`), and for `not_found` the **quote that failed**, truncated | Whitespace-normalized matches rising as a share — the model is drifting away from verbatim quoting, one step before it stops grounding at all | M1, C2 | Builder |
| Injection tripwire | Whether a payload pattern matched, which one, and the resulting park | Any match in production traffic; **no** match on fixture H1 (the tripwire has broken) | C6 | Builder |
| `/internal/score` | Inputs (the four factors) and the computed score, stored side by side | A stored score that does not equal the recomputation from its stored factors — meaning something other than this endpoint wrote it | C3, non-negotiable | Builder |
| Assembler | `prd_version_id`, requirement/epic/feature/story counts, grounding rate at assembly | Story count of 0 with a non-zero feature count; grounding rate below the floor | M1 | PM |
| Review UI, each ReviewAction | `session_id`, item type and id, `decision`, **`reason`** (required on reject and edit), before/after text on an edit, timestamp | Edits with empty reasons (the field has been made optional by someone); a session where every action is `approve` in under a minute | M2, M3 | PM, and Vaibhav as owner reading M3/M4 together |
| Ungrounded override | The explicit "approve anyway" as its own action kind, with its reason | Overrides becoming routine rather than exceptional — the badge has stopped meaning anything | M1's honest companion | PM |
| Sign-off endpoint | `approved` event with `trace_id` and timestamp; the recomputed precondition result | A sign-off attempt refused by the precondition — means the UI enabled a button it should not have | M4 (end endpoint) | Builder |
| WF4 error handler | `trace_id`, `component`, reason code, envelope snapshot | Any `dead_letter`; a rise in `service_unreachable` | Needs-attention queue | Operator |
| WF6 judge sweep | Sample size, per-item scores, rubric version, **whether the sweep ran at all** | The sweep silently not running for a week; judge scores diverging from label-based C1 over time | Monitoring only — never a gate | Builder |

Every field needs a **why it exists**. The one people skip and later regret:

> **`prompt_version`** — the git short hash of the prompt file used for the call. It is
> the variable most likely to change behaviour, and it changes without the code changing.
> Without it, a quality drop between two weeks is unattributable and the investigation
> starts with "what did we change?" answered by memory.

A second one, specific to this product:

> **match kind on the grounding check** — not just `grounded` true/false. The slide from
> exact quoting to whitespace-normalized matching is the early warning that precedes the
> slide to ungrounded. A boolean would hide the entire warning period.

**A signal with no named owner and no defined "bad" is not worth logging.**

## What we deliberately do NOT capture

Say this out loud, with the reason for each:

- **Full prompt and completion bodies for every call.** They duplicate the source document
  — which is already stored, immutably, as `raw_text` — into a second place with no
  consumer, and would multiply the footprint of any real transcript. What is captured
  instead is the `prompt_version` hash plus the structured output, which is enough to
  reproduce a call by hand. The exception is a `dead_letter`, which stores the malformed
  response body, because that is the one case where the text itself is the evidence.
- **Model internals** — logprobs, token-level anything. Nothing in this product consumes
  them, and capturing them would invite tuning against a signal no metric uses.
- **Reviewer keystrokes or dwell time.** Tempting as an effort proxy for M3, and refused:
  it is surveillance of the one user, it would need consent this pilot cannot obtain
  meaningfully from its own author, and ReviewActions already answer the question.
- **Any telemetry to a hosted third party.** No dashboards SaaS, no error-reporting
  service. Everything stays in `data/prdgenie.db` on this machine; source documents are
  the product's most sensitive asset and shipping them off-box for convenience would
  contradict the privacy guardrail this build promises.

## Rules

- **Observability may fail; the product may not.** Every telemetry write is a
  parallel, continue-on-failure branch: the `events` and `llm_calls` inserts never block
  a pipeline step, and a failed insert is dropped with a console warning rather than
  raised. Verify by stopping the review service's logging path mid-run — the run must
  still reach `in_review`. **This is a drill, not a claim: it is a step in the E8 UAT
  script and gets a date when it is actually performed.**
- **Measure at the source.** `cost_usd` is computed from the token counts the provider
  returns, not from a character-count estimate. Where a price must be applied from a
  local table, the row is labeled `estimated` so a correction can sit beside it later
  instead of overwriting it — `usage_source IN ('provider_reported','estimated')`.
- **One id joins everything.** `trace_id` appears on `source_documents`, `requirements`,
  `prd_versions`, `events`, `llm_calls`, `judge_scores` and `dead_letters`, so "what
  happened to this document, what did it cost, and was it any good?" is one query.


## The observability drill — performed 2026-09-03 (E8-S4)

**The promise under test:** telemetry may fail; the product may not. `/internal/llm-call`
failures are caught and logged rather than raised, and WF0's `Log the call` node is the
declared telemetry exception in `check-failure-routing.mjs`. Both were intentions until today.

**How the fault went in — on the real path, mid-run.** WF0's telemetry node was pointed at a
local pass-through proxy in front of the real service (an address change, the one move the
provider drill established as legitimate; WF0 restored byte-for-byte afterwards, asserted by
hash). A real fixture (E1) ran through real n8n against the real provider, and the proxy was
killed **after the run's first model call had logged and before its last** — so logging had
demonstrably worked for that very run before it died.

**Result, twice (BUG-021):**

| | control (proxy healthy) | round 1 | round 2 |
|---|---|---|---|
| calls logged for the trace | **5** | **1, then silence** | **1, then silence** |
| run state | in_review | in_review | in_review |
| grounded | 5/5 | 5/5 | 5/5 |
| parks / dead letters | 0 | 0 | 0 |

**The product outcome was indistinguishable from the control** — same state, same grounded
count — and the amputation is visible in the data rather than claimed: the drilled traces
carry one `llm_calls` row where the control carries five.

**What the drill does not show, stated:** the missing four rows are gone, not delayed. That is
the accepted price of "telemetry may never stop a run" — a drilled trace's cost figures
understate it forever, which is one more reason M5 marks itself provisional while verification
traces sit in its population.

Command: `.\run.cmd review-ui/scripts/drill-telemetry.mjs` — 9/9, self-restoring, repeatable.

## The judge's calls are costed like every other (E7-S5)

Every judge call goes through WF0, so it writes an `llm_calls` row with `component='judge'`,
its own model name and its own cost — priced from the same local table and labelled
`estimated` like the rest. Two consequences worth stating out loud:

- **"The judge is cheap" is a figure, not a belief.** It comes off the same table that answers
  M5, filtered to `component='judge'`.
- **A sweep's spend lands on the judged item's trace.** M5 is cost per approved PRD and joins
  through `trace_id`; a sweep of an old version therefore adds a fraction of a cent to *that
  run's* cost, so a version judged twice reads as marginally more expensive than one never
  judged. **This is a known imprecision, recorded rather than corrected silently** — bounded
  by the sample size, and visible because `component` says which rows are the judge's.

## The judge-unavailable drill — performed 2026-09-03 (E7-S5)

**The promise under test:** when the second opinion cannot be had, the sweep says so — and
never asks the vendor that wrote the thing to mark it.

**How the fault went in.** WF0's judge node was pointed at a local stand-in server (an address
change, the move E7-S4's drill established as legitimate; the credential was untouched and WF0
was restored byte-for-byte afterwards, asserted by hash). Real n8n, real service, real door,
real sample of 22.

| | round 1 | round 2 | control (same address, answering) |
|---|---|---|---|
| sweep status | **skipped** | **skipped** | **complete** |
| reason recorded | `llm_error (22 of 22 calls)` | `llm_error (22 of 22 calls)` | — |
| provider's words stored | "The model is overloaded…" | "The model is overloaded…" | — |
| scores stored | **0** | **0** | **22 of 22** |
| OpenAI calls made | **0** | **0** | 0 |
| lock released | yes | yes | yes |

**The control dials the same stand-in, answering**, so exactly one thing varies: whether the
judge replies. A control against the live provider would have varied the address, the vendor,
the network and the day's quota at once — and would have gone red for a reason that has
nothing to do with what is being tested.

**A number the drill produced by accident, worth keeping:** 22 calls against a refusing server
produced **44 requests**. So a 5xx *is* retried by the HTTP node even though `neverError` keeps
it out of the error path — the retry is a second attempt and only the second reply is
classified. That was believed to be otherwise until it was counted.

**Every sweep the drill caused is marked in the record.** The control stores 22 real-looking
scores written by a stand-in; the sweep row carries a `note` saying so and the page prints it.
A score nobody held must not be readable as an opinion.

Command: `.\run.cmd review-ui/scripts/drill-judge-unavailable.mjs` — 18/18, self-restoring.

### What the live provider did, on the same day

| sweep | model | outcome |
|---|---|---|
| #7 | `gemini-2.5-flash` | 22 of 22 refused — **the model ADR 0001 named is closed to new keys** |
| #8 | `gemini-3.8-flash` | **5 scores**, then the per-minute meter |
| #9 | `gemini-3.8-flash` | **3 scores**, rest overloaded |
| #10 | `gemini-3.7-flash` | 22 of 22 — no free quota at all for that model |
| #14, #15 | 3.8, 3.6 | `llm_no_credit`, Google's quota message stored beside it |

That table is the honest answer to "does the judge work": **it works, and a free-tier key buys
a handful of items a day.** The behaviour when it runs out is the behaviour this story asked
for, and it was exercised for real rather than simulated.


## The attempt column started moving on 2026-09-03 (E2-S4)

This table has said since E1 that every model call records `attempt` (1 or 2) and that **a
climbing attempt-2 rate is how a model returning malformed JSON more often announces itself**.
Until E2-S4 that number could not move: an unparseable answer parked on the spot, and the only
retry in the system was n8n's at the HTTP node — which fires when nothing answers, is invisible
to `llm_calls`, and cannot see a 200 carrying prose.

**What is retried, and what is not.** A bad ANSWER is retried once; NO answer is not.

| the provider... | retried by the workflow | why |
|---|---|---|
| returned something that will not parse | **yes, once** | it may parse on the second ask |
| returned an auth error, an empty balance, a rate limit | no | asking again spends money on a condition that cannot pass |
| did not answer at all (timeout, dropped connection) | not by the workflow — n8n's node retries it | there is nothing to classify yet |

**Both attempts write a row**, never one merged row: a merged row would hide exactly the
signal this table names. The condition is `attempt == 1`, so the retry is bounded by the
attempt itself rather than by a counter somebody has to maintain.

**What a retry actually buys, stated rather than implied:** at temperature 0 the second ask is
not a fresh sample — it buys the small non-determinism the provider has left. The durable
value is the RATE across many runs, not the second answer in any one of them.

Drill: `.\run.cmd review-ui/scripts/drill-retry-attempts.mjs` — 12/12, twice, with the
control (an empty balance) proving the retry is not simply "try everything twice".
