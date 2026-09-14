# E3-S1: Group what was asked for into something buildable

**As a** PM
**I want** the extracted requirements grouped into epics and features
**So that** I get a document an engineer can plan from, instead of thirty unordered statements

## Acceptance criteria

- [ ] Clustering takes **requirement ids and statements only** — never `raw_text` — and
      returns epics containing features, each feature referencing `req_id`s.
- [ ] Every `req_id` returned by the clusterer exists in the input. A reference to an
      unknown id is rejected as `schema_invalid`, not silently dropped.
- [ ] **Every input requirement is accounted for**: each appears in exactly one feature, or
      is reported in an `unclustered` list. Silent loss between stages is the failure this
      structure invites.
- [ ] Epic and feature titles are ≤6 words and are not restatements of a single requirement.
- [ ] The epic-to-requirement ratio is computed and returned, so bad clustering is visible
      rather than merely present (decided 2026-09-01: no hard cap, surface the ratio).
- [ ] `n8n/prompts/cluster-epics-features.md` exists and is the source of truth.

## Depends on
- E1-S4 (requirements with citations must exist)

## Eval gate
- none directly — **C3** in E3-S5 checks that every link resolves. This story must leave
  that checkable.

## Technical notes

- **The clusterer must not see `raw_text`** (`docs/contracts.md` §2). Given the source it
  will invent requirements that extraction declined to make, and those would enter the PRD
  with no citation and no chance of being caught by C2 — which only checks the requirements
  it is handed.
- Closed, strict output schema with no free-text field an injected instruction could
  occupy (ADR 0007 layer 2). The clusterer sees model-derived text, not source text, but
  that text came from an untrusted document.
- No hard cap on epic count. If clustering is routinely poor, that is a BUG card naming the
  pattern, not a prompt quietly tightened until the fixtures look good.
- **Watch for BUG-004's shape here.** The clusterer will happily group nonsense into tidy
  epics; structure makes bad extraction look *more* credible, not less.

---

## DONE — 2026-09-02. The epics group; the features do not

Prompt `cluster-epics-features.md` (`ed52ca31c41b`), validated by
`review-ui/structure.mjs`, graded by **C3**.

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| Epics | 38 | 36 | 34 |
| Features | 68 | 63 | 63 |
| Orphaned references | **0** | **0** | **0** |
| Features per epic | 1.79 | 1.83 | 1.85 |
| **Requirements per feature** | **1.01** | **1.05** | **1.08** |

**Every acceptance criterion is met and the output is still half useless.** The epic layer
groups by outcome and reads well; the feature layer is one requirement each with a title
that restates it. **BUG-026** carries it, because this card says a bad clustering is a bug
card and not a prompt quietly tightened.

The card also predicted the exact trap: *"structure makes bad extraction look MORE credible,
not less."* That is now visible in the other direction too — **C3 is green on all three
runs** of a document whose middle layer does nothing, which is why the case prints the ratio
with no threshold attached.

**One defect, mine:** the clusterer was sent an empty requirement list for a whole run and
returned nothing in ten tokens, because its input read `$input` — copied from the gap call,
where `$input` *was* the grounding node. Fixed by addressing the grounding node by name, and
the comment on the entry above it in the same file had already warned about this.
