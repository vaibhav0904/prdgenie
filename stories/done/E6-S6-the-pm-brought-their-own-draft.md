# E6-S6: The PM brought their own draft

**As a** PM
**I want** to start from the document I already wrote and have the meeting reconciled against it
**So that** the system meets me where the work actually started

*Raised by Vaibhav on 2026-09-01: "the PM might go and create something as well, because not
everything will be discussed in meetings." Approved as decision 1 of PRD-E6, sequenced last.*

## Acceptance criteria

- [ ] A PM can **seed version 1 of a PRD from their own document** — the epic's machinery
      pointed the other way: *"here is my draft; now reconcile the transcript against it"* is
      the delta computation with v1 authored instead of extracted.
- [ ] **Every seeded requirement is `pm_authored = 1`** and is therefore **excluded from M1**,
      the grounding rate. A PM's own sentence is not evidence about a source document, and
      counting it as grounded would inflate the one number this project exists to keep honest.
- [ ] A seeded version is **visibly different on the review screen** from a generated one, at
      the version level and at the requirement level. A reader who cannot tell which
      requirements were quoted and which were typed is reading a document whose provenance is
      a guess.
- [ ] The metrics page and the weekly report **say how many requirements were seeded**, beside
      the grounding rate rather than inside it.
- [ ] Ingesting a transcript afterwards produces a **delta against the seeded version**, with
      exactly the same rules — including that a seeded requirement the transcript contradicts
      shows both sides.
- [ ] **The claim in the deck changes with the code, in the same commit**: "every requirement
      carries a verbatim citation" becomes *"every extracted requirement carries a verbatim
      citation; requirements the PM wrote are marked as theirs."*
- [ ] Seeding **cannot reach `approved`** by any path but the review-UI sign-off. The trigger is
      not weakened for authored content.

## Depends on
- E6-S4, E4-S6 (`pm_authored` provenance)

## Eval gate
- None new. It must not move C1, C2 or M1: a seeded requirement is excluded from the grounding
  rate by construction, and the check is that the rate **does not change** when a seeded
  version exists.

## Technical notes

- **The cost is the design constraint, not a footnote** (PRD-E6 decision 1). Seeded content
  enters a PRDVersion without passing through extraction or grounding, so every surface that
  says something about provenance has to learn a third case: extracted-and-grounded,
  extracted-and-flagged, and authored.
- **Most likely story to be cut for time, and cutting it costs nothing already claimed** —
  which is exactly why it is last rather than first.
- The seeded document is stored as a source document too, so the version can cite it: the PM's
  own text is quotable evidence *of what the PM wrote*, which is not the same claim as evidence
  about the room.

---

## Closed 2026-09-05 — satisfied by the architecture, not by a feature

**Vaibhav rejected the premise, and was right.** On 2026-09-05, reading the plan to build a
seeding path:

> *"Why are you treating E6-S6 as a different scope? Think of it again as an artifact that the
> product manager has shared. How we are treating the transcript will again be taken as the same
> thing... We treat the PRD or the base document shared by the product manager in exactly the
> same way. He can share any resources, multiple resources, right? We treat any type of resource
> as the same."*

Everything expensive in the acceptance criteria above followed from one assumption: that a PM's
draft **bypasses extraction** and is injected straight into a PRDVersion. That assumption is
what forced `pm_authored` onto every requirement, forced an M1 exclusion, forced a third
provenance case onto every surface, and made this "the story most likely to be cut for time".

Drop the assumption and there is nothing to build. The PM's document goes in the door a
transcript goes in. It is extracted by the same nodes. Its requirements carry **verbatim quotes
of the PM's own text**, which is excellent evidence of what the PM wrote — a different claim from
evidence about the room, and a true one. `doc_type: feature_brief` already exists (E5-S1), and
**nothing after WF1 can tell a brief from a transcript** (CLAUDE.md's spine rule), so the
follow-up delta needed no special case either.

### The run, not the argument

`.\run.cmd evals\harness\verify-pm-document.mjs` — declared in `check-all` as a paid UAT, so it
is run deliberately rather than every sweep.

```
PASS  TC1   the PM's own brief ingests through the same door a transcript uses
           component=assembler, doc_id=DOC-2026-2298, trace=9e94ea63-86b6-4c47-b482-8a6f372a8e0f
PASS  TC2   the brief produces requirements whose quotes are verbatim in the PM's own text
           7 requirements, 7 grounded, 7 with a quote found verbatim in F1 by this script,
           independently of the pipeline
PASS  TC3   grounding is computed by the same code — no third provenance case was needed
           (decided 14/14 items; sign-off 200)
PASS  TC4   a transcript arriving afterwards is a DELTA against the PM's draft, not a new PRD
           component=delta, status=ok
PASS  TC5   the delta names the version it was computed against
           derived_from=2555, changes=2
PASS  TC6   nothing after WF1 branches on doc_type — which is why there was nothing to build
           6 workflows after the door, none of which can tell a brief from a transcript

6/6 checks passed.   product: e6s6-mtoj86wi
```

Sign-off went through the **review endpoints** — every one of the 14 items decided, then
`/sign-off` — not through `signOff()` directly. A verifier that reaches approval by a path no
person can take has verified a path that does not exist; the audit that indicted seven versions
during E6-S3 was exactly that mistake.

### What this changes elsewhere

- **The deck claim stays unqualified.** It was going to become *"every extracted requirement
  carries a verbatim citation; requirements the PM wrote are marked as theirs."* It stays
  **"every requirement carries a verbatim citation"**, because the PM's sentences are quoted
  like anyone else's.
- **M1 needs no new exclusion.** `pm_authored` remains what E4-S6 made it: a fact about the
  *document's authorship*, reported beside the rate — not a bypass around the grounding check.
- The two criteria about a *seeded* version being visually distinct and counted separately are
  **struck**, not deferred. There is no seeded version to distinguish.

**The general lesson, which is the one worth keeping:** the story's cost lived entirely in a
premise nobody had questioned. "Any resource is a resource" was already the architecture — the
backlog card had quietly proposed a second architecture beside it.
