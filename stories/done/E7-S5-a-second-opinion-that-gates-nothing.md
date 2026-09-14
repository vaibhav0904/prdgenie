# E7-S5: A second opinion that gates nothing

**As a** builder
**I want** an independent cross-vendor read on recent output
**So that** quality sliding between eval runs shows up before it becomes a trust incident

## Acceptance criteria

- [ ] **WF6** runs Gemini 2.5 Flash (thinking budget 0, non-reasoning) over a **bounded
      random sample** of rows not yet judged — up to 2 PRDVersions and 20 requirements per
      sweep, sampled by SQL.
- [ ] Every sweep stores **`trigger_source`** (`cron` | `manual`) and **`sample_size`**.
      A manual sweep is self-selected and must never be reported as a random one.
- [ ] **Nightly cron plus a manual trigger.** A manual trigger is **refused while a sweep is
      in flight** — two overlapping sweeps double-sample and inflate coverage. The demo
      environment is **manual-only**.
- [ ] The rubric is **defensive**: a flagged-ungrounded item is never a violation. Rubric
      version is stored with every score.
- [ ] **The judge never sees the labels.** A judge given the answer key is scoring against it
      and has stopped being independent.
- [ ] When Gemini is made unavailable on purpose, the sweep **records that it was skipped**
      rather than falling back to OpenAI or failing silently. No same-vendor fallback.
- [ ] **Judge scores are visibly absent from every gate** — no case, no threshold, no report
      figure depends on them. Verified by trying to find one and failing.
- [ ] **A BUG card opens automatically** when the judge disagrees with the labels **across
      three consecutive sweeps**, or on **more than 40% of judged rows in one sweep**. The
      card's investigation weighs **the rubric and the labels equally**.
- [ ] **No judge output ever changes a label, a threshold, or a gate.**

## Depends on
- E7-S2

## Eval gate
- None, and that is the point. If a case ever depends on the judge, ADR 0001 is violated.

## Technical notes

- **The grader is never the doer** (ADR 0001). Different vendor, different tier, non-reasoning
  on both sides of the project's cost discipline.
- **The auto-BUG thresholds are Vaibhav's, decided 2026-09-02** — three consecutive sweeps, or
  >40% of one sweep. They are written here so the rule is mechanical rather than a judgement
  call made when it is inconvenient.
- **Persistent disagreement is information, not noise.** The card investigates which of the
  two is wrong. Assuming the judge is wrong by default would make the whole sweep decorative.
- The sample size travels with every judge figure, for the same reason C6's does.
