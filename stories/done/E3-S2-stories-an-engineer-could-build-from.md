# E3-S2: Stories an engineer could actually build from

**As an** engineering lead
**I want** each feature broken into user stories with acceptance criteria that trace to requirements
**So that** I can plan work without asking the PM what each line meant

## Acceptance criteria

- [ ] Each feature produces one or more stories in "As a / I want / so that" form, using a
      persona from `docs/domain.md` rather than an invented one.
- [ ] Every story carries **3–6 acceptance criteria**, and **each criterion names the
      `req_id` it comes from**.
- [ ] A criterion referencing an unknown `req_id` is rejected as `schema_invalid`.
- [ ] No feature is left without at least one story; a feature that produces none is
      reported, not skipped.
- [ ] Criteria are independently checkable statements, not restatements of the story title.
- [ ] `n8n/prompts/draft-stories.md` exists and is the source of truth.

## Depends on
- E3-S1

## Eval gate
- none directly — **C3** (E3-S5) verifies that every story resolves to a feature and every
  criterion to a requirement.

## Technical notes

- The story drafter sees features and their requirements, not `raw_text` — same reasoning as
  the clusterer. It is turning extracted requirements into solution-side wording, and any
  new claim it invents would be uncited.
- **Vocabulary trap:** a *Story* here is the product artefact (`docs/domain.md`), not a card
  in `stories/` — that is this project's own build process, a different universe. Keep the
  two apart in naming and in prose, because they will be read side by side.
- Acceptance criteria are where an engineer will look first. "Works well" is not a
  criterion; "exports a PNG at the chart's rendered resolution" is.
- Expect the model to produce criteria that restate the story. The prompt needs a worked
  example showing the difference, per ADR 0001's few-shot obligation — drawn from a fixture
  outside the eval set.

---

## DONE — 2026-09-02

Prompt `draft-stories.md` (`f3e129ba50f0`). Personas come from `docs/domain.md` and
are passed in the user message; the schema enforces 3–6 acceptance criteria, each naming its
`req_id`.

**About 190 stories across three runs, and not one orphan** — every story resolves to a
feature and every criterion to a requirement, checked by C3 with the links walked
separately rather than joined (a join hides the orphan by dropping the row that has nowhere
to join to).

A criterion citing an unknown requirement is reported **and** kept out of storage; a feature
nobody could write a story for is reported rather than skipped. Both directions are in
`verify-structure.mjs`.

**What is not claimed:** nothing here measures whether a criterion is *good*. The prompt
carries the "could two people disagree about whether it passed?" test and a worked example,
and a human reading them is still the only check on that. E3-S1's warning applies to this
layer too — well-formed criteria over a nominal feature make the document look more planned
than it is.
