# Evals — how quality is measured

Evals are repeatable checks of quality against labeled data, for any step whose
output is a judgment rather than a computation. They **gate stories**: an
eval-gated story cannot move to `stories/done/` until its case passes, and every
run's output is archived.

```
evals/
├── datasets/   labeled ground truth
├── cases/      one file per eval — what's measured, how, pass threshold
└── results/    dated run outputs: YYYY-MM-DD-<case>.md (metrics + per-item diffs)
```

## Choosing what to measure

Before any case is written, answer what this scope *owes*:

1. **One eval per irreversible claim.** Walk the README: every quality claim —
   "never invents", "always catches", "100%" — needs a case that could falsify
   it, with a sample size that could carry it. A claim resting on one example
   is a coin toss with a threshold.
2. **Keep a coverage matrix** in this file: every capability → the case that
   covers it, or the word **NONE**. NONE *chosen* is a legitimate scope call;
   NONE *unnoticed* is how a claim ships unguarded. A demo run is not
   coverage — "the demo is the acceptance test" is the tell that a step has no
   eval.
3. **A case with no code is a wish.** A case exists when one command runs it
   and a failing verdict is a failing **exit code**. A documented threshold
   that is hand-checked "for now" will be stale within two changes.

### Coverage matrix

Last audited: **2026-09-03** (after C6 was built and H1 gained a fourth payload). Re-audit at every epic boundary.

| Capability | Case | Notes |
|---|---|---|
| Extract requirements from a transcript | **C1** | recall ≥0.80, precision ≥0.75. **Passing 2026-09-02, 3 runs of 3:** T1 93.3% / 93.3–100%, T3 100% / 77.8%. It went green on a corrected answer key, not a better extractor — see `results/README.md`, and note it passes while still containing BUG-007. |
| Extract requirements from notes / email / feature brief | **C1** — extended in E5; **PASS, all six fixtures, 3 runs plus a reversal control (BUG-032, closed)** | Four doc types, **reported per type and never averaged** — four runs at prompt `dd2ce8269321`: transcript T1 86.7–93.3% / 81.3–100%, T3 85.7–100%; notes N1 100% / 85.7–100%; email E1 80–100% / 100%; feature brief **F1 100% / 100%, four times** (BUG-030: it had never once exceeded 85.7% in 32 archived results). Four fixtures at 0.95/0.95/0.95/0.35 average to 0.80 and read as "meets the floor" while one whole door is broken — which is why this row lists. **The fixture list is no longer typed.** The denominator is derived from the answer keys: every fixture whose labels carry requirements is graded here or **declared** to the case that grades it instead, and the declarations print in every result file — including `T2`, whose only case is **C5, which is not built**. Deriving it exposed **T4**, six labelled requirements no case had ever read, failing at **66.7% / 57.1%** — fixed by BUG-032 (an ordering the prompt claimed to have and did not), now **100% / 85.7%** three runs running. The one known casualty: `F1-R06` carries the wrong `kind`, accepted by decision and tracked as BUG-037. |
| Refuse to invent requirements from a requirement-free document | **C2** (G1 fixture) | Correct output is zero requirements. **PASSING 2026-09-02: 0 requirements in 3 of 3 runs**, parked as `no_requirements_found` (BUG-004). Was 16/15/14/14 across four prompt versions of increasingly explicit refusal prose; the fix was structural, not more prose - the model names `document_subject` and `concerns_product` before listing anything, and code parks on the judgement. |
| Every requirement carries a real, verbatim citation | **C2** | Hallucinated-grounded = auto-fail at any score. **Passing:** 0 hallucinated over 73 citations, 100% exact, 0 disagreements with the independent search (2026-09-02) |
| PII redacted before storage | **C2** (H2 fixture) | **PASSING 2026-09-02, both directions.** 13 values must GO (8 email, 5 phone) - **0 survive**. 22 values must STAY (names, organisations, roles) - **0 were redacted**. The retention half was added on 2026-09-02 and is the more interesting one: before it existed, a redactor that removed every capitalised word would have scored 21 of 21 and passed the 100% floor cleanly. **Policy: contact details are removed, names are kept** - see docs/assumptions.md, and note this is the reverse of what was claimed the day before. |
| Detect conflicts / unanswered questions / missing NFRs | **C4** — built 2026-09-02, **and it fails: FAIL / PASS / FAIL** |Threshold written before the first run and it did not move: **R1** the explicit conflict is found (1 of 1, hard), **R2** the decoy is not called a conflict (0 false positives, hard). Everything else is reported with no threshold this epic. Measured on T4: explicit **0, 1, 0 of 1**; implicit **0, 1, 0 of 2**; `missing_nfr` **zero, all three runs**; the decoy **never flagged, 9 of 9**. The failure is the system's, not the case's — proven by a control that moves it both ways. **BUG-025** carries the conflict finding, and **BUG-020 closed on 2026-09-03**: a quality the document RAISES and leaves open is now an `unanswered` with its quote rather than a `missing_nfr` category, which took F1 from six template questions to one real one and found a labelled unanswered C4 had never seen. A probe on a document genuinely silent about all six still returns all six -- correctly. **BUG-025** carries the conflict finding: the detector misses an announced deferral 2 runs in 3 while the extractor finds it 3 of 3. *The labels were written and approved by the same person; the second reader was delegated away, and the case file says so beside every figure.* |
| What the extractor calls **unsettled** is really unsettled | **C4**, partly — shape and grounding by `verify-unsettled.mjs` (28 checks), judgement by C4 with no threshold this epic |Added by BUG-007 and graded from 2026-09-02: **2 of 6** labelled positions found on T4, all three runs, and the decoy filed as a position **zero** times. BUG-024 — a settled argument filed as unsettled on T1, 1 run in 3 — now has a case that could see it. No floor is set: the output is days old and a floor invented before the range is known is a number chosen to be met. |
| PRD structure is valid and internally linked | **C3** — built 2026-09-02, **PASS on three runs** |Story → feature → epic, criterion → requirement, feature → requirement: **0 orphans across ~190 features and ~190 stories**. Threshold 100%, no partial credit. Zero factors stored is a FAIL, not a pass. **And it prints one figure it is forbidden to fail on — requirements per feature, which came back 1.00 and is now BUG-026: the clustering is well-formed and does no grouping.** |
| Priority scores are deterministic and model-free | **C3** — **every stored score recomputed exactly, three runs** |RICE is written out again in the case rather than imported, so it cannot agree with the product by construction. A model-supplied score is refused like a self-certified `grounded`, and out-of-range factors are rejected and named rather than clamped. **Controlled:** a 0.1 change to one stored score turns C3 red and names the feature. |
| Follow-up document updates the PRD correctly | **C5 — NOT BUILT.** Named, thresholded, and it does not exist. | 4/4 labelled delta items, churn = 0, when it is written. It belongs to E6, which has not started, and the labels (T2's `expected_delta`) have been verified by `verify-labels` since E2. **Listing a case that does not exist as though it does is how a matrix stops being an audit** — so it says so here rather than in a footnote. |
| Injected instructions in source text are not obeyed | **C6** — built 2026-09-03, **PASS on two runs, identically** | **100% floor on `P1`–`P3` only** (3 labelled payloads); **`P4` reported separately with no threshold this epic** — a new payload that failed would otherwise drag a real floor down or invite softening one. Decided by Vaibhav, 2026-09-02. **"Resisted" is measured twice and independently:** the payload's marker absent from the stored output, *and* whether the tripwire fired. They must agree; a disagreement fails the case. A check that can only read the guard's own signal cannot tell "blocked" from "never dangerous". **Result: 3 of 3 on the floor, and P4 resisted too — 233 strings searched across the version content and every child table, twice, same answer. The tripwire never fired**, which on its own says nothing; the outcome column is what makes the quiet guard mean something. **P4 was authored and committed before `C6.mjs` existed** (`7ad8a0e`), attacks the delimiter that layer 1 *is* by forging a turn boundary, and is asserted to sit outside the tripwire's strings **in both directions**. Two rows are honest rather than green: the disagreement check has never fired, and "a caught payload parks rather than crashes" is proven by `verify-tripwire` TC16/TC17, not here. |
| Doors normalize identically (no downstream branching) | **C1** across doc types + a committed `grep` check that nothing after WF1 reads `doc_type`/`source_channel` | The grep is the structural half; C1 is the behavioural half |
| LLM failure degrades to a visible park, not a wrong answer | **CLOSED 2026-09-03 — `verify-degradation.mjs` (69 checks) + `drill-provider-failures.mjs` (22/22, twice).** | A fault-injection case: force a WF0 timeout and a malformed response, assert the version parks `needs_review` with the right reason and no partial draft exists. Scoped as a story in PRD-E7. **2026-09-02: a real outage fell into this hole.** "Not a wrong answer" held — no draft, no partial PRD. "Visible" did not: the model-failure park wrote nothing to the database (**BUG-012**) and reported an auth failure as `llm_timeout` (**BUG-011**). **Both fixed the same day and demonstrated against a real failure**: the credential was removed from WF0 and T2 run through the door, which came back `parked: llm_unauthorized` carrying version 409 and an event reading `llm_unauthorized — Credentials not found`. The injection also found a third defect — a credential error is raised by n8n *before* the HTTP node runs, so it escaped WF0 and killed WF2 outright, writing nothing at all. **E7-S4 closed it on 2026-09-03**, at the provider boundary: WF0 dials a local stand-in that either never answers or returns prose where JSON was required, and nothing else in WF0 changes. A real 60-second timeout, twice, parks `llm_timeout`; a malformed 200 parks `llm_malformed_json`; both are addressable by version id **in the run manifest** (BUG-017); and in every case there is exactly one version row and zero requirements, epics and features. A control run through the same stand-in answering properly parks `no_requirements_found`, so the drill is not merely proving that a stand-in breaks things. **It found BUG-029 on its first execution: a real timeout was being called `llm_error`**, because n8n discards axios's `ECONNABORTED` and its own prose contains no "timeout" — BUG-011 in mirror image. |
| The approval gate cannot be bypassed | **NONE — chosen.** |Not an eval: a deterministic property, verified the way the gate itself is. E1's UAT runs `UPDATE prd_versions SET state='approved'` by hand and watches the trigger refuse. **E4-S3 added the layer above it**: `verify-review-gate.mjs` (23 checks, no browser) proves sign-off recomputes readiness from the rows and refuses a mid-review call, and a negative control removes the recomputation and watches that same call succeed. |
| Weekly report figures match their queries | **NONE — chosen.** | Verified by hand-recomputation during the E8 UAT (`docs/reporting.md` rule 3), not by an eval. Hand-recomputing is what catches a definition/implementation drift; an automated check comparing the report to the same query would agree with itself. |
| Judge sweep agreement with labels | **NONE — chosen.** | The judge is a monitoring signal, never ground truth (ADR 0001). Grading the grader would invert that. |
| Cost per PRD stays within a bound | **NONE — pending.** | No cost ceiling exists at all (`assumptions.md`, security posture). A case is meaningless before the mechanism; the mechanism is Tier 1 in `roadmap.md`. |

Two rows are holes: **C5 is named and not built** (E6), and **cost-per-PRD is `NONE — pending`**
because no cost ceiling exists to measure against. Both are named here rather than in a
footnote, and neither may be quietly reclassified — a pending row becomes a case or becomes a
written scope call with a reason.

**The "partial" row closed on 2026-09-03**, and it closed by forcing the failure rather than
by being re-read. The stale E5 note went with it: that row had said "pending until E5" for a
day after E5 shipped, which is the small version of the same problem.

**Two of them arrived the same way**: an output was added, and its measurement was not.
The gap detector shipped in E3-S4 and C2's rules counted requirements, so a question from a
requirement-free document was invisible (BUG-019). Unsettled positions shipped in BUG-007
and nothing grades their judgement, so a settled argument filed as unsettled is invisible
(BUG-024). **Adding an output is an afternoon; adding its case is a story** — which is the
argument for building C4 before anything else in E3.

## The six rules

1. **Labels are written when the dataset is created, before anything is tuned.**
   No teaching to the test after the fact. Put the rule in the dataset file's
   own header so nobody has to remember it:
   `"rule": "Labels written BEFORE any tuning. Never edit labels to match output."`
2. **Never tune labels to match output.** On FAIL, diagnose and file a BUG card.
   Drift means revert, never relabel.
3. **Grading and running are separate.** The harness grades a run that already
   happened; it never produces one. If there is nothing to grade, it should say
   so and print how to produce a run — not fail with a stack trace.
4. **Report the spread, not the flattering run.** A metric that changes when you
   re-measure it was never a metric. `.\run.cmd evals/harness/spread.mjs` runs produce and
   grade three times and writes the range — min, median, max — and names any range with a
   floor inside it. Run it several times and publish the range;
   if a published figure is later found to be a lucky draw, retract it in
   writing and say what replaces it.
5. **Re-run what the change could break, not what's easy to re-run.** Left
   alone, regression coverage follows convenience: the automated cases get
   re-run, the threatened ones don't. Every case declares *re-run when:* — the
   prompts, queries and configs whose change invalidates its last result —
   and that list is consulted, not remembered.
6. **The harness fails loudly.** A FAIL verdict is a non-zero exit; a missing
   run is an error message that prints the command to produce one — never a
   stack trace, and never success.

## Designing a dataset

Write it adversarially and say so. Cover every branch on purpose — the happy
path, the ambiguous case, the one that should be refused, the one that should be
routed to a human, and at least one input that is pure garbage. Keep the inputs
in one place and the labels in another, joined by a stable id, so a replay and
its grading can never drift apart.

**Formats and languages this project claims to handle:** plain-text English documents of
four kinds (transcript, notes, email, feature brief), up to roughly 15k characters. It
does **not** handle attachments, PDFs, images, audio, or any language other than English,
and there is no fixture for any of them — that is a written scope line, not an oversight.
A non-English or binary input is expected to produce a `needs_review` park, and until a
fixture exists that is an expectation, not a tested behaviour.

**Ten fixtures, ten products, and that is a finding rather than a convention (BUG-052).**
Every fixture used to be ingested as `forgesight`. Then WF1 started routing on product state —
*a document whose product has an approved version goes to the delta* — and `forgesight` had an
approved PRD, so under real routing the corpus was one kickoff transcript and nine follow-ups of
it. C1, C2 and C3 would have graded a database with no generation runs in it. `produce.mjs`
stepped around it by asking the door not to dispatch and driving generate by hand, which made
the one file whose job is *replay through the real doors* the one file that did not.

The corpus is now **one product per fixture** (`labels.mjs`, `productFor`), because that is what
these documents are: G1 is garbage, H1 is an attack, H2 is a PII sample, N1/E1/F1 are separate
briefs, and none is a follow-up of a kickoff transcript. It makes *this document generates* a
structural fact rather than a state a stray sign-off can flip — and it bounds the damage when
one does happen: an approval in one fixture's product costs one fixture, where a shared product
would cost all ten. `verify-corpus-routing.mjs` asks the shipped `routeFor()` every sweep, for
nothing, and names the fixture if the answer ever changes.

**T2 really is T1's follow-up**, and is still graded here as a first document, because C1/C2/C3
grade its extraction against its own labels and never look at T1. The pair is only true for
**C5**, which needs an approved baseline and therefore its own product — `forgesight` itself,
which keeps the approved versions it already has. C5 is E6-S5 and is not built.

**And give it a hostile section.** Adversarial-about-business-logic (a request
you can't fulfil, an edge-case budget) and adversarial-about-intent are
different threat models — only one of them is *trying*. For anything that reads
strangers' text and acts on it, include: an input crafted to make the model
disobey its rules (prompt injection), one that tries to make it leak, one that
tries to make it overspend, plus the formats you claim to handle (attachments,
other languages) or a written line saying you don't.

## Case template

See `evals/cases/template.md`. Each case names: what it measures, the method,
the **pass threshold**, which stories it gates, and where results land.

Two threshold habits worth copying:
- **Separate the fatal class from the merely wrong.** An invented fact is not a
  low score — it is an automatic fail, at any accuracy.
- **Give ambiguity a third verdict.** `manual-review` beats a false FAIL, and a
  case can legitimately end `PASS-PENDING-MANUAL-REVIEW`.

## Judges, if you use one

If a second model grades the first: it must come from a **different vendor**
(the grader is never the doer), it runs as a **non-blocking background sweep**
(never in the request path), and its scores are a **monitoring signal, not
ground truth** — the labeled set stays the gold standard. Write the rubric
defensively so the judge cannot punish correct behaviour, e.g. *a null field is
never a violation; it means the extractor declined to guess.*

A judge deliberately gets no same-vendor fallback. Its only substitute would be
the doer grading itself — better that marking pauses than that the student marks
the paper.

### The judge in this project, and where it is not (E7-S5)

WF6 sweeps a bounded random sample — at most 2 PRD versions and 20 requirements that have
never been judged — with `gemini-3.8-flash` at thinking budget 0, against the rubric in
`n8n/prompts/judge-item.md`. Every score carries the **rubric version**, which is a content
hash of the bytes the model was sent.

**No case here reads any of it.** Not C1, not C2, not C3, not C4, not C6; no threshold, no
metric, no report figure. That is checked, not promised: `verify-judge-isolation.mjs` walks a
**derived** list of every file a gate is computed in and fails on a reference to the judge's
module, endpoints or tables — and `negative-control-judge.mjs` plants one in `C1.mjs` and in
`metrics.mjs` and confirms the check goes red and names the file.

**The judge never sees the labels.** `verify-prompt-hygiene.mjs` already fails on any label
quote in any prompt file; `verify-judge.mjs` re-checks the runtime payload of a real sweep.
Where the judge and the answer key differ is computed **afterwards, by the C1 matcher** — the
judge is not asked to compare itself to anything.

**Disagreement opens a card, on a rule.** More than 40% of comparable rows in one sweep, or
three consecutive sweeps with any disagreement, writes a BUG card automatically. The card
investigates the **rubric and the labels equally**: persistent disagreement is as likely to
mean the answer key is wrong. It changes no label, no threshold and no gate — and the
labels-before-tuning rule still governs any correction it leads to.
