# E2-S4: What every run costs, and how much the answer varies

**As an** operator
**I want** real token counts and cost on every model call, and a reported range rather than a lucky run
**So that** a published number describes the system rather than the afternoon it was measured on

## Acceptance criteria

- [ ] Every WF0 call writes an `llm_calls` row: `trace_id`, `component`, `prompt_name`,
      `prompt_version`, `model`, prompt and completion tokens, `latency_ms`, `cost_usd`,
      `attempt`, `outcome`.
- [ ] Token counts come from the **provider's reported usage**, never a character estimate.
      Rows priced from a local table are labeled `usage_source = 'estimated'` so a
      correction can sit beside them later instead of overwriting them.
- [ ] `prompt_version` is the git short hash of the prompt file used, captured at call
      time — the variable most likely to change behaviour without the code changing.
- [ ] A retried call writes **two** rows (`attempt` 1 and 2), not one merged row: the
      attempt-2 rate is the drift signal in `docs/traceability.md`.
- [ ] `npm run eval:spread` runs produce+grade three times and reports each case's **range**
      — min, median, max — not the best run.
- [ ] Where a range straddles a threshold, the output says so explicitly rather than
      reporting the median as though it settled the question.
- [ ] `npm run db:query -- cost-per-prd` returns a hand-checkable figure, and the number is
      hand-recomputed once from the rows during verification.

## Depends on
- E2-S2

## Eval gate
- none — this is instrumentation, not judgment. It is verified by running it and by the
  hand-recomputation in the final criterion.

## Technical notes

- **Spread is on demand during iteration, mandatory before publication** (PRD-E2, decided
  by Vaibhav). No figure reaches the deck, the video, the charter, or any quoted result
  file without its range. A single run is a diagnostic; only a range is a number.
- If a published figure is later found to be a lucky draw, it is **retracted in writing**
  with what replaces it — never quietly updated (`evals/README.md` rule 4).
- Telemetry writes are parallel and continue-on-failure: a failed `llm_calls` insert must
  never stop a run. The drill that proves this is E8-S4.
- WF0 is the only workflow holding the provider credential, which is what makes this
  logging unbypassable — there is no second path to a model to forget to instrument
  (`docs/architecture.md` guardrail table).
- Cost per PRD is M5 in `docs/metrics.md`, and it never appears without the quality figure
  it bought beside it (guardrail pair). Wiring the query here; the report surface is E8.
