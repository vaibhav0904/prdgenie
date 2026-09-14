# E3-S3: The model judges, the code computes

**As a** PM
**I want** each feature to carry a priority score that the model did not calculate
**So that** I can argue with the judgement behind a number instead of being handed an authoritative-looking one

## Acceptance criteria

- [ ] Factor extraction returns, per feature: `reach` (1–10), `impact` ∈ {0.25, 0.5, 1, 2, 3},
      `confidence` (0.5–1.0), `effort` (1–8 person-weeks), a `rationale`, and citations.
- [ ] A factor outside its allowed range is rejected as `schema_invalid`, not clamped.
      Clamping would hide a model that does not understand the scale.
- [ ] **`/internal/score` is the only writer of `priority_score`**, computing
      `round(reach × impact × confidence ÷ effort, 1)`.
- [ ] The model never emits a score. A response containing one is rejected outright, the
      same way a model-supplied `grounded` is (E1-S4, TC7).
- [ ] Recomputing every stored score from its stored factors reproduces it **exactly**.
- [ ] The `effort` figure is labelled as a model estimate everywhere it appears in the UI.
      This system does not estimate engineering work and must never look like it does.
- [ ] `n8n/prompts/extract-priority-factors.md` exists and is the source of truth.

## Depends on
- E3-S1

## Eval gate
- **C3** (E3-S5) recomputes RICE from stored factors and diffs. 100%, no partial credit —
  a mismatch is the signature of some other code path having written a score.

## Technical notes

- **RICE constants are fixed and untuned** (`docs/assumptions.md`): the published scales,
  taken as-is. A scale adjusted to make outputs look reasonable is not a scale.
- Store the factors **beside** the score, always. A score whose inputs are not recorded
  cannot be argued with, and C3 could not check it.
- This is the clearest instance of CLAUDE.md's rule that the model never writes a number
  that ships. The model supplies four judgements and its reasoning; arithmetic is code.
  No citation can check a number, which is exactly why the split exists.
- **Accepted honestly:** the factors are still model judgements. Only the arithmetic is
  deterministic, and `docs/assumptions.md` says so — determinism here buys reproducibility,
  not correctness.

---

## DONE — 2026-09-02. The one number in this product is arithmetic

Prompt `extract-priority-factors.md` (`fe9372faa9ca`), `/internal/score`, and
`computeScore` in `structure.mjs` — **one function, two callers, and the model is not one of**
**them.**

- **Every stored score recomputed exactly, three runs, ~190 features.** C3 does the
  arithmetic again from its own copy rather than importing the product's.
- **Out-of-range factors are rejected and named, never clamped** — eight cases in
  `verify-structure`, both ends of every range plus `impact` values off the enum. Live:
  `reach=11, impact=1.5` came back as `schema_invalid` naming both.
- **A model-supplied score is refused** exactly like a self-certified `grounded`. The prompt
  has no score field and says why in its header.
- **The control has been seen working:** a 0.1 change to one stored score turns C3 red,
  names the feature, and prints both numbers.

**Partial, with an owner: the `effort` label.** The prompt says an effort figure is a guess
and must be labelled one wherever it appears. There is no UI yet, so nothing renders it —
**E4 owns the label**, and it is written into that story rather than assumed to happen.

**Accepted honestly, restated because approval is when this gets forgotten:** the factors are
still model judgements. Determinism here buys reproducibility, not correctness.
