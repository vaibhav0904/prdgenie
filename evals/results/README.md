# Results — the run ledger

Result files are dated and **never overwritten**. A second run on the same day writes
`-run2`, `-run3`, and so on. When a re-run supersedes an earlier figure, the old file stays
and this ledger says what it was (`evals/README.md` rule 4).

This file exists because the filenames alone are misleading in one specific way: **not every
result file is an independent sample.** Some are re-grades of the same stored run, produced
while verifying the instrument. Counting them as measurements would overstate the sample
size, which is the exact error the spread rule exists to prevent.

## 2026-09-01 — C1, extraction quality

| File | Prompt version | Independent run? | T1 recall / precision | T3 recall / precision |
|---|---|---|---|---|
| `2026-09-01-C1.md` | `e1s4` (E1's prompt, untouched) | yes | 64.3% / 60.0% | 100% / 85.7% |
| `-run2.md` | `2951b0636a95` (iteration 1) | yes | 64.3% / 64.3% | 100% / 66.7% |
| `-run3.md` | `7767a84fd2db` (iteration 2) | yes | 78.6% / 78.6% | 100% / 85.7% |
| `-run4.md` | `7267c39b005e` (iteration 3) | yes | 92.9% / 86.7% | 100% / 66.7% |
| `-run5.md` | `7267c39b005e` | yes | 92.9% / 86.7% | 100% / 66.7% |
| `-run6.md` | `7267c39b005e` | yes | 92.9% / 92.9% | 100% / 66.7% |
| `-run7.md` | `7267c39b005e` | **no — re-grade of run6's stored data** (TC7) | 92.9% / 92.9% | 100% / 66.7% |
| `-run8.md` | `7267c39b005e` | **no — re-grade of run6's stored data** (TC10) | 92.9% / 92.9% | 100% / 66.7% |
| `-run9.md` | `7267c39b005e` | yes | **78.6%** / 84.6% | 100% / 66.7% |
| `-NEGATIVE-CONTROL.md` | `6db5c9b6b561` (deliberately broken) | control, not a measurement | 14.3% / 100% | 16.7% / 50.0% |

**Independent runs at the current prompt (`7267c39b005e`): four** — run4, run5, run6, run9.

- **T1 recall: 78.6% – 92.9%** (median 92.9). The threshold is 0.80. **The range straddles
  it**, so no single run settles whether T1 passes, and none of these numbers may be
  published alone (`evals/README.md` rule 4; E2-S4).
- **T1 precision: 84.6% – 92.9%.** Above the 0.75 floor in every run.
- **T3 recall: 100%** in all four.
- **T3 precision: 66.7%** in all four — below the 0.75 floor, every time, failing on the
  same three items. Diagnosed as BUG-007.

## 2026-09-01 — C2, grounding fidelity, PII and refusal

| File | Prompt version | Grounding | PII (H2) | Refusal (G1) | Verdict |
|---|---|---|---|---|---|
| `2026-09-01-C2.md` | `7267c39b005e` | 0 hallucinated / 64 citations; 63 exact, 0 normalized, 1 honestly flagged | **11 of 21 survived** | **14 requirements**, expected 0 | **FAIL** |

C2 has no score, only three independent auto-fail rules. Rule 1 — the central claim, that
nothing marked grounded is invented — **passes**. Rules 2 and 3 fail, and both were already
known to the fixtures: BUG-008 and BUG-009 for the PII half, BUG-004 for the refusal half.

**Run 10 (`-run10.md`), after BUG-010's fixes**, is the current state: T1 **85.7% / 85.7%**
(passing), T3 **100% / 66.7%** (failing on the same three conflict items). T1's recall over
five independent runs of prompt `7267c39b005e` is now **78.6%, 85.7%, 92.9%, 92.9%, 92.9%** —
still straddling the 0.80 floor, and still not a publishable figure on its own.

**The negative control is not a measurement.** It is the record of deliberately breaking
extraction (a prompt clause restricting it to requirements mentioning email) and confirming
C1 went decisively red: recall fell to 14.3% and 16.7%, and the result file named all
seventeen missed requirements individually. The prompt was restored immediately afterwards
and `sync-prompts.mjs` confirms the version is back to `7267c39b005e`.

## 2026-09-02 — labels amended by the owner, then C1 and C2 re-run

**Read this section before quoting any figure below it.** C1 passes for the first time, and
part of that improvement comes from a change to the answer key. That is the exact shape of
the thing `evals/README.md` rule 2 forbids, so the reasoning is recorded in full rather than
summarised.

### What changed in the labels

Vaibhav ran the E1-S3 / E1-S4 / E1-S6 judgement review on 2026-09-02 and made two changes.

| Change | Fixture | Could it be tuning-to-output? |
|---|---|---|
| **T3-Q03 removed** as a conflict; the scope decision inside it added as **T3-R07** (the tablet view is out of the pilot) | T3 | **No, and this is verifiable.** Nothing in the system extracts open questions — E3-S4 is unbuilt — so there was no result to tune toward. He was reading the transcript, not a diff. |
| **T1-R15 added** — the two-second budget must hold at forty-one million rows | T1 | **Partly, and it is not deniable.** He saw the extraction, in which this appeared as an unlabelled requirement. His stated reason is on the transcript's own terms: the budget is not buildable without the volume. But the honest test — *would you have made this edit having never seen a result* — cannot now be run, and this row exists so nobody pretends otherwise. |

Also decided, without changing anything: **T1-R05, the Q4 pilot date, stays.** Vaibhav
confirmed a fixed date belongs in the PRD, so the runs that miss it are missing a real
requirement. It is listed under **Missed** in all **eight** graded runs of the current
prompt version `7267c39b005e` — 2026-09-01 run4, run5, run6, run9, run10 and all three of
today's — and in no run has it ever been found. Vaibhav's note that a fixed date belongs in
prioritisation rather than the requirement list is carried to **E3-S3**; it does not change
the label.

Two label-shape assertions in `verify-labels.mjs` were re-pinned to match (TC5: 15
requirements; TC8: 2 conflicts), exactly, not widened into ranges.

### C1 after the change — three independent runs, prompt `7267c39b005e` unchanged

| File | T1 recall / precision | T3 recall / precision | Verdict |
|---|---|---|---|
| `2026-09-02-C1.md` | 93.3% / 93.3% | 100% / 77.8% | pass |
| `-run2.md` | 93.3% / 93.3% | 100% / 77.8% | pass |
| `-run3.md` | 93.3% / **100.0%** | 100% / 77.8% | pass |

- **T1 recall: 93.3% in all three** (14 of 15). The single miss is **T1-R05** every time.
- **T1 precision: 93.3% – 100%.**
- **T3 recall: 100% in all three. T3 precision: 77.8% in all three** — above the 0.75 floor
  for the first time, after failing at 66.7% in four consecutive runs before this.

**How much of that is the label change?** Most of it, and the arithmetic is small enough to
show rather than assert:

- T3 precision was 6 of 9 matched (66.7%). T3-R07 turned one false positive into a match:
  7 of 9 (77.8%). **The prompt did not change and the model's output did not change.**
- T1 precision was 13 of 15 (86.7%). T1-R15 turned one false positive into a match: 14 of 15
  (93.3%). T1 recall barely moved — 13/14 (92.9%) became 14/15 (93.3%) — because the new
  label is one the model already finds, so it landed in both the numerator and the
  denominator.

So: **C1 went green because the answer key got more accurate, not because the extractor got
better.** Both are legitimate ways for a measurement to change. Only one of them is a
product improvement, and this is not it.

### The defect C1 was built to catch is still there

C1 passes **while still containing BUG-007**. T3's two remaining false positives are the two
sides of T3-Q01 — Tom wants self-serve email login, Priya holds the line on SAML-only, and
the meeting ends *"I'm not settling that in this meeting."* Both are emitted as
requirements, because unsettled arguments still have nowhere to go. **E3-S4 remains first in
the backlog and a green C1 is not an argument against it.**

### C2 — unchanged, still failing, for the reasons already filed

| File | Grounding | PII (H2) | Refusal (G1) | Verdict |
|---|---|---|---|---|
| `2026-09-02-C2.md` / `-run2` / `-run3` | **0 hallucinated citations**, 8 of 8 fixtures examined | **11 of 21 survived** | 14–16 requirements, expected 0 | **FAIL** |

Rule 1 — nothing marked grounded is invented — passes, as it has every time. Rules 2 and 3
fail on BUG-008, BUG-009 and BUG-004. The label change touched none of this, which is the
expected result and worth stating: a label edit that had moved C2 would have meant the edit
reached something it had no business reaching.

**G1 produced 14, 16 and 14 requirements across the three runs**, from a document containing
none. BUG-004 is not only present, it is unstable — worth knowing before anyone tries to
fix it by prompt wording and reads a two-item swing as a result.

## 2026-09-02 — BUG-008 and BUG-009: C2's PII rule reaches its floor

Three C2 runs on the same day, each after one change. Nothing about extraction changed
between them; the prompt version is `7267c39b005e` throughout.

| Run | Change | PII surviving, of 21 | C2 fails on |
|---|---|---|---|
| `-run3` | — (before either fix) | **11** | PII (BUG-008, BUG-009) + refusal (BUG-004) |
| `-run4` | BUG-008: phones matched by shape | **8** | PII (BUG-009) + refusal (BUG-004) |
| `-run5` | BUG-009: external names, anchored on the address | **0** | **refusal only (BUG-004)** |

Two of C2's three auto-fail rules now pass. Rule 1 — nothing marked grounded is invented —
has passed every run since the case existed (0 hallucinated over 73 citations, 100% exact).

**How to read the 100%.** It means every value the answer key lists is gone. The answer key
lists people whose contact details appear in the document, and the redactor is anchored on
exactly that: the local part of an external email identifies the person, the domain says
they are external. **A named external individual with no address and no number anywhere is
still not redacted** — written into `docs/assumptions.md` as the narrowed claim, and
asserted by a test so it stays a decision. The claim is *external contact details are
removed, and external names are removed wherever a contact detail identifies them*.

**The half of this that the labels could not measure.** H2 names 21 values that must go and
says nothing about the thousands that must stay, so a redactor that removed every
capitalised word would have scored 21 of 21 and passed the floor. Five rows of the new
check assert that something is **KEPT** — internal stakeholder names, customer
organisations, job titles, ordinary capitalised prose, and lower-case tokens — and three of
those five test things no label mentions. For any rule that deletes, the answer key is only
half the test.

C1 across the same three runs is unchanged and passing: T1 93.3% recall with precision
93.3–100%, T3 100% / 77.8%. Redaction rewrites H2 only; the other eight fixtures contain no
email address at all, which is asserted rather than assumed.

## 2026-09-02, later — the redaction policy reversed, and the answer key grew a second half

Vaibhav read the BUG-008/BUG-009 UAT and reversed the decision it was built on: **names are
kept, only contact details are removed.** An external speaker often carries no role, so the
name is the only attribution there is — redacting it orphans the requirement rather than
anonymising it.

That makes H2's answer key a **specification** change, which is the one escape
`evals/README.md` rule 2 allows. The eight `customer_name` values moved out of
`expected_redactions`. They did not vanish: they moved into a new `expected_retentions` list,
alongside internal names, customer organisations and job titles that were **never labelled at
all**.

| C2 run | Policy | Must GO | surviving | Must STAY | erased | Fails on |
|---|---|---|---|---|---|---|
| `-run3` | pattern-only, both leaks open | 21 | **11** | — | — | PII + refusal |
| `-run4` | after BUG-008 | 21 | **8** | — | — | PII + refusal |
| `-run5` | after BUG-009 (names redacted) | 21 | **0** | — | — | refusal |
| `-run6` | **names kept, both halves labelled** | 13 | **0** | 22 | **0** | **refusal only** |

**The retention half is the point of this entry.** Until run 6 the dataset could only see
under-redaction — it listed 21 values that had to go and nothing that had to stay, so a rule
deleting every capitalised word would have scored 21 of 21 and passed the 100% floor. That is
now an auto-fail, and the negative control demonstrates it: adding a rule that eats every
capitalised word turns C2 red on the retention half **while the contact-detail half still
reports a perfect score.**

**For any rule that deletes, the answer key is only half the test.** The other half has to be
written from what the rule must not touch, and nobody writes that down unless they go
looking — which is why it took building the wrong feature to find it.

C1 in run 6: T1 **86.7% / 92.9%**, T3 **100% / 77.8%** — passing. T1 recall moved from 93.3%
because two labels went unmatched this run rather than one; the T1 recall range across the
current prompt is now **86.7% – 93.3%**, and the range is the figure, not the best run.

## 2026-09-02, BUG-004 — C2 goes green, and C1 becomes unstable

Prompt version **`7267c39b005e` → `5ad1a07854f1`**. The change is structural, not more
refusal prose: the model now names `document_subject` and `concerns_product` before listing
anything, each requirement carries a `subject`, and **code** parks the run when the judgement
is `false`.

| Run | G1 requirements | T1 recall / precision | T3 recall / precision | C1 | C2 |
|---|---|---|---|---|---|
| `-C1-run8` / `-C2-run8` | **0**, parked | 86.7% / 92.9% | 85.7% / 75.0% | pass | **PASS** |
| `-run9` | **0**, parked | 93.3% / 100% | **71.4% / 62.5%** | **FAIL** | **PASS** |
| `-run10` | **0**, parked | 86.7% / 92.9% | 100% / 77.8% | pass | **PASS** |

**C2 passes three of three — the first time since the case was written.** All three auto-fail
rules: no hallucinated citations, no PII surviving and no retention erased, and the
requirement-free document producing nothing.

**G1: 0 in three of three**, against 16 / 15 / 14 / 14 under the four previous prompt
versions. And the model reaches zero on its own — it returns `document_subject: "staff
parking and office facilities"`, `concerns_product: false`, empty list. The code gate is the
backstop; naming the subject is what did the work.

**T1 is unharmed:** 86.7 / 93.3 / 86.7, inside the 86.7–93.3 range measured before.

**T3 is harmed, and C1 now fails about one run in three.** Recall was 100% in every previous
run. The consistently missed label is `T3-R07`, the tablet cut — and the extraction prompt
lists *"let's call it cut for now"*, which is `T3-R07`'s own quote, as its worked example of
something that must not be extracted. **The prompt forbids by name the requirement the answer
key demands** (BUG-018).

That contradiction was created by the 2026-09-02 label review and has been live since. It
stayed invisible because the model ignored the clause about a third of the time. This change
made it obey more consistently, so **a more obedient model scored worse.**

**Nothing has been tuned in response**, and the numbers above are published as they came out.
Resolving it means either narrowing the prompt clause or reconsidering `T3-R07`, which is
Vaibhav's reading of his own relabel — BUG-018 puts it to him with no recommendation attached.

### One more thing, found before the runs rather than after

C2 could not recognise a correct refusal at all (**BUG-017**). A park wrote a `prd_versions`
row without returning its id, so the manifest recorded `prd_version_id: null` and C2's
refusal rule compared `null === 0`. The first graded run after the fix reported
*"Requirements produced: **null** … Park reason: none — a draft was created"* on a run where
G1 had parked perfectly.

**A green case that has never once gone green for the right reason is not a tested case.**
Every rule in C2 had been exercised in its failing direction; the refusal rule's passing
direction had never occurred, so nothing verified it could. Now controlled in both.

**Not every file in this batch is a measurement.** `-C2-run11` through `-C2-run19` are
re-grades of stored runs produced by `negative-control-refusal.mjs`, which grades C2 three
times per invocation (green, deliberately broken, green again). Counting them as samples
would treble the apparent evidence for a rule that was checked once — the exact error this
ledger's opening paragraph exists to prevent.

**Independent runs at `5ad1a07854f1`: three** — run8, run9, run10.

## `47ac49c6330b` — BUG-018, the clause narrowed (2026-09-02)

Vaibhav chose **Option 1**: `T3-R07` stands and the prompt clause is narrowed. The bullet no
longer keys on hedging words; it asks whether the document contains a **decision** — did
somebody with the authority settle it, or explicitly defer it.

Three independent runs, `2026-09-02-C1-run11/12/13` and `-C2-run20/21/22`:

| Fixture | Recall | Precision | |
|---|---|---|---|
| T1 | 86.7 / 86.7 / 86.7 | 81.3 / 92.9 / 92.9 | pass ×3 |
| T3 | **85.7 / 100 / 100** | **75.0 / 77.8 / 77.8** | pass ×3 |
| G1 | — | — | parked, 0 requirements, ×3 |

**C1 passes 3 of 3 and C2 passes 3 of 3.** First batch in this project's history where both
do, on three consecutive independent runs.

**Read the margin, not just the verdict.** Run 11's T3 precision is **exactly** 0.75, the
floor. `T3-R07` came back in 2 of 3 runs rather than 3 of 3 — pooled with the negative
control, 4 of 6 at this prompt against 2 of 6 at the old bullet. That is a difference of two
runs in twelve and **must not be quoted as a rate.**

**What did not change.** Both sides of `T3-Q01` are still extracted as requirements in 3 of
3, exactly as before. The clause now describes that case explicitly, in the document's own
structure rather than its tone, and the model extracts them anyway. Third measurement of the
same thing: **an instruction to withhold is followed about two runs in three.** BUG-007 now
records that a fourth prompt iteration is not the answer — E3-S4 is.

### An instrument that had reported PASS could not see its own subject

`verify-prompt-hygiene.mjs` — new here, and it asserts something worth stating on its own:
**no prompt may quote a labelled fixture.** Where it does, part of C1 is measuring whether
the model can pattern-match a sentence it was handed in its instructions.

Its first version compared the whole label quote, `"Let's call it cut for now."`, against a
prompt reading `"let's call it cut for now"` — one full stop apart — and reported *"PASS, no
prompt quotes any labelled fixture"* on the prompt BUG-018 was filed about. The negative
control caught it, then caught a second one: the control had waited on n8n's `/healthz`,
which greens before the webhooks re-register, so six runs 404'd at the door and were read as
*"the label was missing"* — **an assertion passing on runs that never happened.**

**A check run only in its passing direction is not a check.** Both of these were green.

**Independent runs at `47ac49c6330b`: three** — run11, run12, run13. The six T3-only runs
from `negative-control-clause.mjs` are controls, not samples, and are not counted here.

**`-C1-run14` and `-C2-run23` are not a fourth sample.** They are a re-grade of run 13's
stored manifest, run as a final check after the write-up, and they reproduce run 13 exactly
(T1 86.7/92.9, T3 100/77.8). Grading is deterministic over stored rows; only *producing* draws
from the model. Counting a re-grade as a run is the same arithmetic error as counting the
control's re-grades, and the correction is the same: **the denominator is runs produced, not
files written.**

## `b9d627e994f8` — the redirect, and a tie-break narrowed (2026-09-02)

Two changes in one batch, and **attribution survives because each has its own signal**: the
redirect can only move the promoted-example count, and BUG-022's narrowing can only move a
*kind*. Neither can produce the other's evidence.

| Fixture | Recall | Precision | |
|---|---|---|---|
| T1 | **86.7 / 86.7 / 86.7** | **100.0 / 100.0 / 100.0** | pass ×3 |
| T3 | 100 / 100 / 100 | 77.8 / 87.5 / 77.8 | pass ×3 |

**T1 precision is 100% in three consecutive runs — the first clean extraction in this
project's history.** Zero false positives, zero wrong-kind, on either graded fixture.

### The finding is about instruction shape

`T1-R06`'s statement had carried *"such as weekly on Monday morning"* through **four wordings
of a prohibition**. The fifth change was not a fifth prohibition:

| | |
|---|---|
| Four wordings of this did nothing | *"No examples… an engineer builds Friday."* |
| This worked, 3 of 3 | *"The illustration goes in the **quote**, not the statement — **and you are already carrying it.** Appending it to the statement does not save the detail; the citation already saved it."* |

**Same fact, opposite instruction shape.** One forbids; the other says where the thing belongs.
BUG-004 found it, BUG-007 / BUG-018 / BUG-020 each measured the failure of the other shape, and
this is the second time the redirect has worked on the first attempt.

### What reading the misses turned up

T1 recall had been 80–93% for the life of the project. Read one by one rather than as a
number, it was carrying two standing losses:

- **`T1-R02`** — extracted correctly and scored `wrong_kind` in **six consecutive runs**,
  because the prompt's tie-break called a tablet a platform and the key calls it a quality.
  **BUG-022**, fixed here by narrowing the prompt and keeping the label — the BUG-018
  resolution, for the BUG-018 reason.
- **`T1-R05`** — the fixed Q4 deadline, extracted in **1 of 11 measured runs** across three
  prompt versions, on a prompt that says *"never skip it"*. **BUG-023**, filed, undiagnosed.

**Independent runs at `b9d627e994f8`: three** — run21, run22, run23.
