# E8-S3: A baseline that refuses to be a percentage

**As a** sponsor
**I want** the one human-effort measurement this project has to be recorded with its limits
**So that** the most tempting number in the deck is the one we deliberately did not compute

## Acceptance criteria

- [ ] Vaibhav hand-writes a PRD from **T1**, timed, once. The timing is stored.
- [ ] It is stored **labelled**: *single-subject, not blind, illustrative only* — the label
      travels with the number everywhere it is rendered.
- [ ] **No percentage is derived from it, anywhere.** Not in the page, not in the report, not
      in the deck. This is the PRD decision and `docs/metrics.md` already forbade it.
- [ ] The `baseline_status` control-plane row exists and drives the caveat in E8-S1 and
      E8-S2 — changing the row changes both surfaces and no prose is edited.
- [ ] The reason the comparison is refused is written **where the number is shown**, not only
      in a doc: the available PM has seen the fixtures and the labels.

## Depends on
- E8-S1

## Eval gate
- None. This is a recorded anecdote by construction.

## Technical notes

- **A recorded-and-refused number is more honest than a missing one** (PRD decision 1). The
  refusal shows the reasoning; silence looks like an oversight.
- Expect pressure on this in E9. The deck slide that says *"we did not compute this, and
  here is why"* is a stronger claim than any percentage would have been.


---

## Decided 2026-09-03, by Claude at Vaibhav's request: **there will be no week-zero baseline**

The absence is the deliverable. `baseline_status` stays `'none'`, every efficiency figure
keeps its computed *illustrative* line, and the deck says **"unmeasured"** with the study that
would measure it — not a percentage.

**The reasoning, in the order it decided the question:**

1. **A baseline written by me is worthless**, and everyone already agreed why: a "before" time
   produced by the thing being measured is a demo, not a measurement.
2. **A baseline written by Vaibhav *now* is nearly as weak, and the machinery makes weak worse
   than none.** He has read T1 dozens of times, written its answer key, and reviewed hundreds
   of system outputs built from it — his hand-written PRD is anchored in both directions, and
   his timing measures familiarity as much as effort. `docs/metrics.md` already names the real
   study: *three PMs who have not seen the fixtures, hand-logging times for a week.* One
   contaminated data point is not a cheap version of that; it is a different thing wearing
   its name.
3. **The decisive part is mechanical.** Recording any baseline flips `baseline_status` to
   `'recorded'`, and the caveat machinery — built precisely so nobody has to remember honesty —
   would then **remove the illustrative line from every report, page and metric at once.** A
   weak baseline would not sit beside the caveat; it would *silence* it. Trading an honest
   "unmeasured" for a weak "measured" is a downgrade this system would then propagate
   automatically, which is the strongest possible argument for not feeding it one.

**What this costs, plainly:** the deck cannot claim a time saving, ever, in any form — the
premise of the product stays a hypothesis (`docs/assumptions.md` already lists it as one,
with zero evidence claimed). That is the right cost. A project that says *"here is exactly
what we did not measure, why, and what the honest study looks like"* is worth more than one
decorated with a percentage whose provenance cannot survive a single question.

**The door stays open, and the machinery holds it:** if a clean study is ever run — new PMs,
unseen documents — recording it flips the status and every caveat retires itself, with nobody
editing prose. Until then, `none` is not a gap in the data. It is the data.
