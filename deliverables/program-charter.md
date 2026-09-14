# Q2 — Program Charter: PRD Genie (Pilot)

**NeuronForge Technologies · Product & Innovation · 2026-09-01 · Owner: Vaibhav, AI PM**

## Vision

A PM leaves a requirements call and has, within minutes, a structured PRD in which every
line is traceable to the words someone actually said — and which they update by
*talking to stakeholders again*, not by re-reading it. The machine drafts and
reconciles; the human decides and signs.

## Objectives

1. **Cut reconciliation, not judgment.** Turn multiple source documents into one
   structured PRD with epics, features and stories, so the PM's time goes to deciding
   rather than collating.
2. **Make every requirement checkable in one click.** A verbatim citation per requirement,
   verified by code, so verification costs a click instead of a re-read.
3. **Surface what was *not* decided.** Conflicts, unanswered questions and missing
   non-functional categories, as a first-class output.
4. **Keep the PRD alive.** A follow-up meeting produces a reviewed delta, not a second
   document nobody reconciles.
5. **Prove it rather than claim it.** Every quality claim backed by a labeled eval case
   with a threshold; no efficiency claim made without a baseline.

## Scope

**In scope (pilot):** four document types through two ingestion doors; requirement
extraction with citations; ambiguity and gap detection; clustering into epics and
features; story drafting with acceptance criteria; RICE prioritization with the arithmetic
in code; PRD assembly and versioning; a review UI with per-item approve/edit/reject and a
sign-off gate; living-PRD deltas; privacy, grounding and injection guardrails; a labeled
eval harness with six cases; metrics and a weekly report.

**Explicit non-goals** — the load-bearing half of this section:

- **Not** transcription. Text in, always.
- **Not** an autonomous publisher. Nothing reaches a team's backlog without a human
  signing; there is no auto-push to Jira, by design rather than by omission.
- **Not** multi-tenant, and **not** authenticated. Single local operator. This is the
  largest known gap and is stated in the README, the assumptions doc and the deck.
- **Not** a replacement for the PM's judgment on priority. RICE factors are model
  suggestions; the PM edits them and the edit is logged.
- **Not** a general defense against prompt injection. Three labeled payloads, 100%; that
  is the claim, and it is narrower than "hardened".
- **Not** measured against a human baseline. No time-saved percentage is claimed.

## Success criteria

| # | Criterion | How it is judged |
|---|---|---|
| 1 | End-to-end: a transcript becomes an approved PRD, and a follow-up updates it | Demo on ≥5 documents across ≥3 types |
| 2 | Extraction quality | Eval C1: recall ≥0.80, precision ≥0.75 against labels written before tuning |
| 3 | Nothing invented | Eval C2: **zero** requirements marked grounded whose quote is absent. Any occurrence fails at any accuracy |
| 4 | Injection resisted | Eval C6: **100%** on three labeled payloads |
| 5 | The gate is real | The trigger refuses a hand-run `UPDATE … SET state='approved'`, demonstrated live |
| 6 | Draft quality is measured, honestly | Accepted-unedited rate and edits-per-requirement reported *with* their guardrail pairs, and with a computed caveat while no baseline exists |

Criteria 2–4 are automated and gate stories: an eval-gated story cannot be marked done
until its case passes and the dated result is archived.

## Timeline

| Milestone | What lands |
|---|---|
| Phase 0 | Charter, problem write-up, domain/contracts/architecture docs, 8 ADRs, eval coverage matrix |
| E1 | Walking skeleton: one transcript → approved PRD, with the trigger proven. Nine fixtures and their labels written |
| E2–E3 | Extraction quality + eval harness; clustering, stories, deterministic RICE |
| E4–E5 | Full review gate with citations and edit-with-reason; multi-source doors |
| E6–E8 | Living-PRD deltas; guardrail hardening and judge sweep; metrics and weekly report |
| E9 | Deck, demo video, credential-stripped workflow export, run-it-yourself README |

## Risks

| Risk | Likelihood | Impact | Response |
|---|---|---|---|
| Plausible-but-wrong requirements erode trust | High | Fatal to adoption | Code-checked citations; C2 auto-fail; ungrounded items badged and only approvable via a logged override |
| Prompt injection in a source document | Medium | Severe — the output is built from | Three defense layers; C6 at 100%; claim kept narrow |
| Delta churn makes follow-ups worse than manual editing | Medium | Kills the differentiating feature | C5 measures churn at zero, not just correctness |
| Quality drifts as prompts change | High over time | Slow trust loss | `prompt_version` on every call; dated eval archive; cross-vendor judge sweep as an early warning |
| Cost grows unnoticed | Medium | Budget | Every call logged with real token counts; cost per PRD is a reported metric. **No spend cap exists** — declared, not solved |
| Two-process local setup fails on a fresh machine | High at demo time | Embarrassing | Run-it-yourself README front-loads the Docker networking trap; full dress rehearsal before release |
| The PM feels measured by edit rate and stops editing | Medium | Corrupts the data and the product | Metric paired with cycle time so rubber-stamping is visible; stated openly in enablement |

## Stakeholders

| Stakeholder | Interest | What they need from this program |
|---|---|---|
| **Product Managers** (primary users) | Less collation, more deciding | A draft good enough to edit rather than rewrite; citations they can check in a click |
| **Engineering leads** | Requirements they can build from | Traceability — "who asked for this" answerable without the PM |
| **Head of Product** (sponsor) | Cycle time and consistency | Honest numbers, including the ones that aren't ready |
| **Legal / Security** | Where transcripts go | Redaction at ingest, local storage, and a written statement of what is *not* protected yet |
| **Stakeholders in the room** | Being represented accurately | Their words quoted, not paraphrased; their disagreements surfaced rather than smoothed |
| **The AI PM** (me) | A defensible pilot | Evidence, not a demo |

## Communication plan

| What | To whom | When | Channel |
|---|---|---|---|
| Weekly insights report | Sponsor | Weekly, Monday | Markdown report in `reports/` (email in a real org) — figures from SQL, model writes only the commentary |
| Needs-attention queue | Operator | Continuous | Review UI |
| Eval results | Builder / reviewers | Every run | Dated files in `evals/results/`, never overwritten; corrections appended, never erased |
| Known gaps and limitations | Everyone | Continuously | `docs/assumptions.md`, biggest gap first, repeated in the README |
| Milestone walkthroughs | Sponsor | At each checkpoint | Live demo on real fixtures, including the failure cases |

The communication principle, stated once: **the uncomfortable numbers travel with the
flattering ones.** Accepted-unedited rate never appears without extraction recall beside
it; cycle time never appears without edit rate; and the count of PRDs that never reached
approval is reported next to the median time of those that did.
