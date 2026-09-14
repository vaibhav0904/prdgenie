# PRD-E3: Structure, priority, and the questions nobody answered

**Status:** Approved
**Date:** 2026-09-01 · **Approved:** 2026-09-01 by Vaibhav

## Problem

After E2 the system produces a trustworthy flat list of requirements. A PRD is not a list.
An engineer cannot plan from thirty unordered statements, and a PM still has to do the two
jobs that actually take the afternoon: grouping the requirements into something buildable,
and deciding what comes first.

There is a third gap, and it is the one PMs feel most and tools address least. **The
highest-value output of a requirements meeting is what was *not* decided** — the two
stakeholders who disagreed and moved on, the question asked at minute forty that nobody
answered, the entire category of non-functional requirement the room never mentioned.
Today that disappears the moment the call ends, because nobody writes down a thing that
didn't happen.

## Goals / Non-goals

**Goals**

- Requirements cluster into epics and features; features carry stories with acceptance
  criteria traceable back to requirements.
- Every feature carries a priority score that the model **did not compute**.
- Conflicts, unanswered questions and missing non-functional categories are surfaced as
  first-class OpenQuestions with citations.
- C3 (structure and determinism) and C4 (ambiguity detection) pass.

**Non-goals** — deferred deliberately, with reasons:

- **The model does not rank, order, or recommend.** It supplies four factors and a
  rationale; RICE arithmetic happens in `/internal/score`. This is not a stylistic
  preference — a model that outputs a score can output a *wrong* score that looks
  authoritative, and no citation can check a number.
- **No PM-facing editing of priority factors yet** (E4). This epic produces them; the
  review gate makes them editable.
- **No cross-document or cross-PRD conflict detection.** Conflicts are found *within* the
  sources of one run. Noticing that a new meeting contradicts a different PRD is the
  genuinely hard version and is Tier 2 in `docs/roadmap.md`.
- **No estimation claim.** The `effort` factor is a model's guess in person-weeks and is
  labeled as such everywhere it appears. This system does not estimate engineering work
  and must never look like it does.
- **No taxonomy configuration.** Epic and feature naming is whatever the clusterer
  produces, reviewed by a human. A configurable taxonomy is a real product feature and a
  distraction here.

## Who this is for

The **PM** persona, at the moment they would otherwise open a blank document and start
grouping. Secondarily the **engineering lead** stakeholder from `deliverables/program-charter.md`,
who is the reason acceptance criteria must trace to requirements rather than read well.

## Proposed scope → stories

- **E3-S1:** Clustering — requirements in, epics and features out, referencing `req_id`s.
  The clusterer receives ids and statements only, never `raw_text`.
- **E3-S2:** Story drafting — per feature, "As a / I want / so that" with 3–6 acceptance
  criteria, each criterion tied to a `req_id`.
- **E3-S3:** Priority factor extraction (reach, impact, confidence, effort, rationale,
  citations) and `/internal/score` computing RICE in code.
- **E3-S4:** Ambiguity and gap detection — OpenQuestions of kind `conflict`,
  `unanswered`, `missing_nfr`, each cited.
- **E3-S5:** Case **C3** — schema validity, full linkage resolution, and RICE recomputed
  from stored factors matching every stored score exactly. 100%, no partial credit.
- **E3-S6:** Case **C4** — labeled conflicts in T3 surfaced; a third verdict for
  fabricated conflicts.

## Success criteria

1. A run on T1 produces a PRD with epics, features, stories and acceptance criteria in
   which **every** link resolves: no story without a feature, no acceptance criterion
   without a requirement, no orphan requirement silently dropped.
2. Every feature has a priority score, and recomputing RICE from its stored factors
   reproduces that score exactly for every feature in the database (C3, 100%).
3. At least two of T3's three labeled conflicts are surfaced as OpenQuestions with
   citations to both sides of the disagreement (C4).
4. A requirement that was extracted but landed in no feature is **reported**, not dropped.
   Silent loss between stages is the failure mode this structure invites.
5. C1 and C2 still pass — the epic did not buy structure with grounding.

## Technical constraints (confirmed during exploration, not assumptions)

- **The clusterer must not see `raw_text`** (`docs/contracts.md` §2). Given the source
  text it will invent requirements that extraction declined to make, and those new
  statements would enter the PRD with no citation and no chance of being caught by C2,
  which only checks the requirements it is given.
- **RICE constants are fixed and untuned** — `impact ∈ {0.25, 0.5, 1, 2, 3}`,
  `confidence ∈ [0.5, 1.0]`, `effort` in person-weeks (`docs/assumptions.md`). A scale
  adjusted to make outputs look reasonable is not a scale.
- **`/internal/score` must be the only writer of a priority score.** C3 detects a score
  that disagrees with its factors, which is precisely the signature of some other code
  path having written one.
- **Fabricated conflicts need a third verdict.** A conflict the model reports that is not
  in the labels may be a genuine find or a hallucination, and a binary FAIL would punish
  the good case. C4 ends `PASS-PENDING-MANUAL-REVIEW` and the fabricated items are listed
  for a human to read (`evals/README.md`).
- **`missing_nfr` detection needs a fixed checklist**, or the model will report a
  different set of missing categories every run and C4 becomes unstable. The checklist is
  a prompt constant (performance, security, accessibility, data retention, scale,
  localization), not a tuned parameter.

## Open questions

**All four closed by Vaibhav, 2026-09-01 — approved as proposed.**

- ~~**How many epics is too many?**~~ → **Decided: no hard cap.** The review screen
  surfaces the epic-to-requirement ratio, and if clustering is routinely bad that becomes a
  BUG card with a diagnosed pattern — never a silently tightened prompt. A cap would hide
  the problem behind a number chosen to make the fixtures look tidy.
- ~~**Do OpenQuestions block assembly, or accompany it?**~~ → **Decided: accompany.** A PRD
  with three unanswered questions is more useful than no PRD, and the questions are the
  point. Blocking would turn the feature into an obstacle. *(The one exception, already
  decided in PRD-E6: an unresolved **contradiction** does block sign-off, because the
  document would otherwise assert two things.)*
- ~~**Should `missing_nfr` questions cite anything?**~~ → **Decided: no citations, and a
  visibly different kind in the UI.** Their evidence is an absence, and a citation to
  nothing would quietly widen the grounding claim past what is true. This forced an
  amendment to ADR 0008 during E1-S3: `missing_nfr` items are matched **by category**, never
  by span, and C4 reports them **separately** so the cheap-to-game half is never averaged
  into the honest half.
- ~~**Does C4's 2-of-3 threshold survive the polite conflict?**~~ → **Decided: describe the
  capability honestly rather than split the bar.** If the model reliably finds the two
  explicit disagreements and misses the polite one, the finding is *"finds explicit
  disagreements, misses implicit ones"* — reported in those words, not as "67%". A
  percentage over three items implies a precision the sample cannot carry.

  **REOPENED 2026-09-02 — the decision is sound and its subject is gone.** Vaibhav's label
  review withdrew T3-Q03, the polite conflict, reading it as a decision taken over a
  registered dissent rather than an unsettled argument; it is now the constraint T3-R07.
  Both remaining conflicts are explicit, so the sentence this decision protects — *"finds
  explicit disagreements, misses implicit ones"* — can no longer be earned or refuted by
  this dataset. **C4 cannot be built until an implicit case exists, and that means a new
  fixture, not a relabelled one** (E3-S6, re-scoped). Amendment pending Vaibhav's approval.
