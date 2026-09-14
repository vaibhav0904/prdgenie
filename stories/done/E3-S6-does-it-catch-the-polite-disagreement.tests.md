# Test cases: E3-S6 — does it catch the polite disagreement?

Written before any build work, per gate G3. **The story has two parts and they fail
differently**, so the rows are split: Part 1 is ground truth, checkable now and by a human;
Part 2 is a case, and it cannot be written honestly until Part 1 is signed off.

## The rule this whole story exists to obey

**No output has ever been run against T4.** The labels were written from the transcript, the
transcript was written from the decoy outwards, and nothing has been extracted, graded or
scored. That ordering is the only thing that makes C4's eventual number mean anything, and it
is the ordering that was violated nowhere in this project so far — the point is to keep it
that way when there is a threshold waiting to be chosen.

**The threshold is not in this test plan on purpose.** It gets written after Vaibhav signs off
on the labels and before C4 is first run. A threshold chosen after seeing a score is not a
threshold.

## Part 1 — the fixture

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **T4 exists and reads like a real meeting** | interruptions, a tangent, a late joiner, and speech that isn't tidy | Pass | 4507 chars, 5 speakers, Nadia joins at 14:19, Dana's absence interrupts Wei mid-item and carries no requirement |
| TC2 | **Three conflicts, two of them implicit** | exact counts, not a range | Pass | `verify-labels` TC8b: 3 conflicts — 2 implicit, 1 explicit |
| TC3 | **Every conflict declares its explicitness** | so the case can report the two kinds separately and never average them | Pass | TC8c: all declared |
| TC4 | **At least one decoy: sounds unsettled, is decided** | labelled a requirement, never a conflict | Pass | TC8d: `T4-R02` (constraint) — SSO cut for the pilot |
| TC5 | **The decoy is not also a conflict** | no passage is both | Pass | TC8e |
| TC6 | **Both sides of every conflict are labelled as unsettled positions** | ≥2 per conflict | Pass | TC8f: 6 positions across 3 conflicts |
| TC7 | **Every quote resolves verbatim** | 100%, checked before the file was saved | Pass | 21 T4 quotes; the builder refuses to write a file whose quote is not in `raw_text`. Total across the dataset: **123 regions** |
| TC8 | **The label checker can see a new fixture at all** | an unpinned fixture fails | **Pass, after a fix** | It could not. See below |
| TC9 | **NEGATIVE CONTROL: the implicit count can fail** | reclassify one implicit conflict → red, naming the counts | Pass | `FAIL TC8b … 1 implicit, 2 explicit`, then restored and green. **First attempt tested nothing** — the tamper script died before writing and the check passed on an untampered file |
| TC10 | **The fixture is regenerable, not hand-edited** | rebuilding produces byte-identical files | Pass | `evals/datasets/build-t4.mjs`; `git status` clean after a rebuild |
| TC11 | **Vaibhav reads T4 beside its labels and signs off** | the implicit conflicts are genuinely disagreements; the decoy is genuinely decided | **Delegated — the guard is absent** | *"I will go with your suggestion."* See the section below: what was lost, what was substituted, and my own cold re-read |

**11 of 11 resolved: 10 pass, and TC11 was delegated rather than performed.**

## What TC8 found, and why it is the most useful row here

`verify-labels.mjs` printed **"nine fixtures exist with the expected doc_types"** while **ten**
sat on disk, and passed. Its expected set was a **floor**: it checked that every named fixture
was present and never that every present fixture was named. T4 could have arrived, been
graded, and carried no count pin at all.

That is BUG-003's disease in the one file whose whole job is ground truth. Fixed: an
unexpected fixture now fails and the message names it and says what to do —
*"add it to EXPECTED and give it a count row"*. The headline count is derived from the set
rather than typed, so it cannot go stale again.

## Part 2 — the case, built and run three times

**C4 exists, and it fails: FAIL, PASS, FAIL.** That is the honest first measurement of this
capability, and the case is doing its job — it was observed passing (run 3), so it is not a
rule that can only ever go red (BUG-017), and its control proves both directions.

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC12 | `evals/cases/C4-ambiguity-detection.md` exists with threshold, third-verdict rule, gated stories, `Automated? YES`, and a *re-run when:* list | — | Pass | `evals/cases/C4-ambiguity-detection.md` — six numbered rules, the third verdict, `Automated? YES`, and a five-item re-run list |
| TC13 | **The threshold is written before C4's first real run**, and the old "≥2 of T3's 3" is declared void rather than inherited | — | Pass | the thresholds were written **before the first run** and the old "≥2 of T3's 3" is declared void in the case file, with the reason (T3 has had two conflicts, both explicit, since T3-Q03 was withdrawn) |
| TC14 | **Implicit and explicit conflicts are scored and reported separately**, never averaged | — | Pass | explicit **0, 1, 0 of 1**; implicit **0, 1, 0 of 2** — reported in separate rows, never summed |
| TC15 | `conflict` and `unanswered` matched by **span overlap** (ADR 0008) | — | Pass | span overlap, half-open, re-implemented in the case rather than imported from the product (C2's rule) |
| TC16 | `missing_nfr` matched **by category**, reported separately, never averaged into the span score | — | Pass | reported by category in its own row. **Zero on T4 in all three runs** — new information for BUG-020, which had found all six enumerated on F1 and H1 |
| TC17 | **The decoy is scored** — flagging it is a false positive and is counted as one | — | **Pass — and it is the clean result** | the decoy was never flagged: **9 of 9** across two outputs and three runs |
| TC18 | **The decoy is scored twice**: as a `conflict` open question *and* as an unsettled position (BUG-024) | — | Pass | scored as a conflict *and* as an unsettled position; 0 false positives on both |
| TC19 | **`unsettled_positions` are graded**, and reported separately from open questions — different calls, different prompts | — | Pass | **2 of 6** positions found, all three runs, reported in its own row |
| TC20 | A reported conflict not in the labels yields `PASS-PENDING-MANUAL-REVIEW` with the item listed | — | Pass | run 2 reported a conflict no label claims — routed to `PASS-PENDING-MANUAL-REVIEW` with the item printed, not counted against the system. It is `T4-Q04` reported under the wrong kind |
| TC21 | **Sample size beside every figure** — "2 of 3" never appears as "67%" | — | Pass | every figure is "n of m"; no rate appears anywhere in the result file |
| TC22 | If implicit conflicts are consistently missed, the result says so **in words** | — | Pass | the words fire automatically when implicit = 0: *"finds explicit disagreements and misses implicit ones"* |
| TC23 | **Negative control run once**: suppress detection, C4 goes red, restore | — | Pass | `negative-control-c4.mjs`, both directions: a planted conflict citing T4-Q01's span turns R1 green, removing it turns it red, the row count is restored, and the labels are asserted untouched |
| TC24 | Coverage asserted (BUG-003), derived not typed | — | Pass | coverage derived — labelled open questions examined vs labelled, failing on a gap |
| TC25 | **Run everything twice** (BUG-021) | — | Pass | three full runs; `verify-labels` twice; the control twice |

## Out of scope, named so it is not smuggled in

- **No prompt is touched in this story.** C4 is being built to measure the detector, and a
  story that changes what it measures while building the measurement can report anything it
  likes. BUG-020, BUG-023 and BUG-024 are all waiting on this case and **none of them is fixed
  here**.
- **T3 is not relabelled.** Recovering the withdrawn implicit conflict by changing our minds
  about old data is what `evals/README.md` rule 2 forbids; the coverage is being replaced with
  new data instead.
- **No threshold is inherited.** The old one is void.

## What this story cannot claim

T4 was written by the same person who will read its results, about an invented product, and
its implicit conflicts are implicit **in our judgment**. The one guard that survives that is
Vaibhav signing off on the labels **before any output exists to compare them against** — the
guard that caught T3-Q03, at the cost of three prompt iterations spent first.

---

## TC11 answered — 2026-09-02, delegated. **The guard this story named is now absent.**

> *"I will go with your suggestion. Proceed."*

This card's own closing paragraph says what T4 cannot claim: it was written by the same person
who will read its results, its implicit conflicts are implicit *in our judgment*, and **the one
guard that survives that is Vaibhav signing off on the labels before any output exists.**

That guard has now been declined. It is not a small thing and it is not being written up as a
formality: the review it replaces is the one that caught **T3-Q03**, where I had written a
passage to be adversarial and a reader disagreed with me about what it said. **Nobody has
disagreed with me about T4.**

So the honest statement, which travels with every C4 number from here:

> **C4's labels were written and approved by the same person. An implicit conflict in T4 is
> implicit in one reader's judgment, and no second reader has tested that.**

That sentence goes in the case file, not only here.

### What can still be guarded, and now is

The sign-off was one of two guards. The other — **labels frozen before any output exists** — is
mechanical, and it survives:

- The labels are **hashed before C4's first run**, and the hash is stored in the case file.
- `verify-labels.mjs` fails if the hash ever changes, so *"never edit labels to match output"*
  becomes a check rather than a promise.
- **No output has been run against T4 at the time of writing.** The threshold below is chosen
  from principle, in writing, before the first run.

That does not replace a second reader. It replaces the failure mode a second reader would have
caught *late* — quietly adjusting the key once the score is known.

### My own re-read, cold, against the three questions

Recorded because "I checked my own work" should at least say what it checked.

| | Verdict |
|---|---|
| **`T4-Q02`** guided setup vs *"nothing stands between them and seeing data"* | **Holds.** Tom's sentence is a requirement, not a mood: three steps before data is exactly what he rules out, and he says it while agreeing. The weakness is that Wei says *"Right"* and it ends there — a reader could call it agreement rather than a conflict, and that reading is available |
| **`T4-Q03`** thirty-day deletion vs thirteen months of history | **Holds, and it is the better of the two.** Nadia accepts the premise, names a requirement that contradicts it, and softens it to *"we can probably do both"* — which nobody tests. It is unresolved on the page |
| **`T4-R02`** the SSO cut | **Holds as a decoy.** Marcus decides, Tom dissents *after* the decision, Marcus restates it. Identical in shape to `T3-R07`, which Vaibhav himself read as settled |
| **`T4-Q04`** how long three steps may take | **Unanswered, not a conflict.** Nobody took a position against anybody |
| **`T4-R04`** double-labelled | **Kept.** It is the interesting case: extractable as a requirement *and* one half of a live disagreement, and C4 must be able to tell those two failures apart |

**Not a substitute for the review that was declined.** Every one of those verdicts is the same
judgment that produced the labels.

---

## What C4 found on its first three runs — 2026-09-02

**FAIL, PASS, FAIL.** The case is built, controlled in both directions, and the system does not
meet the rule that was written for it before it ran.

| | run 2 | run 3 | run 4 |
|---|---|---|---|
| **R1** the explicit conflict is found | 0 of 1 | **1 of 1** | 0 of 1 |
| **R2** the decoy is not called a conflict | 0 FP | 0 FP | 0 FP |
| Implicit conflicts | 0 of 2 | 1 of 2 | 0 of 2 |
| Unanswered | 0 of 1 | 0 of 1 | 0 of 1 |
| Unsettled positions | 2 of 6 | 2 of 6 | 2 of 6 |
| `missing_nfr` emitted | 0 | 0 | 0 |
| T3 conflicts (secondary) | 1 of 2 | 1 of 2 | 1 of 2 |
| **Verdict** | FAIL | PASS | FAIL |

**The threshold did not move, and will not.** R1 was written from principle before the first
run: a detector that misses *"It's not being decided in this meeting"* is not detecting. The
system meets it one run in three.

### The finding, which is worth more than the verdict — BUG-025

**The extractor finds the argument in 3 of 3. The detector finds it in 1 of 3.** The component
built to find unsettled things is worse at it than the component that was given a second box
yesterday for a different bug.

Nothing designed that comparison. It fell out of BUG-007, and without it C4 would have
reported *"finds explicit disagreements, 1 in 3"* with no way to tell whether T4 or the
detector was at fault. Filed as **BUG-025**, undiagnosed, with three separable candidates.

### Two more things these runs measured

- **`missing_nfr` was zero on T4, all three runs.** BUG-020 found all six categories
  enumerated on F1 and H1. **The enumeration is fixture-dependent**, which BUG-020 did not
  know and cannot be diagnosed without.
- **The decoy was never flagged — 9 of 9** across two outputs and three runs. `T4-R02` is the
  most heated passage in the document and was read as decided every time. **That is the one
  clean result here**, and it is exactly the property the fixture was written to test.

### Why the story closes on a failing case

E3-S6's deliverable is **the case**, not a passing score: *"C4 — built here and must leave a
verdict, which may legitimately be `PASS-PENDING-MANUAL-REVIEW`."* It leaves a verdict, the
verdict is honest, the failure is the system's — proven by the control — and the fix is a BUG
card rather than a threshold edit.

**Three cards were waiting on this case and all three now have something to read**: BUG-020
gets a fixture where enumeration does *not* happen, BUG-023 gets a second contested-passage
data point, and BUG-024 gets a decoy that was never mistaken.
