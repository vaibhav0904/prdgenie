# PRD-E2: Extraction quality you can prove

**Status:** Approved
**Date:** 2026-09-01 · **Approved:** 2026-09-01 by Vaibhav

## Problem

After E1 the system extracts requirements, cites them, and shows them to a PM who can
approve. Nobody knows whether the requirements are any good. Every quality statement this
project makes — "recall ≥0.80", "never invents a citation" — is currently a wish, and a
wish with a number in it is worse than no claim at all, because it reads as measured.

This epic builds the instrument before it builds any more product. It is deliberately
placed second: from here on, every prompt change has something that can tell you whether
it helped.

## Goals / Non-goals

**Goals**

- One command grades a run, and a failing verdict is a **failing exit code**.
- Running and grading are separate: the harness never produces the run it marks.
- C1 (extraction quality) and C2 (grounding fidelity, including PII) pass, with dated
  result files archived.
- Every model call logs its real token counts, cost, latency and `prompt_version`.
- The spread across repeated runs is reported, not the best run.

**Non-goals** — deferred deliberately, with reasons:

- **No cross-vendor judge** (E7). The judge is a monitoring signal and cannot gate
  anything; building it before the labeled cases exist would invite using it as ground
  truth, which is exactly the failure ADR 0001 refuses.
- **No new eval cases beyond C1 and C2.** C3–C6 grade capabilities that do not exist yet.
  A case written before its capability is a case whose threshold was guessed.
- **No structure, prioritization or ambiguity detection** (E3). The PRD stays a flat
  requirement list through this epic.
- **No threshold movement, ever, to make a case pass.** If C1 fails, the response is
  prompt iteration or a BUG card — never a lowered bar and never an edited label. This is
  written as a non-goal because it is the specific temptation this epic creates.

## Who this is for

The **builder** persona (`docs/reporting.md`): the person changing prompts who needs to
know whether quality is drifting and why. Secondarily the **owner**, because every claim
in the deck and the charter's success criteria 2 and 3 becomes checkable here or stays
rhetorical.

## Proposed scope → stories

- **E2-S1:** The `POST /webhook/ingest` door, plus `evals/harness/produce.mjs` replaying
  the nine fixtures through it. Grading is not part of this story, on purpose.
- **E2-S2:** `evals/harness/grade.mjs` and case **C1** — span-overlap matching per
  ADR 0008, recall and precision, per-item diff table, dated result file, non-zero exit
  on FAIL, and a printed produce command when there is no run to grade.
- **E2-S3:** Case **C2** — every `grounded = true` quote verified verbatim; a
  hallucinated-grounded requirement is an automatic fail at any score; PII redaction
  checked at 100% on fixture H2; fixture G1 must yield zero requirements and a park.
- **E2-S4:** Full call accounting on WF0 — provider-reported tokens, `cost_usd`,
  `latency_ms`, `attempt`, `prompt_version` — and `npm run eval:spread` running the
  produce/grade cycle three times and reporting the range.

## Success criteria

1. `npm run eval` grades every implemented case and exits non-zero when one fails —
   **proven by deliberately breaking extraction and watching the command fail**, not by
   reading the code.
2. With no run in the database, the harness prints the command to produce one. It does
   not throw a stack trace and does not report success.
3. C1 passes at recall ≥0.80 and precision ≥0.75 across T1; C2 passes with zero
   hallucinated-grounded requirements and 100% PII redaction on H2.
4. G1, the requirement-free document, produces zero requirements and a `needs_review`
   park with reason `no_requirements_found`.
5. Three consecutive runs are reported as a range. If the range straddles a threshold,
   that is stated plainly rather than resolved by picking a run.
6. Every result file is dated and never overwritten; a correction is appended and labeled.

## Technical constraints (confirmed during exploration, not assumptions)

- **The harness must not call a model provider**, for any purpose including matching
  (ADR 0004, ADR 0008). It replays through n8n and grades from the database. A single
  provider call inside the grader would make the headline accuracy figure a model's
  opinion.
- **Two doors now exist earlier than planned.** The webhook door was originally scoped to
  E5, but the harness needs a programmatic entry point, and having it drive the n8n Form
  trigger would test a path no user takes. E5 therefore becomes about `doc_type` adapters,
  not about the second channel.
- **Labels align to post-redaction `raw_text`.** If E1-S3's labels were written against
  pre-redaction text, every span region in C1 is silently misaligned and C1 will look like
  an extraction failure. Verify alignment before diagnosing a low recall.
- **`prompt_version` is the git short hash of the prompt file**, captured at call time.
  Without it, a quality change between two runs is unattributable and the investigation
  starts from memory (`docs/traceability.md`).
- **Cost must come from provider-reported token counts**, not a character estimate. Where
  a local price table is applied, rows are labeled `estimated` so a correction can sit
  beside them rather than overwrite them.

## Open questions

**All three closed by Vaibhav, 2026-09-01. None remain open.**

- ~~**What happens if C1 fails on the first honest run?**~~ → **Decided: three prompt
  iterations, then stop.** After the third, file a BUG card that names the *failure
  pattern* — not "recall is low" but what kind of requirement is being missed. The
  threshold never moves and labels are never edited; only the prompt and the diagnosis do.
  The count exists so that "one more try" cannot run indefinitely, which is how tuning
  quietly becomes teaching to the test.
- ~~**Should C1 grade T1 only, or T1 plus T3?**~~ → **Decided: T1 plus T3, requirements
  only.** T3's conflicts are not detected until E3, but its requirements are extractable
  now, and a second document costs nothing extra to grade. More signal for the same run.
- ~~**Does `eval:spread` run three times by default?**~~ → **Decided: on demand during
  iteration, mandatory before publication.** No figure reaches the deck, the video, the
  charter or a result file quoted elsewhere without its spread. A single run is a
  diagnostic; only a range is a number.
