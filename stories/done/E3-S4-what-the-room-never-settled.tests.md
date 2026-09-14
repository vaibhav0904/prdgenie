# Test cases: E3-S4 What the room never settled

Written before any build work, per gate G3.

**Why this story is worth more than its card says.** It was written as a capability story.
Three cards have since arrived at it from the other direction: **BUG-007** (both sides of an
unsettled argument are extracted as requirements), **BUG-004** (a model asked to notice
something and stay silent mentions it anyway), and **BUG-018** (rewording the prohibition to
describe the case in the document's own structure did not stop it either — 3 runs of 3). The
conclusion those three share is that **the extractor is finding the argument correctly and
filing it in the only drawer it has.** This story builds the second drawer.

So there is a prediction attached to this build, and TC12 records whether it comes true:
**once open questions have somewhere to go, `T3-Q01` should stop appearing as a requirement.**
If it does not, the diagnosis three cards share is wrong, and that is worth more than a green
row.

**The card's technical note is stale in one place.** It says *"T3's third conflict is written
to read like agreement on purpose."* That conflict — `T3-Q03` — was withdrawn by Vaibhav's
2026-09-02 label review and became the requirement `T3-R07`. T3 now carries **two** labelled
open questions, both explicit disagreements, and the polite-disagreement case moved to E3-S6's
new T4 fixture. **C4 is not built here and its old ≥2-of-3 threshold is void** (STATUS,
2026-09-02).

## What code owns, and what the model owns

The same split as everywhere else in this project. The model judges; code decides.

| | Owner |
|---|---|
| Which passages are unsettled, and how to phrase the question | **model** |
| Whether a citation resolves — `match_kind`, offsets, `grounded` | **code** (`grounding.mjs`, unchanged) |
| Whether an item's *shape* is legal — kind, citation count, NFR category | **code** (`gaps.mjs`) |
| Whether the run assembles | **code**, and open questions never affect it |

**Malformed items are dropped and counted, never fatal and never silent.** That combination
is forced: open questions must not block assembly (acceptance criterion), so a bad item
cannot reject the run — and a bad item that vanished without a count would make a detector
that emits nothing indistinguishable from one that emits garbage.

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **The prompt is the source of truth** | `n8n/prompts/detect-ambiguity.md` exists; `sync-prompts.mjs` writes it into WF2 and stamps a content-hash `prompt_version`; `--check` fails when they drift | Pass | `detect-ambiguity.md` synced as `df8499a97cb1`; `sync-prompts.mjs` now carries two prompts and finds each node by its `prompt_name` |
| TC2 | **Exactly three kinds** | `conflict`, `unanswered`, `missing_nfr`. A fourth kind is dropped and counted, not stored | Pass | `unknown_kind` and `empty_question` both drop; all three legal kinds keep. verify-gaps 25/25 |
| TC3 | **A conflict cites both sides** | `conflict` with fewer than **2** citations is dropped and counted. One quote cannot evidence a disagreement | Pass | one-citation conflict drops as `conflict_needs_both_sides` |
| TC4 | **An unanswered question cites the asking** | `unanswered` with **0** citations is dropped and counted | Pass | zero-citation unanswered drops as `no_citation` |
| TC5 | **`missing_nfr` cites nothing** | Its evidence is an absence. An item arriving with citations is **dropped and counted**, not quietly stripped — stripping would hide a model that thinks absence has a quote | Pass | drops as `missing_nfr_with_citations`, not stripped |
| TC6 | **The NFR checklist is closed** | Categories outside the fixed six are dropped and counted. Free text would drift every run and make C4 unstable | Pass | `observability` drops as `category_off_checklist` |
| TC7 | **The checklist is not duplicated by eye** | A check asserts the six categories in the prompt are exactly the six in the code, and fails on a mismatch. Two copies of a constant kept in step by memory is a drift waiting to happen | Pass | `verify-gaps.mjs` parses the six from the prompt and diffs them against `NFR_CATEGORIES`; reports both directions of the difference |
| TC8 | **The model may not certify its own grounding** | An open question arriving with `match_kind` or `grounded` set is refused as `schema_invalid`, the same way requirements are — rejected, not cleaned up | Pass | `grounded` and `match_kind` each produce an offender; `/internal/assemble` returns `schema_invalid` |
| TC9 | **Open questions never block assembly** | Three runs: zero open questions, all-malformed open questions, and well-formed ones. All assemble to `in_review` identically. The drop count differs; nothing else does | Pass | none / all-malformed / well-formed all reach `in_review` with identical requirement counts |
| TC10 | **A parked run keeps them** | G1 parks with `no_requirements_found` **and** its open questions are stored, not discarded. A park names a reason and loses nothing (`docs/contracts.md` §3) | Pass | G1 parks `no_requirements_found` **and** stores its open question. See TC10a below — what it stored is a defect |
| TC11 | **Stored and rendered in the version** | Rows in `open_questions` with `trace_id`; the same items in the version `content`, citations carrying **code-resolved** offsets and `match_kind` | Pass | 18 rows across the run, citations carrying code-set `match_kind` and rewritten offsets; same items in version `content` |
| TC12 | **THE PREDICTION: `T3-Q01` stops being a requirement** | With somewhere to file it, T3's SAML/self-serve argument should appear as a `conflict`, not as two requirements. **Measured over three runs and reported either way** — this is the claim BUG-007, BUG-004 and BUG-018 all point at, and a failure here is a finding, not a defect to hide | **FAIL — and it is the finding of this story** | Both sides of `T3-Q01` are STILL extracted as requirements in **3 of 3**, while the detector files the same argument as a grounded conflict in 3 of 3. See below |
| TC13 | **T3's labelled open questions are found** | `T3-Q01` and `T3-Q02` both surfaced. Reported, **not gated** — C4 is E3-S6's, and its threshold is void until the T4 fixture exists | **Partial** | `T3-Q01` **FOUND** (conflict, 9 exact citations). `T3-Q02` and `T3-Q04` **missed**. Across all fixtures: 5 of 12 labelled open questions found. Reported, not gated |
| TC14 | **No regression on the gates** | C1 and C2 both still pass, three independent runs, and the spread is published | Pass | C1 and C2 both PASS in runs 15, 16 and 17. T1 recall 86.7 / 86.7 / 80.0, T3 recall 100 / 85.7 / 100 |
| TC15 | **NEGATIVE CONTROL: fabricated evidence is visible** | Plant a quote that is not in the source on a `conflict`; it resolves `not_found` and the item is stored **ungrounded**, not silently presented as evidence. Then remove it | Pass, **and it fired for real** | The planted quote resolves `not_found` and the item is kept `grounded:false`. It then happened unplanted: T1 run 15 produced an `unanswered` whose quote was not in the document, correctly flagged |
| TC16 | **NEGATIVE CONTROL: the drop counter can fire** | Feed one item of each malformed shape and confirm each is counted under its own reason. A drop path that has never dropped anything is untested | Pass | all six drop reasons exercised, each under its own name; coverage line asserts 6 of 6 |
| TC17 | **The new prompt does not quote the answer key** | `verify-prompt-hygiene.mjs` passes with two prompts scanned, and says it scanned two (BUG-018) | Pass | `Prompts scanned: 2 (detect-ambiguity.md, extract-requirements.md)`, 109 quotes, no hit |

## Out of scope, named so it is not smuggled in

- **C4 is not built here.** E3-S6 owns it, needs a T4 fixture that does not exist, and its
  old threshold is void. TC13 reports; nothing gates on it.
- **Contradictions against an existing PRD** are E6's delta path, not this story.
- **No UI.** Rendering open questions beside the PRD is E4's screen. This story stores them
  and puts them in the version content; nothing draws them.
- **The `missing_nfr` checklist is a constant, not a parameter.** Changing the six changes
  what C4 will measure, so it changes with a written note, never quietly (card's own
  technical note).

## Evidence — 2026-09-02

```
.\run.cmd review-ui/scripts/verify-gaps.mjs        25/25 passed
.\run.cmd evals/harness/verify-prompt-hygiene.mjs  PASS, 2 prompts scanned
.\run.cmd evals/harness/grade.mjs   x3             C1 PASS x3, C2 PASS x3
.\run.cmd evals/harness/report-gaps.mjs            -> evals/results/2026-09-02-gaps-report.txt
```

`prompt_version` for `detect-ambiguity`: **`df8499a97cb1`**. `extract-requirements` unchanged
at `47ac49c6330b` — deliberately, so nothing about this story can be confused with BUG-018's.

**14 of 17 rows Pass, one fails and two are partial.** Every acceptance criterion on the card
is met. The failures are about how *well* the detector judges, which is C4's business and C4
does not exist.

## TC12 — the prediction failed, and it is the most useful thing here

Three cards concluded that E3-S4 was the fix for BUG-007, on the reasoning that *"the
extractor is finding the argument correctly and filing it in the only drawer it has."*

The detector does exactly what was hoped. On T3 it files the SAML/self-serve argument as a
**`conflict`**, grounded, with nine exact citations, including Marcus's *"I'm not settling
that in this meeting."* — in **3 runs of 3**.

**And in the same three runs, both sides are still extracted as requirements.**

| | run 15 | run 16 | run 17 |
|---|---|---|---|
| detector files `T3-Q01` as a conflict | yes | yes | yes |
| *"a prospect to be able to create a login…"* still a requirement | yes | yes | yes |
| *"We authenticate through the customer's SAML provider…"* still a requirement | yes | yes | yes |

**The diagnosis was right and the inference was wrong. The second drawer was built in a
different component.** Extraction and detection are two separate calls; the extractor runs
first, sees only its own schema, and still has exactly one output type. Adding a later stage
cannot change what an earlier one is able to emit.

Which makes this the sharper version of BUG-004's lesson. There, the destination
(`document_subject`) was added to **the same call that had to act on it**, and the number went
to zero. Here the destination was added to the pipeline, and the model that needed it never
saw it. **"Give it a destination" means give it to the call making the choice.**

Recorded on BUG-007 with the two ways to actually close it, neither of them small, and a note
that the next change there is architectural rather than another prompt iteration.

## TC10a — what the parked document asked (BUG-019)

G1 parks correctly and stores an open question. The question is:

> **[unanswered]** *What is the biscuit budget?*

Grounded, cited, and entirely real — somebody asked, nobody answered. It is not a product
question, and **nothing told the detector that was the test.** `concerns_product` is decided
in the extraction call and never reaches the detector.

C2's third rule counts *requirements* on the requirement-free document, so it passes: the
fixture that took four prompt versions to silence is speaking again through a field the case
cannot see. **BUG-019** filed.

## What the report shows about quality (BUG-020)

18 open questions across nine fixtures: 1 conflict, 5 unanswered, **12 `missing_nfr`**. On F1
and on H1, **all six categories** were emitted — the whole checklist, in order.

And the detail that names the defect: F1 carries a labelled `missing_nfr`, `F1-Q02`. The
detector **emitted all six categories and still missed the one the answer key names.**
Enumeration is not detection. **BUG-020** filed, with an explicit instruction not to spend
prompt iterations on it until C4 exists to say whether a change helped.

Labelled open questions found across the run: **5 of 12** — `H2-Q01`, `N1-Q01`, `N1-Q02`,
`T1-Q01`, `T3-Q01`. Reported, not gated.

## The half that is unambiguously good

- **The conflict it did find is excellent.** Nine citations, all `exact`, spanning the whole
  argument including the sentence where it was deferred. That is a better artefact than a
  requirement list can express, and it is the thing this build is for.
- **Grounding held.** Code set every `match_kind`; the model never certified itself; and the
  one ungrounded item in the run — a T1 `unanswered` whose quote was not in the document —
  was flagged rather than presented as evidence. TC15 fired for real, unplanted, on the first
  full batch.
- **Nothing regressed.** C1 and C2 pass three times each with the new stage in the chain, and
  a failed gap call cannot take a PRD down: the assemble node reads `open_questions` only
  when the call returned `ok`.
