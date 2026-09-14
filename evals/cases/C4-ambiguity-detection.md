# C4 — ambiguity detection

**Automated?** YES — `evals/harness/cases/C4.mjs`, run by `.\run.cmd evals/harness/grade.mjs C4`
**Fixture:** T4 (primary), T3 (secondary, explicit conflicts only)
**Gates:** E3-S6, and the three bug cards waiting on it — BUG-020, BUG-023, BUG-024
**Written:** 2026-09-02, **before this case was ever run against real output**

## What this case measures

Whether the system surfaces what a document **did not settle** — and, since 2026-09-02,
whether the positions it files as unsettled were really unsettled.

Two outputs, produced by two different model calls, **scored and reported separately and never
summed**:

| Output | Produced by | Matched by |
|---|---|---|
| `open_questions` — `conflict`, `unanswered` | the gap detector (`detect-ambiguity`) | span overlap, ADR 0008 |
| `open_questions` — `missing_nfr` | the same call | **category**, never span |
| `unsettled_positions` | the **extractor** (`extract-requirements`) | span overlap |

One being right does not make the other right. They are different prompts reading the same
document, and a run where the extractor is perfect and the detector is silent is a real,
reportable state.

## The thresholds, and why each is where it is

**Chosen from principle, in writing, before the first run.** The old threshold — *"≥2 of T3's
3 conflicts"* — is **void**, not inherited: T3 has had only two conflicts since T3-Q03 was
withdrawn on 2026-09-02, and both are explicit, so the number it named no longer describes
anything.

| # | Rule | Threshold | Why this and not something else |
|---|---|---|---|
| **R1** | The **explicit** conflict is found | **1 of 1 — hard** | `T4-Q01` ends with *"It's not being decided in this meeting."* A detector that misses an announced deferral is not detecting; there is no honest reading of a miss here |
| **R2** | The **decoy** is not reported as a conflict | **0 false positives — hard** | `T4-R02` is a decision taken over a dissent. The model already handles this shape correctly on T3-R07 in 3 runs of 3, so the capability exists; and precision is what makes the question list worth reading. Flagging every argument-shaped passage is the failure this fixture exists to catch |
| **R3** | **Implicit** conflicts | **reported, no threshold this epic** | Exactly PRD-E7's split for injection payload `P4`. A floor invented before the range is known is a number chosen to be met. Two data points cannot support one honestly |
| **R4** | `missing_nfr` | **reported by category, no threshold** | BUG-020 says these are enumerated rather than detected. Measuring that is this case's job; setting a bar for it before the measurement exists would prejudge the answer |
| **R5** | `unsettled_positions` | **reported, no threshold this epic** | The output is one day old (BUG-007). R2's decoy rule applies to it as well: filing the decoy as an unsettled position **is** a false positive and is counted |
| **R6** | Sample size beside every figure | always | "2 of 3" never appears as "67%" |

**R1 and R2 are the only ways C4 can FAIL.** Everything else is reported, and the report is
the deliverable — this is a case that exists to describe a capability honestly, not to produce
a percentage.

## Third verdict

`PASS-PENDING-MANUAL-REVIEW` when the system reports a conflict that is **not** in the labels
and is not the decoy. It may be a genuine find the labels missed — and on 2026-09-02 exactly
that happened in reverse, when a labelled conflict turned out to be a decision. The item is
listed for a human rather than silently counted as a false positive.

The decoy is the exception: it is **labelled as not-a-conflict**, so flagging it is a false
positive with no ambiguity about it.

## If the implicit conflicts are missed

The result says so **in words** — *"finds explicit disagreements, misses implicit ones"* —
rather than reporting a rate over two items. That is a description of the capability and it is
what the deck should say. Decided 2026-09-01, unchanged.

## What this case cannot claim, and it is not a footnote

> **C4's labels were written and approved by the same person. An implicit conflict in T4 is
> implicit in one reader's judgment, and no second reader has tested that.**

E3-S6 required Vaibhav to sign off on T4's labels before this case existed, because the same
review caught `T3-Q03` — a passage written to be adversarial that a second reader correctly
read as settled. On 2026-09-02 he delegated that sign-off back
(*"I will go with your suggestion"*), so **the guard is absent and every number here inherits
that**.

What survives is the mechanical half, and it was installed before the first run:

**T4's labels are frozen at `sha256[0:16] = 3bac9d940f97d88c`**, checked by `verify-labels.mjs`
TC12. Editing the answer key after seeing a score now turns the label checker red and names
the file. If a label must change for a legitimate reason, **the hash changes in the same
commit with the reason written down.**

## Re-run when

- `n8n/prompts/detect-ambiguity.md` changes (any edit, including whitespace — `prompt_version`
  is a content hash)
- `n8n/prompts/extract-requirements.md` changes — it owns `unsettled_positions`
- `review-ui/gaps.mjs` or `review-ui/unsettled.mjs` changes
- T4 or T3 labels change (which now requires changing the frozen hash)
- Any of BUG-020, BUG-023 or BUG-024 is worked on — all three read this case
