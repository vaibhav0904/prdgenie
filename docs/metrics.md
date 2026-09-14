# Metrics

Each metric tied to a stated problem, each computable from rows that already
exist. **If it needs instrumentation that isn't built, it isn't a metric yet —
it's a plan.**

## The metrics

| # | Metric | Definition (exact) | The pain it maps to | Computed by | Who acts on it |
|---|---|---|---|---|---|
| M1 | Grounding rate | Per PRDVersion: requirements with `grounded = 1` ÷ requirements **the system claims to have grounded**, as a percentage. **Two exclusions, and they are one sentence: a requirement is out of M1 if a reviewer edited it, or if it came from a document the PM wrote themselves** (`pm_authored = 1` covers both). Editing must never raise the rate, and being quoted back to yourself is not corroboration. | "PMs can't trust AI-written requirements because they can't check where they came from." | `.\run.cmd review-ui/scripts/query.mjs m1` | Builder — a drop means the extraction prompt stopped quoting verbatim |
| M2 | Accepted-unedited rate | Per ReviewSession: count of ReviewActions with `decision='approve'` ÷ count of all ReviewActions in the session, as a percentage. Rejections and edits both count against. | "Documentation is manual, repetitive and iterative." Every edit is repetition the system failed to remove. | `.\run.cmd review-ui/scripts/query.mjs m2` | Vaibhav as PM — the headline quality-of-draft number |
| M3 | Edits per requirement | Per ReviewSession: count of ReviewActions with `decision='edit'` ÷ count of requirements in the reviewed version. A rate, not a percentage; can exceed 1 if an item is edited twice. | Direct proxy for residual PM effort — the thing this project sets out to reduce. | `.\run.cmd review-ui/scripts/query.mjs m3` | Vaibhav as PM |
| M4 | Cycle time to approval | **Median**, in minutes, from the `ingested` event to the `approved` event, joined on `trace_id`, over PRDVersions that reached `approved`. Versions never approved are excluded and counted separately. | "Delays in documentation, slower time-to-market." | `.\run.cmd review-ui/scripts/query.mjs cycle-time` — **per approved VERSION**, joined to the `approved` event through its `detail` | Vaibhav as owner |
| M5 | Cost per approved PRD | Sum of `llm_calls.cost_usd` over every `trace_id` that contributed to an approved PRDVersion, divided by the number of approved PRDVersions. | "Is this affordable to run?" — the number a buyer asks about second. | `.\run.cmd review-ui/scripts/query.mjs cost-per-prd` | Vaibhav as operator |

Every figure must be **reproducible by hand** from the source rows. This is not
a purity rule — recomputing a number by hand is how a real discrepancy gets
caught, and it will catch one.

**Verification status, stated precisely (2026-09-04).** All five are confirmed by **two
independent derivations**: the shipped SQL, and `review-ui/scripts/recompute-metrics.mjs`,
which pulls raw rows and does the arithmetic in JavaScript. **8 of 8 agree**, and two of those
rows are controls showing the check can fail — the double-counting derivation of M5 gives a
visibly different answer on every run, and a deliberately slack precision declaration widens
the tolerance until it swallows a difference it must not.

**Every figure declares the precision it is published at, and that declaration is what the
checker compares against (BUG-055).** It used to be inferred by stringifying the value, which
loses a trailing zero: M5 rounds to four decimals, `(0.000962).toFixed(4)` is `"0.0010"`, and
`Number()` makes that `0.001`. The comparison then ran at three decimals and **a 26% error
between M5's right and wrong derivations became invisible** — the control could not fail, which
is the same as not having one. `DP = { M1: 2, M2: 2, M3: 3, M4: 2, M5: 4 }` is now the single
place those digits live: the rounding, the declaration and the metrics page all read it.

**Say "two derivations agree". Do not say "hand-verified".** They are not the same claim.
Both derivations read the *definitions above*, so they agree on arithmetic and are silent on
whether the definitions are the right ones — whether `approve_ungrounded` should count as an
approval, whether a median is the right statistic for cycle time. A wrong definition is now
agreed on twice. That judgement was what E8-S1's human recomputation was for, and it remains
the one open item on that story.

**The *Computed by* column is load-bearing.** An unfilled cell means the metric
is a plan, not a metric. And re-verify the cell whenever either side changes:
the definition and the implementation are written at different times by
different moods, and a median in the doc will quietly become a mean in the SQL
— with a different endpoint — while both sides look done. Which reports carry
each metric lives in `reporting.md`.

> **Note on M4.** The definition says *median* and *`ingested` → `approved`*. The
> implementation must be checked against exactly that: a mean, or an endpoint of
> `draft_created`, would flatter the number badly and would still look finished. This
> note exists because that is the specific mistake the method's source project made.

## Built 2026-09-03 (E8-S1), and what building it found

Every metric above is now a named command that prints **the figure, the SQL it ran, and the
rows it aggregated** — `query.mjs m1` … `m5`, plus the `cycle-time` and `cost-per-prd` names
this file already published. The page at `/metrics.html` and the command read the **same
module**, `review-ui/metrics.mjs`; there is no second copy of any query, and
`verify-metrics.mjs` (46 checks) fails if one appears.

**Reading each definition against its implementation found three defects, in the
implementation, before anything shipped.** That is the exercise this file asks for, and it is
the first time it has been done on all five at once:

| | what the definition says | what the first implementation did |
|---|---|---|
| **M4** | *"over PRDVersions that reached approved"* | grouped by `trace_id`, giving **23 observations for 30 approved versions** — 23 traces carry those 30, and `MAX(approved_at)` silently kept only the latest approval of each |
| **M5** | *"divided by the number of approved PRDVersions"* | counted the denominator **inside** the join, giving **8** instead of 30, because only 8 of the 30 have model calls on their trace |
| **M5** | sum of cost over contributing traces | the join **double-counted** cost for any trace carrying more than one approved version — $0.0127 where the true figure is $0.0079 |

None was a typo, and all three would have rendered as finished numbers. The M4 one is the
mistake this file warns about **by name**, arriving in a form the warning did not quite
describe: not a mean under a median, but the right statistic over the wrong population.

**What the numbers say about the numbers.** M5 is currently `$0.0003` per approved PRD, and
that figure means almost nothing: **22 of the 30 approved versions were created by hand during
verification and cost nothing at all**, so the average is dragged toward zero by test data.
The metric prints that count as one of its own rows rather than burying it. The honest cost
figure is per *run*, and it is E2-S4's to build.

## Two decisions, delegated to Claude and recorded here (2026-09-03)

Vaibhav asked for both to be decided and the reasoning written down rather than answered.

### M2 counts `approve` only. An ungrounded override is not an acceptance.

The literal reading stands: `decision='approve'` over all actions, so the 10
`approve_ungrounded` actions count **against** the rate. M2 is **48.7%**, not 74.4%.

**The reason is the gaming path, not the wording.** M2's whole guardrail argument is that the
cheapest way to raise it is to extract fewer, vaguer requirements. There is a second cheap way,
and counting overrides as acceptances would open it: **a system that produced requirements the
grounding check could not verify would score well on quality, because the reviewer waved them
through.** That is the exact failure M1 and the ungrounded-override count exist to catch, and a
headline quality metric must not reward it.

It is also the same rule M1 already lives under, one step along. M1 says *editing must never
raise the rate*. The parallel here is **failing to ground must never raise the rate** — and an
override is the moment grounding failed and a human carried the requirement anyway.

**What it costs, stated:** an override is genuinely not an edit — the text shipped unchanged —
so this reading understates how good the drafts were. That is the direction to be wrong in.
**No second, friendlier figure is published**, because a 74.4% variant would exist only to be
quoted. The override count sits beside M2 everywhere it appears, and a reader who wants the
other number can add it up themselves.

### M4 and M5 mark themselves provisional, from a fact rather than a threshold

Both are computed correctly and both currently describe a population that is not what their
definitions name:

| | the population today | what that does to the figure |
|---|---|---|
| **M4** | **14 of 30** approved versions were signed off through a session that recorded **no decisions at all** | the median times a verification click, not a PM reading a PRD |
| **M5** | **22 of 30** approved versions carry **no model spend**, and the other 8 carry **one or two calls** against a complete run's five | M5 reports **$0.0003**; the median cost of a full trace is **$0.0082** — the wrong order of magnitude, not an imprecision |

**The fix is not to exclude rows quietly, and it is not a threshold.** "Approvals faster than
sixty seconds" would be a number invented to make the data look the way I expected, and this
project does not tune a threshold to its output. Instead each metric carries a `provisional`
mark derived from a **fact in the rows**, under a zero-tolerance condition — the shape already
used for C2's hallucinated-grounded and C6:

- **M4** is provisional while *any* approved version in the period was signed off with no
  review action recorded.
- **M5** is provisional while *any* approved version in the period contributed no model spend.

### M5's denominator: decided 2026-09-04, and not changed

The headline divides real spend by **every** approved PRDVersion, and most approved versions in
this database were built by a verification script and cost nothing — 40 of 74 on the day
BUG-055 was written, with 51 of them belonging to `verify-*` and `control-*` products. It is
tempting to filter those out and publish a cleaner number.

**The definition does not change.** It is what was published, it is what the `provisional` block
already describes in the metric's own output, and a metric re-defined because a control went red
is tuning wearing a better suit. What changed instead is that the figure a reader actually wants
now sits **beside** the headline with its own denominator stated:

| row | meaning |
|---|---|
| `approved versions (the denominator)` | every approved version, as the definition says |
| `of those, with NO model spend on their trace` | the scaffolding, counted |
| `of those the pipeline actually produced, cost each` | the same spend over the versions that cost something |

Two populations, two figures, both named. Neither is a correction of the other.

Each mark states **what would clear it**, and it clears itself: as real runs accumulate the
counts fall to zero and the mark disappears, with nobody editing prose. `verify-metrics.mjs`
forces both directions — a window containing none of those rows must carry no mark.

**The consequence, said plainly:** *this system cannot yet report what a PRD costs.* M5 will
become meaningful when approved PRDs come from complete runs. The question a buyer actually
asks — what does one run cost — is **E2-S4**, and it is not built.

## Every figure is published over two populations (BUG-065, 2026-09-05)

BUG-055 found this in M5 and fixed it in M5. It was never only M5.

Counting the denominators for a status report: **73 of the 107 approved PRDVersions in this
database were minted by a verifier and signed off a second later.** M2, M3, M4 and M5 all divide
by approved versions or by the sessions on them, so all four were mostly describing the test
suite. M4's median read **0.02 minutes** — 1.2 seconds from ingest to approval, which no human
has ever done.

Nothing was miscomputed. `verify-metrics` recomputes every figure from its own rows and agrees;
E8-S1's entire subject was that the arithmetic is right. **A number can be right about the wrong
thing**, and every guard in this project was pointed at the first half of that sentence.

**The predicate, and why it is this one.** A PRDVersion belongs to the *pipeline* population
**iff its `trace_id` carries at least one `llm_calls` row**. The pipeline cannot produce a PRD
without calling a model, so this is a fact about what happened. The tempting alternative — a
`product_id` prefix like `verify-*` — is a **naming convention**, and a naming convention is a
thing a future fixture joins by accident. `verify-populations.mjs` fails the run if a product-id
literal ever appears in a population's SQL.

Every metric is therefore reported twice, from **one implementation called twice** — the
function takes a scope, and there is no second copy of any metric's SQL:

| population | label |
|---|---|
| `all` | *across everything the database holds* |
| `pipeline` | *across runs the pipeline actually produced* |

**The published definitions do not change and the `all` figures do not change.** A metric
redefined because its number embarrassed you is tuning wearing a better suit, and TC2 of
`verify-populations` fails the run if any `all` figure moves. What changes is that a reader is
told which population they are looking at before they read a digit.

What it does to the numbers, on 2026-09-05:

| | all | pipeline |
|---|---|---|
| M1 grounding rate | 97.29% (n=8253) | 98.65% (n=7626) |
| M2 accepted-unedited | 76.14% (n=285) | 87.60% (n=129) |
| M3 edits per requirement | 0.123 | 0.089 |
| M4 cycle time | **0.02 min** (n=107) | **3.83 min** (n=34) |
| M5 cost per approved PRD | $0.0006 (n=107) | $0.0020 (n=34) |

**Two things this is not.** It is not deleting the fixture rows: they are the record of the
checks doing their job, and a metric that only reads well once the inconvenient rows are gone is
not a metric. It is not adding a caveat either — the page already carried caveats and a median
of 1.2 seconds was still the headline. *A caveat beside a wrong population is a footnote
apologising for the number above it.*

**A note on the 81% that became 68%.** Counting by product-id prefix said 87 of 107 were
fixtures; the derived predicate says 73. Fourteen versions are named like fixtures and really did
run the pipeline. The derived figure is the one that ships, and the gap between the two is the
argument for deriving it.

## Guardrail pairs

Some metrics are meaningless alone, because the cheapest way to move one is to
quietly ruin another.

> **M2 and M1 must be read together.** The cheapest way to raise the
> accepted-unedited rate is to extract fewer, vaguer requirements that are hard to
> disagree with. That shows up as C1 recall falling and, usually, M1 drifting as vague
> statements attract loose quotes. Neither number is meaningful on its own, and M2 is
> never reported without C1's recall beside it.

> **M4 and M3 must be read together.** The cheapest way to cut cycle time is to
> rubber-stamp. That shows up as edits per requirement collapsing toward zero at the same
> time — which looks like a triumph and is the opposite. A sudden fall in both is a
> reason to inspect a session by hand, not to celebrate.

> **M5 and C1 must be read together.** Cost per PRD falls if the pipeline stops doing
> work. Report it beside the extraction quality it bought.

## Non-negotiable metrics

Some metrics are not directional targets but hard floors, because a single
failure is an incident rather than a dip:

| Metric | Target | Why it is absolute |
|---|---|---|
| Hallucinated-grounded requirements (C2) | **0** | A requirement marked grounded whose quote is not in the source is the product lying about the one thing it claims. Any occurrence fails the case at any accuracy score. |
| Injection resistance (C6) | **100%** | The system reads other people's text and writes a document a team builds from. One obeyed instruction is a trust incident, not a dip. |
| PII redaction on labeled fixtures (C2) | **100%** | Un-redacted personal data reaching storage is not recoverable by fixing it later. |

## The baseline problem

You cannot claim an improvement without a "before". State honestly whether one
exists.

**There is no baseline yet.** Until there is, every efficiency figure in this project is
labeled *illustrative* — and the caveat is not prose, it is computed: reports read a
`baseline_status` row from the control plane and render the caveat line automatically
while it is `none`.

**Week-zero plan:** before the pilot, a PM works exactly as they do today and hand-logs
three fields per PRD — start time, time first draft is circulated, and count of
requirements in the final document. One week, no tooling changes. That is the honest
baseline for M3 and M4.

**The honest problem with doing that here.** This pilot has one PM, and he has already
read the fixtures and knows what the labels say. A self-timed baseline from someone who
has seen the answer key is not a baseline; it is an anecdote. So it is recorded as an
anecdote: `docs/metrics.md` will carry the timing when it is done, explicitly labeled
*single-subject, not blind, illustrative only*, and **no percentage improvement is
claimed from it** anywhere — not in the deck, not in the video. The honest version needs
three PMs who have not seen the fixtures, and that is named in `roadmap.md`.

**Shadow period:** every output already goes to a human before it goes anywhere — the
approval gate makes the shadow period free. That is an argument for having designed it
that way, and it means a real pilot can measure M2 and M3 from day one without changing
how anyone works.
