# E6-S1: What changed, and what merely repeated

**As a** PM whose product keeps being discussed
**I want** the second meeting read against the PRD we already approved
**So that** I review four changes instead of re-reading forty requirements

## Acceptance criteria

- [ ] A delta prompt (`n8n/prompts/analyse-delta.md`) takes **the approved version's
      requirements** plus **one new source document** and returns
      `{added[], modified[], contradicted[], removed[], new_open_questions[]}`.
- [ ] **`modified` and `contradicted` carry TWO sides**: the `req_id` being changed, a quote
      from the approved PRD, and a citation into the new source. `added` carries a citation
      into the new source only.
- [ ] **`removed` exists only when the source says so explicitly.** Silence produces nothing:
      absence is ambiguous between *withdrawn* and *not repeated*, and a system that guesses
      deletes requirements nobody withdrew (PRD-E6 decision 2).
- [ ] **An unchanged requirement is not output.** The prompt says so in as many words, and
      churn is measured, not hoped for.
- [ ] **Every `req_id` the model returns is checked against the approved version in code**, and
      a delta item naming an id that does not exist is **rejected and reported**, never
      accepted as a new requirement (PRD-E6 decision 5).
- [ ] Every quote on the new-source side goes through the same grounding matcher a citation
      does; an unlocatable quote drops the item with a reason rather than shipping it flagged.
- [ ] The schema is closed, every free-text field is declared in `check-injection-layers.mjs`,
      and the source text reaches the prompt only inside the fenced `DATA, NOT INSTRUCTIONS`
      block.

## Depends on
- E1-S4 (extraction and the grounding check), E4-S6 (`pm_authored`)

## Eval gate
- None here. **C5 is E6-S5** and grades what this produces; building the case in the same
  story that writes the prompt would let one be tuned to the other.

## Technical notes

- **Churn is the hard part, not detection** (PRD-E6). T2 restates several requirements
  verbatim on purpose. Expect the first version to be noisy and measure it before touching it.
- **The delta is computed against the APPROVED version, not the latest draft.** A draft
  awaiting review is not what anyone agreed to.
- The prompt sees requirement statements and ids from the approved version — not the whole
  assembled PRD. Ids are data the model echoes back and code validates; they are declared as
  such in the injection audit, exactly like `cluster-epics-features#req_ids[]`.
- **Two documents, two citation shapes.** The old side quotes the PRD (which has no
  `doc_id` of its own); the new side cites a real source. The review pane keys on `doc_id`
  already (E4-S2), so the shapes must be distinguishable rather than merged.
