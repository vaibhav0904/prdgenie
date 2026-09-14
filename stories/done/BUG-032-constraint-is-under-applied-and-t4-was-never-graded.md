# BUG-032: `constraint` is under-applied, and T4 was never graded for it

**Severity:** major · **Filed:** 2026-09-03, during BUG-030's verification
**Found by making a denominator derived**, not by a failing run — which is the point of it.

## How it was hidden

`C1.mjs` named its fixtures in a typed list: `['T1', 'T3', 'N1', 'E1', 'F1']`. **T4 carries
six labelled requirements and no case read a single one of them.** C4 grades T4's ambiguity
output; nothing graded its extraction. So a fixture with an answer key sat outside every
floor in the project, and had done since it was written on 2026-09-02.

This is the third time this project has been bitten by the same shape — *a check must assert
its own coverage, derived not typed; a hand-counted denominator cannot grow* (BUG-003/019) —
and the first time the denominator in question was a **fixture list** rather than a field
list. C1 now derives the set of fixtures whose answer key carries requirements, and any one
that is neither graded nor **declared** to another case fails the coverage half of the verdict.
The declarations are printed in every result file, `T2` among them: *C5, which is not built*.

## What T4 says, now that anything is listening

Graded against the stored run of 2026-09-03T05:51, prompt `f1ec836b1042`, **no new model
calls** — this baseline cost nothing but the reading:

| Fixture | Recall | Precision | |
|---|---|---|---|
| T1 | 93.3% | 93.3% | pass |
| T3 | 85.7% | 85.7% | pass |
| N1 | 100.0% | 100.0% | pass |
| E1 | 100.0% | 100.0% | pass |
| F1 | 85.7% | 85.7% | pass |
| **T4** | **66.7%** | **57.1%** | **FAIL** |

**C1 is red, and it is red for something that predates today.** No change made on 2026-09-03
touched it; the fixture, its labels and the extraction prompt are all as they were when the
run was produced.

## The pattern, which is one pattern and not three

`constraint` is **under-applied**, and it is under-applied in every direction a constraint can
be mistaken for something else:

| label | labelled | extracted | what the sentence rests on |
|---|---|---|---|
| `T4-R03` *"retained for at least twelve months, **as required by legal**"* | `constraint` | `nonfunctional` | a compliance regime |
| `T4-R05` *"The PDF export carries the customer's own logo and colours, not ForgeSight's"* | `constraint` | `functional` | a brand |
| `T3-R04` *"No third-party analytics or tracking scripts may run"* | `constraint` | `nonfunctional` | a decision not to build |

`T4-R05` is the one that should sting: **the prompt already contains the rule, in those
words** — *"Carry the customer's logo and palette names a brand, so it is a `constraint` and
not a usability quality."* `T1-R12` is the same rule on the dashboard shell and matches
correctly, every run. Change the object from a shell to an export and the rule stops
reaching. A rule that holds on the sentence it was written from and not on its sibling is a
rule the model is pattern-matching, not applying.

There is also one **false positive** on T4 — *"Every export action must be recorded in the
audit log"* — which is not in the answer key. It is counted here and not diagnosed.

## Why it is not BUG-030, and why the two must not be fixed together

BUG-030 is the same boundary failing in the **opposite direction**: `F1-R06` is called a
`constraint` when the label says `nonfunctional`. Fixing one narrows `constraint`; fixing the
other widens it. **Folding them into one edit would produce a change whose two halves cannot
be attributed** — the project's own rule is to vary one thing, and this is exactly the case it
was written for.

BUG-030 goes first because it is authorised and its fix is narrow. This card is the larger
one, and its fix is a rewrite of the tie-break so the discriminator is **who imposes the
requirement** rather than **what words appear in it** — which is what the answer key has
encoded all along:

- `T4-R04` deletes raw rows after thirty days → `nonfunctional`. Nobody outside imposed it.
- `T4-R03` retains data for twelve months → `constraint`. Legal imposed it.

Same shape, same units, opposite kinds, and the duration is not what separates them.

## A measured lead, left by BUG-030 (added 2026-09-03, after it closed)

BUG-030 spent its three iterations on the same paragraph, and the middle of the run is the
useful part of this card:

| prompt | `T4-R03` (twelve months, *as required by legal*) | `F1-R06` |
|---|---|---|
| `f1ec836b1042` baseline | wrong — `nonfunctional` | wrong |
| `543f13d27aa3` iteration 1 | **correct — `constraint`** | wrong |
| `5e44745bab49` iteration 2 | **correct** | not extracted at all |
| `dd2ce8269321` iteration 3, shipped | wrong, 4 runs of 4 | **correct, 4 of 4** |

**Iteration 1 fixed `T4-R03` by accident and iteration 3 gave it back.** What iteration 1 had
was a heavier emphasis on *who imposes the requirement* — the discriminator this card argues
is the real one — and iteration 3 rebalanced the paragraph toward the destination so the model
would stop dropping `F1-R06`. The rule content did not change between them; the emphasis did.

So the first thing to try here is not a new rule. It is **iteration 1's emphasis and iteration
3's destination in the same paragraph**, measured on `T4-R03`, `T4-R05`, `T3-R04` and
`F1-R06` together. The prediction on BUG-030's card is that both fit; if they do not, that is a
finding about how much one prompt can carry and it belongs here.

`T4-R05` — the export logo — was correct in iteration 2 alone, and wrong in every other
version including all four shipped runs. It remains this card's sharpest item.

## Not done, deliberately

- **No prompt iteration spent here.** BUG-030 holds the authorised one; this card must be
  measured on its own or neither result means anything.
- **T4 was left in C1** rather than removed to keep the case green. A fixture taken out of a
  case because it fails is the `verify-gate` mistake with a different mask.

## Verified by
- C1 green on **T4** at the same floor as every other fixture, over three runs
- `T3-R04` matching, and `T1-R12` still matching — the rule reaching the sibling sentence
- the F1 result from BUG-030 unchanged by it, measured after both are in


---

## Measured 2026-09-03. **Not closed** — the fix works and it costs `F1-R06`

Three iterations, all three PRD-E2 allows, then a fourth and fifth edit under BUG-035's
separate diagnosis. **The card's own subject is fixed**: every one of the three items it named
comes back correct. It is not closed because it reopened a different closed bug and I did not
get it back before the provider ran out of credit.

### What the card asked for, and got

| | before | after (`7f9c3916173e`) |
|---|---|---|
| `T4-R03` twelve months *as required by legal* = `constraint` | **0 of 4** | correct |
| `T4-R05` the export carries the customer's logo = `constraint` | **0 of 4** | correct |
| `T3-R04` no third-party scripts = `constraint` | 3 of 4 | correct |
| **T4 recall / precision** | **66.7 / 57.1 — FAIL** | **100 / 85.7 — pass** |
| `T4-R04` thirty days = `nonfunctional` | 4 of 4 | still correct |
| `T1-R05` extracted, `constraint` (BUG-023) | 4 of 4 | still correct |
| **`F1-R06` = `nonfunctional` (BUG-030)** | **4 of 4** | **wrong — reopened** |

### The three iterations

**1 — supply the ordering the prompt already claimed to have.** The section had ten competing
bold paragraphs and the worked-example note said *"the three kinds decided by the ordering
above"* — a reference to an ordering **that did not exist**. All three failures were the same
failure: a `constraint` trigger losing to whichever later paragraph read closest. Adding
boundary → level → capability, decided in that order, took T3, N1, E1 and F1 to 100% and did
not move T4 at all.

**2 — make the cases defer, in their own first sentence.** The model was writing *"as required
by legal"* into its own statement and still choosing `nonfunctional`, so it was not failing to
see the imposer: the louder, more concrete paragraph was winning. **An ordering announced once
at the top and never referred to again is a heading, not a precedence.** With two paragraphs
deferring explicitly, `T4-R03` and `T4-R05` came back right in 2 runs of 3 — but T4 cleared
the floor in only 1 of 3.

**3 — no new rule, and none dropped: 92 lines folded under the ordering.** The remaining
variance was not a missing rule. Every rule needed was already there; the section was the
problem. This is what finally made T4 **stable** at 100 / 85.7 — and it broke `F1-R06` and
`T1-R02`, stably, 2 runs of 2, because I had filed both "this is NOT a boundary" guards
**inside the boundary step**. That is BUG-035.

### Then two edits under BUG-035, and where it stopped

Moving the guards under step 2 recovered `T1-R02` and kept T4 — `7f9c3916173e`, C1 PASS.
`F1-R06` did not come back. Restoring its dedicated heading as well broke **T3** to 71.4%, so
that edit was reverted and the prompt is byte-identical to `7f9c3916173e` again, confirmed by
the hash.

The next run to confirm it at n=3 **parked all ten fixtures: the OpenAI balance is empty.**
BUG-036. No further measurement is possible today.

### What is shipped, and the choice that is not mine

The repo carries `7f9c3916173e`. Against the state BUG-030 shipped:

| | `dd2ce8269321` (shipped by BUG-030) | `7f9c3916173e` (shipped now) |
|---|---|---|
| C1 | **FAIL**, every run | **PASS**, 1 of 1 |
| T4 | 66.7 / 57.1 | **100 / 85.7** |
| `T4-R03`, `T4-R05`, `T3-R04` | wrong | **right** |
| T1 / T3 / N1 / E1 | 86.7–93.3 / 85.7–100 / 100 / 80–100 | 93.3 / 100 / 100 / 100 |
| **`F1-R06`** | **right, 4 of 4** | **wrong** |

**Every fixture is better except F1, and F1 is the one BUG-030 spent three iterations on.**
Whether that trade is acceptable, or whether this should be reverted until `F1-R06` can be
recovered as well, is a product judgement about which answer key item matters more — and it is
Vaibhav's, not mine. The revert is one command and both states are measured.

### Left standing: a prediction of mine that was wrong

The test plan said T4 would land at **100 / 85.7** once the kinds were right, on the reasoning
that one false positive remained. Iteration 2 produced **100 / 66.7**: fixing the kinds made
the extractor keep *more*, not the same, and precision fell rather than holding. The final
figure is 85.7 — the number predicted, reached by a different route than the one predicted.


## The control, run 2026-09-03 once the balance was restored (TC13)

The shipped state was confirmed at **n=3** first, because the trade had been reported off a
single run and a single run of a judgement is an anecdote:

| `7f9c3916173e` | run 1 | run 2 | run 3 |
|---|---|---|---|
| C1 | PASS | PASS | PASS |
| T4 | 100 / 85.7 | 100 / 85.7 | 100 / 85.7 |
| T1 · T3 · N1 · E1 | 93.3 · 100 · 100 · 100 | same | same |
| `F1-R06` | wrong | wrong | wrong |

Then the prompt was reverted to `dd2ce8269321` **in the same session, against the same
provider, within the hour**, and all six C1 fixtures re-produced:

| | shipped `7f9c3916173e` | control `dd2ce8269321` |
|---|---|---|
| **T4** | 100 / 85.7, pass, 3 of 3 | **66.7 / 50.0, FAIL** — `T4-R03` wrong again |
| **`F1-R06`** | wrong, 3 of 3 | **correct** |
| T1 · T3 · N1 · E1 | 93.3 · 100 · 100 · 100 | 93.3 · 100 · 100 · 100 |

**Both effects reverse together.** The ordering is what fixed T4 and it is what cost
`F1-R06` — one edit, two consequences, and neither is drift, provider noise or the day. The
prompt was restored afterwards and the hash re-checked: `7f9c3916173e`.

This is what the card was missing. The choice on it is now a genuine either/or between two
causally-understood states, not a wait for one more run to break the tie.


---

## Closed 2026-09-03 — Option A, decided by Vaibhav: `7f9c3916173e` ships

The trade was accepted with the control in hand: **C1 PASS 3 of 3, T4 at 100 / 85.7 three
times, T3/N1/E1 at 100%, T1 at 93.3/100 — and `F1-R06` wrong, knowingly.** The reopened half
moved to BUG-035 for its own three iterations and did not survive them; what remains of it is
**BUG-037**, filed with all four measured prompt states so nobody re-tries a wording by
accident. Every item this card was filed about — `T4-R03`, `T4-R05`, `T3-R04`, and the
coverage hole that hid them — is fixed and verified.
