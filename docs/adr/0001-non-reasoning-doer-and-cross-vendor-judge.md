# ADR 0001 — Use a non-reasoning doer and a cross-vendor judge

**Status:** accepted · **Date:** 2026-09-01

## Context

This is a self-funded side project. Every eval run replays nine fixtures through six model
calls each, and the spread rule (`docs/metrics.md`) requires running that three times
before reporting a figure — so the cost of *being honest about quality* is roughly 160
model calls per reported number. That budget, not raw capability, is the real constraint,
and it is worth writing down plainly.

Alternatives:

- **Reasoning models for extraction** (o-series, Gemini thinking) — disqualified on cost
  and latency per eval sweep, for a task that is span-faithful extraction rather than
  multi-step inference. They would genuinely be better at the clustering and delta steps,
  where taxonomy judgment is real; that is conceded, and if C4 or C5 sit near their
  thresholds this ADR should be amended rather than the thresholds lowered.
- **One vendor for both doing and judging** — disqualified by this project's rule that the
  grader is never the doer: a model marking its own family's work shares its blind spots,
  and an agreement score would then measure style, not truth.
- **A local model (Ollama)** — disqualified by structured-output reliability at the
  mini tier, which the whole span-citation design depends on.

## Decision

The doer is OpenAI **`gpt-4.1-mini`** in strict structured-output mode, for every
generation step. The judge is Google **Gemini 2.5 Flash** with thinking budget 0. Both
are non-reasoning. The judge is one tier *better positioned* than the doer only in that
it reads the full source and the full PRD in one context — it is not asked to out-think
the doer, only to disagree with it from outside its vendor.

The judge is a **non-blocking monitor**: it never gates a story, never gates a PRD, and
its scores are never ground truth. Ground truth is the hand-written labels in
`evals/datasets/labels/`. When the judge is unavailable the sweep records that it was
skipped and **does not fall back to OpenAI** — better that marking pauses than that the
student marks the paper.

## Consequences

- Cost per full eval sweep stays low enough that the spread rule is actually affordable,
  which is the only reason it will actually be followed.
- Cross-vendor disagreement becomes a usable signal for prompt drift over time.
- **Accepted cost:** the mini tier will underperform on clustering taxonomy and on
  subtle contradiction detection. Expect C4 and C5 to be the tightest cases, and expect
  to spend prompt effort there instead of model spend.
- **Accepted cost:** two vendor credentials to manage in n8n instead of one.
- Forces the WF0 subworkflow: since exactly one model is the doer, exactly one workflow
  should hold that credential, which is what makes cost logging unbypassable.
- If a reported figure ever depends on the judge, this ADR has been violated.

## Reaffirmed 2026-09-01 — quality comes from the prompt, not the model tier

Restated at Vaibhav's request, because it is the standing temptation of this project: when
a case misses its threshold, the fix is **never** a larger or a reasoning model. The doer
stays `gpt-4.1-mini` — non-reasoning, cheap, and strict-schema capable — and the quality
budget is spent on prompt engineering instead. `gpt-4.1-nano` was considered and rejected:
verbatim span-faithful quoting is the one thing this system cannot degrade on, and nano's
instruction adherence on strict schemas is not worth the saving.

The techniques the prompts are expected to carry, in place of model capability:

- **Strict JSON schema on every call**, so the model's only job is filling a shape. Most
  "the model got confused" failures are unconstrained-output failures wearing a costume.
- **Verbatim quoting stated as a mechanical rule, with the reason** — the quote is
  substring-matched by code, so a paraphrase silently fails. Telling the model *why*
  verbatim matters outperforms telling it to be careful.
- **Few-shot examples drawn from a fixture that is not in the eval set**, so the examples
  cannot leak the answer key.
- **One job per call.** Extraction does not cluster; clustering does not see `raw_text`.
  A narrow call from a small model beats a broad call from a large one, and each narrow
  call is separately gradeable.
- **Explicit refusal instructions** — return `[]` rather than inventing, and say when
  something is uncertain. Small models over-produce when not told that empty is allowed.
- **Negative instruction on the fields code owns** (`grounded`, scores): not merely
  omitted from the schema but named as forbidden, since the schema alone leaves the
  model guessing about intent.

If a threshold is genuinely unreachable after three honest prompt iterations (PRD-E2), the
response is a BUG card naming the failure pattern — not a model upgrade, and not a lowered
bar. A model change would need this ADR amended, with the cost consequence stated.

## Amendment 1, 2026-09-03 — the judge model, because 2.5 Flash refused the key

**`gemini-2.5-flash` is listed by the API and cannot be called by this credential:**

```
This model models/gemini-2.5-flash is no longer available to new users.
Please update your ...
```

A key created on 2026-09-03 is a new user. This is a **premise change, not a preference**,
and it is recorded here rather than absorbed into the story that hit it (E7-S5).

**The judge is now `gemini-3.8-flash`**, thinking budget 0. Chosen from what the credential
can actually reach:

- **Non-preview and pinned.** `gemini-flash-latest` would have worked today and quietly
  become a different model later, so a stored `judge_model` would stop naming what ran.
- **Flash, not Pro, not Lite.** The judge reads a whole document and one item; that is the
  flash tier's job. Lite is a step *below* the doer, which would make disagreement mean
  less rather than more.
- **The cheap half of the flash range, not the old one.** `gemini-3.5-flash` is $1.50/$9.00
  per 1M tokens; 3.6, 3.7 and 3.8 are all $0.75/$3.75 — *the newer models are half the
  price of the older one*. Picking "the oldest available" out of conservatism would have
  doubled the bill for no gain.
- **Price is recorded with its expiry:** $0.75/$3.75 holds through 2026-12-31 and doubles on
  2027-01-01. `PRICE_PER_1M` is a flat local table and does not encode the date — a table
  that changed price at midnight would make two identical sweeps cost differently for no
  reason a reader could see. The new price is added when it applies; old rows keep theirs.

**Nothing else in this ADR moves.** The doer is unchanged, both sides stay non-reasoning,
the vendors stay different, and the judge still gates nothing.

**One consequence found by doing it:** the free tier meters requests per minute, and 22
calls in 90 seconds spends the meter after the first few. The sweep is therefore **paced,
one call every twelve seconds** (WF6). That is not politeness — an unpaced sweep judges the
rows that happened to be drawn first and calls the result a random sample, which would make
the sample size on every judge figure a lie. **Nobody is waiting for a sweep**, so the
minutes are free; the doer, which somebody is waiting for, is not paced.

### What the free tier actually allows, measured rather than assumed

The credential is on Gemini's **free tier**, and that is the binding constraint — not the
model. Measured on 2026-09-03, across nine real sweeps:

| model | what happened |
|---|---|
| `gemini-2.5-flash` | listed by the API, **refuses this key**: "no longer available to new users" |
| `gemini-3.7-flash` | **no free quota at all** — 22 of 22 calls refused immediately |
| `gemini-3.8-flash` | **answers**, then meters: 5 scores, then 3, then the day's quota was spent |
| `gemini-3.6-flash` | refused too, once the project's free allowance was gone |

So the judge is pinned to **`gemini-3.8-flash`** — the one that answered — and the honest
statement of what this deployment can do is: **a free-tier key buys a few sweeps a day, not a
nightly one.** That is recorded in `docs/assumptions.md` rather than dressed up, and it is why
the demo is manual-only rather than merely convenient.

**The system's behaviour when the allowance runs out is the behaviour this story asked for**,
and it was exercised for real rather than simulated: the sweep closes `skipped`, carries the
provider's own words, invents no scores, asks OpenAI nothing, and releases the lock.

**Not done, and named:** enabling billing on the Gemini key would make nightly sweeps real. It
is a spending decision, so it is Vaibhav's, and it is on the decision page rather than assumed.

## Amendment 2, 2026-09-04 — sample the hard cases, and do not let that move a rate

**Vaibhav enabled billing and decided the shape in the same breath: sample, do not judge
everything.** The sampling half is the interesting one, because the sweep was *already*
sampling — randomly, boundedly, 22 items. What it was not doing was reaching anything.

**The number that forced this:**

```
requirements judged ......... 27
of those, ungrounded ........   0
ungrounded in the corpus .... 108 of 7,072   (1.5%)
```

The rubric's central defensive clause is *"a flagged-ungrounded item is never a violation."*
A uniform draw of twenty touches an ungrounded row about a quarter of the time, so that clause
was being exercised roughly weekly, by coincidence. **A monitor whose main rule fires by
accident is not a monitor.**

**The decision: quotas across outcome strata** — `ungrounded` 4, `approved_anyway` 2,
`human_edited` 2, `nonfunctional` 3, `constraint` 3, `uniform` 6. Same 22 calls, same ~$0.03,
different rows.

**And the constraint that makes it honest, which is the part worth an ADR.** Stratifying a
sample is the easiest way to lie with one: over-sample the difficult rows, pool the verdicts,
and the >40% disagreement rule fires on a draw *selected for difficulty*. So **a row drawn
because it is hard never enters the rate.** Exclusion is by targeted stratum rather than by
inclusion of `uniform`, so a row of unknown provenance still counts — the conservative
direction, where the alarm fires more easily rather than less. `verify-strata.mjs` TC7/TC8 is
the pair that proves it: the same contradictions, on the same rows, fire the rule when drawn
uniformly and do not when drawn as `ungrounded`. One thing varied.

**Two rules kept from the previous design, deliberately.** No stratum reads `source_channel`,
`doc_type` or `authorship` — the spine rule holds for the monitor too, and the check derives
those column names from the sampler's SQL rather than trusting a comment. And the stratum
never travels to the model: telling a judge *"we already suspect this one"* ends its
independence exactly as showing it the labels would.

**Still not done, and named:** billing on the account is not the API key's project being on
the paid tier. Sweep #19, run after billing was enabled, scored 1 of 22 and recorded Google's
own quota message on the other 21. The sample now asks about four ungrounded rows a sweep;
none has been answered yet, and `/api/judge` prints that as `ungrounded 0 of 108` rather than
letting the presence of scores imply coverage.
