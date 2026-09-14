# E7-S6: A sample that reaches the hard cases

**As a** builder
**I want** the judge sweep to draw a stratified sample instead of a uniform one
**So that** the rows the rubric was written for are actually judged, at the same cost

## Why this exists (measured 2026-09-04, before any code)

Billing is enabled on the Gemini key (Vaibhav, 2026-09-04), and the decision that came with
it was **sample, do not judge everything**. The sampler already samples. What it does not do
is reach the cases that matter:

```
requirements judged so far ....... 27
of those, ungrounded ............. 0
ungrounded rows in the corpus .... 108 of 7,072   (1.5%)
```

**The rubric's central defensive clause is "a flagged-ungrounded item is never a violation."
It has never once been exercised.** A uniform draw of 20 touches an ungrounded row about a
quarter of the time, so at a sweep a night the clause gets tested roughly weekly, by accident.
That is not a monitor; that is a coincidence with a cron entry.

Same twenty-two calls, same ~$0.03 a sweep. The change is *which* rows the money is spent on.

## Acceptance criteria

- [ ] **The sample is drawn by quota across named strata**, each a constant in `judge.mjs`,
      each with a one-line reason in the code beside it. `uniform` is one of them and is
      never zero — a sample made entirely of interesting rows is not a sample of anything.
- [ ] **Every `judge_scores` row records the stratum it was drawn from.** A score whose
      stratum is unknown is the same defect as a figure with no denominator.
- [ ] **The disagreement rule is evaluated on the `uniform` stratum only.** Over-sampling
      hard rows and then reporting the pooled rate would let the sampler manufacture its own
      alarm — the >40% rule would fire on a draw that was chosen to be difficult. Targeted
      strata are reported **per stratum, as counts, never pooled into a rate**.
- [ ] **A stratum that cannot be filled is printed as short, with the number it wanted and
      the number it got**, and its unfilled quota flows to `uniform`. A quota that silently
      shrinks is a coverage claim nobody can check (BUG-003/019/032).
- [ ] **The page's coverage line becomes per-stratum.** "6,758 never judged" stops describing
      anything once 1.5% of the corpus is 20% of the sample; each stratum prints its own
      judged/total.
- [ ] **No stratum branches on `source_channel`, `doc_type` or `authorship`** — the spine rule
      holds for the monitor too. Strata are outcome properties (grounded, human decision,
      requirement kind, version state), and the check derives the forbidden columns rather
      than trusting this sentence.
- [ ] **A negative control**: a planted stratum whose quota cannot be met turns the check red
      and names it; and a run with the stratifier disabled reproduces the old uniform draw,
      so the change is visible rather than asserted.
- [ ] One real sweep against the live provider, with the per-stratum table archived — and
      **at least one ungrounded row judged**, which has never happened.

## Depends on
- E7-S5 (done)

## Technical notes

- **`disagreementFor` already excludes `grounded_at_judge_time === 0`**, so the ungrounded
  stratum cannot pollute the 40% rule — it is excluded by the defensive rule before the rate
  is computed. The strata that *can* pollute it are the kind-based ones, which is why the
  rule moves to `uniform` rather than relying on that exclusion.
- Quotas are constants, not settings, for the reason `MAX_REQUIREMENTS` is: a quota that can
  be raised for one sweep is a quota that means nothing across sweeps.
- `approve_ungrounded` rows (a human ticked "approve anyway", 10 in the corpus) are the
  highest-stakes rows in the database: the system said it could not find the evidence and a
  person shipped it regardless. They are also `grounded=0`, so they are judged and reported
  and never counted as violations.
- Cost does not move: the sample size is unchanged. If a later sweep wants more rows, that is
  a separate decision with a separate number, not a side effect of this story.
