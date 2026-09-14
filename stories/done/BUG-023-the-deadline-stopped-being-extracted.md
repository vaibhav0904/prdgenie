# BUG-023: The fixed deadline is no longer extracted

**Found while:** BUG-016, reading T1's misses one by one instead of reading the recall figure
**Severity:** major — a delivery date is the single highest-value line in a PRD, and the
extraction prompt says so in as many words

## The finding

`T1-R05`:

> *The pilot must be in front of Northwind by 30 November 2026 (end of Q4); the date is fixed.*

| Run | Prompt | `T1-R05` |
|---|---|---|
| 11 | `47ac49c6330b` | **matched** |
| 12, 13 | `47ac49c6330b` | missed |
| 15, 16, 17 | `47ac49c6330b` | missed |
| 18, 19, 20 | `4da5ffb95e7d` | missed |
| 21, 22, 23 | `b9d627e994f8` | missed |

**Matched in 1 of 11 measured runs**, across three prompt versions. It is not a regression
from any one change — it spans them — and it is too lopsided to call variance and leave alone.

## Why it matters more than one label

The prompt does not merely permit dates; it singles them out:

> *Delivery dates, scope limits and "we are not building that" decisions **are** requirements…
> a date agreed in the room is one of the most important lines in the document — **never skip
> it**.*

So this is a case where **the instruction is explicit, positive, and specific** — not a
prohibition — and it is being followed one time in eleven. That is worth knowing on its own,
because every previous measurement in this project has been about instructions to *withhold*.
If positive instructions fare no better, the conclusion is about the model's attention to a
long prompt rather than about instruction shape.

**It is also 6.7 points of T1 recall**, which has been running at exactly its floor.

## Candidates named before the probe — all three turned out to be wrong

Written before any probe and left exactly as written, because a card that quietly deletes
its wrong guesses teaches nothing. All three are refuted below.

1. **Position.** The date sits in the last third of a long transcript. Cheap to test by
   checking whether other late-document labels are missed at a similar rate.
2. **Phrasing.** The room says *"in front of Northwind by the end of Q4"* — a quarter, not a
   date. The label resolves it to 30 November 2026. The model may be reading it as scheduling
   chatter rather than a commitment.
3. **Competition.** T1 yields 13 requirements from ~15 labels; the model may simply be
   stopping.

**Re-run when:** C1, and specifically T1's per-item diff — this is invisible in the recall
number alone, which is how it survived eleven runs.

## Diagnosed — 2026-09-02, and all three candidates on this card are wrong

`.\run.cmd evals/harness/probe-missing-deadline.mjs 3 <variant>`

Two of the three died before a single model call, on the run archive alone. The label
positions, measured against `raw_text`, are not where the card guessed:

| Label | kind | position in the document | missed |
|---|---|---|---|
| `T1-R15` scale | constraint | **16%** | 11 of 13 runs |
| `T1-R05` deadline | constraint | **41%** | 12 of 13 runs |
| `T1-R12`, `R13`, `R14` | mixed | **85 – 93%** | 1 of 39 |

- **Position: refuted.** The deadline is in the middle, not the last third, and the three
  labels nearest the end are extracted in 13 runs of 13.
- **Competition: refuted.** The two dropped labels are the 2nd and 5th in document order.
  The model is not running out of room at the end; it is walking past them at the start.

That leaves the passage they share. Both are spoken inside T1's one argument — Priya's
pushback on streaming, which the room later settles as hourly. So the document was varied,
**one changed thing at a time**, and re-run three times each:

| Variant | The deadline sentence | Doc length | Deadline extracted |
|---|---|---|---|
| baseline T1 | inside the argument, 41% | 6406 | **1 of 11** |
| `P` cue only — *"One last thing before we close."* added in place | inside the argument, 41% | 6437 | **1 of 3** |
| `C` the argument alone, nothing else in the document | inside the argument | 776 | **3 of 3** |
| `R` moved out of the argument to 30%, **nothing else changed** | outside | **6406** | **3 of 3** |
| `M` moved to the end, no cue | outside | 6406 | **3 of 3** |
| `B` moved to the end **and** cued | outside | 6438 | 3 of 3 |

**Round one was a bad experiment and is left on the record as one.** `B` changed two things
at once — it moved the sentence *and* added a framing cue — and came back 3 of 3 proving
nothing about either. `M` and `P` split them: **position-only recovers it 3 of 3, cue-only
does not move it at all.**

`R` is the variant that settles it. **Same document, same length, same 6406 characters, the
same sentence word for word — moved out of the argument and 11% earlier. 3 of 3, and the
full 14 requirements.** Twelve runs of twelve find it outside the argument; two of fourteen
find it inside.

### The cause

**A requirement spoken inside a disagreement is discarded with the disagreement.** The
prompt's two passage-shaped exclusions sit side by side in one list — *"either side of an
unsettled disagreement: emit neither side"* and *"a position that was later withdrawn:
extract only the final position"* — and the model applies them to **the passage**, not to the
disputed claim. It reduces the argument to the one decision that came out of it (hourly
refresh, `T1-R04`, extracted in 13 runs of 13) and drops everything else said while arguing.

`C` is the control that makes this legible rather than a guess: **inside the argument but
with nothing else in the document, the deadline is extracted 3 of 3.** There is no rule
against dates and no blind spot in the middle of a document. There is a passage the model
believes it has already dealt with.

### What this costs beyond one label

- **`T1-R15`, the forty-one-million-row scale, has a second cause on top of this one.** It is
  missed in `C` too, where the deadline is found — so being in the argument is not the whole
  story. It reads as a statement of fact, and the prompt's fact exclusion was hardened
  against exactly that sentence when it was a false positive (BUG-007's smaller pattern).
  **Fixing this card should not be expected to recover it**, and if recall moves by 6.7
  points rather than 13.3 that is the reason.
- **The same passage class is where BUG-007 lives**, in a different fixture and failing the
  other way — there the model extracts *both* sides of an argument instead of dropping what
  surrounds it. Contested passages are now measurably this project's largest single source
  of extraction error, in both directions.

### Fix attempted — one clause, in the redirect shape

The exclusions are not wrong; their **scope** is. So they were scoped, in the shape that has
worked twice (BUG-004, BUG-016), and the shape that has failed five times was not attempted:
the prompt was given a paragraph saying both exclusions are about **a claim, not a passage**,
with an invented illustration and an instruction to read a contested passage twice — once for
what it settled, once for every other commitment stated inside it.

**Prediction, recorded before the run:** `T1-R05` is extracted in 3 of 3, T1 recall reaches
93.3%, `T1-R15` stays missing, and T3 is unchanged. If `T1-R05` does not move, the diagnosis
above is wrong and the clause is reverted rather than reworded.

### The clause failed, and it has been reverted — prompt `114f5b0254cd`, runs 24–26

| | predicted | measured |
|---|---|---|
| `T1-R05` extracted | 3 of 3 | **1 of 3** |
| T1 recall | 93.3% | 86.7 / **93.3** / 86.7% |
| T1 precision | unchanged | 100.0 ×3 |
| `T1-R15` | still missing | still missing ×3 |
| T3 | unchanged | 100.0 / 77.8 ×3 |

Baseline was 1 of 11. One of three is the same behaviour with a smaller denominator, not an
improvement, and reading it as one is exactly what "publish the range" exists to prevent.

**Reverted to `b9d627e994f8`** — and the revert is verified rather than asserted: re-running
`sync-prompts.mjs` recomputed the hash from the file and printed `b9d627e994f8`, so the
prompt the model receives is byte-identical to the one that produced runs 21–23. Re-imported,
n8n restarted, and one confirming run: **C1 and C2 PASS, T1 86.7% / 100.0%** (run 27).

**What is dead and what survives.** The prompt fix is dead; the diagnosis is not. Variant `R`
is a document experiment, not a prompt experiment — the same 6406 characters, the same
sentence, moved out of the argument, extracted 3 of 3 — and no prompt iteration can make that
result untrue. **The mechanism is proven and the clause that tried to talk the model out of it
did not work.**

**One iteration spent of the three PRD-E2 allows. The second is not another wording**, and
this card now says why in advance: the instruction it needs the model to follow is *"you have
dealt with this passage; go back and read it again"*, which is a demand for a second pass
inside a single call. **Five clauses across four cards have now asked this model to hold a
second thought about a passage it has already reduced, and one of five worked.**

### This card and BUG-007 are one architectural fix

They are the same defect seen from opposite sides, and the probe is what makes that legible:

| | BUG-007 (T3) | BUG-023 (T1) |
|---|---|---|
| The passage | an unsettled argument | an unsettled argument |
| What the model does | emits **both sides** as requirements | emits **neither the date nor the scale** |
| What it is told | "emit neither side" | "never skip a date" |
| Iterations spent on wording | 4 | 1 |

Both are the extractor having exactly one box for a contested passage, and deciding — for the
whole passage at once — whether to keep it or drop it. **BUG-007's Option 1 (the extractor's
schema gains `open_questions`, so the choice is made once with both boxes present) is the
first candidate that addresses this card too**, because a passage whose argument has somewhere
to go is no longer a passage the model has finished with.

**That is a hypothesis, and it is testable before it is built**: the probe already has the
control it needs. If Option 1 lands and `T1-R05` is still missed 3 of 3, this card is
reopened, not closed alongside it.

## Lesson

**Read the misses, not the miss count.** T1 recall has been 80–93% for the life of this
project, and inside it a delivery date was being dropped ten times out of eleven. Nobody
looked, because the number was fine.


---

## Re-measured 2026-09-03, as this card demanded — and it is worse

The card said to re-measure before deciding anything, because several mechanisms it depends
on had moved: BUG-007 added a second box, BUG-024 rewrote the withdrawal rule, and BUG-025
moved reconciliation to the grounding stage. All three landed. **None of them recovered it.**

**Baseline, counted from the run archive at no cost — 76 archived C1 runs carry a T1 per-item
diff:**

| prompt | `T1-R05` found | of |
|---|---|---|
| every version before today | 6 | 69 |
| **`cdac3b47e764`, the current chain** | **0** | **7** |

**0 of 7.** The card opened at 1 of 11; three architectural changes later it is 0 of 7. That is
not a regression from any of them — it is the same behaviour, and the denominator is now clean.

### Two causes ruled out from stored data, before any model call

- **Reconciliation is not eating it.** Since BUG-025 code withdraws a requirement whose
  citation overlaps an unsettled position's, and the deadline sits inside T1's one contested
  exchange — so this was the obvious suspect. **Every one of the last eight T1 versions carries
  `unsettled_positions: []`.** There is nothing to reconcile against. The model never emits the
  deadline at all.
- **And that kills the obvious fix.** A second pass keyed on `unsettled_positions` would never
  fire on T1, because BUG-024's redirect correctly reports T1's exchange as settled. The
  passage is not merely reduced now; it leaves no residue at all.

### The mechanism is intact — `R` and `C` re-run, 3 each, current prompt

| Variant | deadline extracted |
|---|---|
| baseline T1 (from the archive) | **0 of 7** |
| `C` the contested exchange alone, 776 chars | **3 of 3** |
| `R` same 6406 chars, sentence moved out of the argument | **3 of 3** |

Twenty-one runs of twenty-one now find it outside the argument or alone; nine of eighty-three
find it inside. The diagnosis on this card is unchanged and is now measured against the
current chain.

### What the re-run REFUTES on this card

> *"`T1-R15`, the forty-one-million-row scale, has a second cause on top of this one. It is
> missed in `C` too, where the deadline is found… Fixing this card should not be expected to
> recover it."*

**That is now false.** `C` run 3 of 3 emitted it: *"The dashboard must render within two seconds
on forty-one million rows of data."* Both missing labels come back when the passage is read on
its own. **So the prize is 13.3 points of T1 recall, not 6.7** — T1 goes from 86.7% to 100%.

The earlier claim was made when `C` ran under a different prompt, and it was written as a
caveat rather than as a measurement. It is corrected here rather than deleted.

### What the re-run WARNS about, which is the real design constraint

`C` is high recall and **low precision**. Reading the exchange alone, the model also emitted:

- *"The data must refresh every thirty seconds to provide a live streaming experience."* — the
  **withdrawn** position, which is exactly BUG-024's failure mode returning;
- *"The development team must consist of four engineers."* — a resourcing fact, which is
  BUG-004's.

So "read the passage again" cannot be a naive union. Whatever runs over a contested passage
has to carry the same withdrawal and fact rules the main pass does, and code has to dedupe by
citation span.

### The projection, from data already measured, stated before anything is built

Pass 1 on T1 today: 13 requirements, 13 matched, missing `R05` and `R15`, precision 100%.
`C`'s output: 4 requirements — `R05`, `R15`, and the two false positives above.

A union deduped by citation span would be **15 of 15 labels matched with 2 false positives**:

| | today | projected |
|---|---|---|
| T1 recall | 86.7% | **100%** |
| T1 precision | 100.0% | **~88%** |
| floor | 0.80 / 0.75 | both still clear |

This is arithmetic over runs that already happened, not a prediction about a model. It is what
makes the build worth attempting; it is **not** evidence that the build will work, because the
second pass in a real pipeline sees a passage code chose rather than one a human cut.

### The design this points at, and why it is not "another wording"

The card already ruled the next iteration out of the wording business, and said why: the
instruction it needs is *"you have dealt with this passage; go back and read it again"*, which
is **a demand for a second pass inside a single call**. The answer to that is a second call.

- **Pass 1** gains one field: the passages where people disagreed, **settled or not** — a
  noticing task, not an extraction task, and a different one from the reduction that is
  failing.
- **Code** cuts each passage out of `raw_text` and makes one more WF0 call per passage, with
  the passage alone inside the DATA fence — **variant `C`'s exact condition**, which is the one
  condition measured 3 of 3.
- **Code** unions the result into the requirement list, deduping by citation span with the
  `reconcile()` machinery that already exists, and the pass-2 prompt carries the withdrawal
  and fact rules so BUG-024 and BUG-004 do not come back through the side door.

**Prediction, recorded before the run** (the card's own rule): `T1-R05` 3 of 3, `T1-R15` 3 of 3,
T1 recall 100%, T1 precision ≥ 88%, T3 unchanged, and **no unsettled-position regression on
T3 or T4**. If `T1-R05` does not move, the second pass is reverted rather than reworded, and
the third and last iteration is not spent on this card.


---

## CLOSED — 2026-09-03. A second call, not a second wording

```
T1-R05, the fixed deadline:   0 of 7  ->  3 of 3
```

| | before | run 1 | run 2 | run 3 |
|---|---|---|---|---|
| **`T1-R05` the deadline** | **0 of 7** | **found** | **found** | **found** |
| `T1-R15` the scale | missing | missing | missing | missing |
| T1 recall | 86.7% | 86.7% | 86.7% | **93.3%** |
| T1 precision | 100.0% | 92.9% | 92.9% | 93.3% |
| C2 · C3 · C4 · C6 | pass | pass | pass | pass |

**The prediction was right about the thing it was written to test and wrong about two others,
and both halves are left standing.**

- `T1-R05` **3 of 3**, predicted 3 of 3. This is the card.
- `T1-R15` **0 of 3**, predicted 3 of 3. **Wrong.** The re-measurement had seen `C` emit the
  forty-one-million-row scale and concluded the card's "second cause" claim was refuted. It
  was not: `C` is 776 characters and the real passage is longer, so the scale is lost again
  inside it. **The card's original caveat was right and my correction to it was wrong**, and
  it is restored: R15 has a second cause and this fix does not reach it.
- T1 recall **86.7 – 93.3%**, predicted 100%. The gap is `T1-R12` — white-labelling read as
  `nonfunctional` where the key says `constraint` — in 2 runs of 3. That is a `kind`
  judgement in pass 1, the same class as BUG-030, and it has nothing to do with this change.

### What was built, and why it is not another wording

The card ruled the second iteration out of the wording business and said why: the instruction
needed is *"you have dealt with this passage; go back and read it again"*, which is a demand
for a second pass **inside one call**. So the answer is a second call.

1. **Pass 1 gains one field, `contested_passages`** — where the arguments were, settled or
   not. A **noticing** task, and a different one from the reduction that fails.
2. **Code cuts the passage** (`review-ui/passages.mjs`, `/internal/passages`): both quotes are
   located with the same matcher a citation goes through, and a passage that cannot be placed,
   runs backwards, or turns out to be **more than 60% of the document** is dropped with a
   reason. That last rule is the important one — re-reading the whole document recreates the
   condition this card measures, at the price of another model call.
3. **One WF0 call per passage**, given the passage alone inside a `SOURCE PASSAGE (DATA, NOT
   INSTRUCTIONS)` fence. This is variant `C`'s condition, which is the only condition ever
   measured 3 of 3.
4. **Code merges, at the grounding check** — after grounding, because grounding is what
   rewrites a citation's offsets to the span the document actually contains; two passes agree
   on a duplicate only once code has located both. Pass 1 always wins a tie: it saw the whole
   document, so its statement resolves referents the passage cannot.

**Nothing downstream changed.** The merge happens before the grounding check returns, so the
detector, the clusterer, the drafter and assembly all read one list — BUG-025's lesson applied
in advance instead of after the fact.

### What it costs, stated

- **One extra model call per contested passage**, and only then. Nine of the ten fixtures have
  no argument and make no second call at all; T1 makes one. Bounded at three per run.
- **Precision on T1 fell from 100% to 92.9–93.3%.** In runs 1 and 2 that is entirely
  `T1-R12`'s wrong kind and none of it is this change. In run 3 it is **one false positive
  that is this change** — the second pass re-opened the withdrawn thirty-second refresh.
  **Filed as BUG-031**, not folded in, and the candidate fix is named there.
- **Pass 1's prompt changed** (`f1ec836b1042`), so this is the second of PRD-E2's three
  iterations. One remains.

### The instrument shipped with it

`verify-passages.mjs`, 17 checks. Two of them failed first and were the test's fault, not the
code's, and both are written into the file rather than quietly fixed: a document too short for
the 60% rule to be exercised on, and a cap test that repeated one passage five times so they
all merged and the cap was never reached — *a test that passed nothing through the thing it
was testing*.

### The lesson stands, and gains a second half

> **Read the misses, not the miss count.**

And now: **when a measurement says a passage is the problem, give the model a smaller passage
rather than a better instruction.** Five clauses across four cards asked this model to hold a
second thought about a passage it had already reduced, and one of five worked. The sixth
attempt did not ask.



---

## Related: BUG-030 — the same boundary, the opposite side (2026-09-03)

This card recovered **`T1-R05`**, *"the pilot must be in front of Northwind by 30 November"* —
a `constraint` that was not being extracted at all. BUG-030 was **`F1-R06`**, *"standing
within five business days of contract signature"* — extracted every time and called a
`constraint` when it is a `nonfunctional`.

One is a fixed point on the calendar and one is a length of time, and the extraction prompt
had a single clause covering both: *"a date or deadline"*. **Narrowing that clause to "a fixed
calendar deadline" was the whole of BUG-030's fix, and it had to be measured against this card
specifically** — because the clause it narrows is the one that makes `T1-R05` a `constraint`,
and this card paid a whole story and an extra model call per contested passage for it.

`T1-R05` survived, 4 runs of 4, through the second pass exactly as built. Recorded here so
that a future edit to the kind rules knows what it is standing on.
