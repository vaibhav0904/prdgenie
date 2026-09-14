# BUG-007: An unsettled argument has nowhere to go, so it becomes a requirement

> **CLOSED 2026-09-02.** T3 reaches **100% precision and 100% recall in 3 runs of 3** — the
> first clean fixture in this project's history on both numbers at once. Both sides of
> `T3-Q01` are filed as grounded unsettled positions every run, and neither ships as a
> requirement. Three of the four predictions below held; the fourth (BUG-023's deadline) did
> not, and BUG-023 stays open as its card said it must. Full account at the bottom.

**Found while:** E2-S2, C1's first honest runs
**Severity:** major — it is the failure pattern that holds C1 below threshold, and it is
the one C1 was built to name
**Filed under PRD-E2's rule:** three prompt iterations were spent, then stopped. This card
names the *pattern*, not the score.

## The observation

Three consecutive runs at the identical prompt version (`7267c39b005e`), on the identical
input:

| Fixture | Recall | Precision | | |
|---|---|---|---|---|
| T1 | 92.9% / 92.9% / 92.9% | 86.7% / 86.7% / 92.9% | threshold 0.80 / 0.75 | **passes, 3 of 3** |
| T3 | 100% / 100% / 100% | 66.7% / 66.7% / 66.7% | threshold 0.80 / 0.75 | **fails, 3 of 3** |

T3's three false positives are **the same three items every run**:

- `a prospect can create a login with an email address and be inside ForgeSight in two minutes`
- `authenticate through the customer's SAML provider and store no passwords`
- `cut the tablet view from the pilot`

Those are not random errors. They are, precisely, **both sides of T3-Q01 and the disputed
half of T3-Q03** — two of the three conflicts the fixture was written to contain. The
extractor is finding the argument correctly and filing it in the only drawer it has.

## Root cause

There is nowhere else to put it. Ambiguity detection is E3-S4; today the extraction step is
the only thing that reads the document, and its output schema has exactly one array in it.
So the prompt was made to *suppress* unsettled positions rather than *route* them — and
suppression is the wrong shape of instruction. A model asked to notice something and then
not mention it will mention it about a third of the time.

The evidence for "wrong shape" rather than "wrong wording" is iteration 2, which briefly got
T3 to 85.7% before falling back to 66.7% under a stricter rule. A guardrail that holds two
runs in three is not a guardrail; it is a coin weighted slightly in your favour.

## Why this is not fixed with a fourth prompt iteration

PRD-E2 caps iteration at three, and the cap earned its keep here: iterations 1 and 2 moved
T1 from 64.3% to 92.9% by fixing real prompt defects, and iteration 3 fixed a
self-contradiction the earlier ones introduced. A fourth would be aimed at making the model
guess which side of an argument the answer key omitted — which is tuning against the labels
with extra steps.

## Fix — E3-S4, and C1 is re-run after it

Give the disputed positions a destination. `detect-ambiguity` (E3-S4) emits OpenQuestions of
kind `conflict` with citations to **both** sides. Once a conflict has somewhere to go, the
extractor's rule stops being "notice this and stay silent" and becomes "this belongs to the
other step", which is a shape models follow reliably.

**Prediction, recorded now so it can be wrong:** with E3-S4 in place, T3's three false
positives become three detected conflicts, T3's precision goes to 100%, and C4 finds at
least two of three. If T3's precision does *not* move after E3-S4, this diagnosis was wrong
and the card is reopened rather than quietly closed.

C1's `Re-run when:` list is amended to include the ambiguity prompt for exactly this reason.

## A second, smaller pattern, named but not fixed

T1's one persistent false positive, in all three runs, is:

> `The largest customer account is Northwind with forty-one million rows in the events table.`

That is a statement of fact — the *reason* for the two-second requirement, not a requirement.
Three prompt versions have told the model that facts are not requirements, including a
worked contrast pair, and it still emits this one. It sits inside the precision threshold so
it does not block anything, and it is recorded here so that "T1 passes" is not read as "T1
is clean".

## Lesson

**A rule that tells a model to notice something and then say nothing about it is a rule
with no home.** The reliable fix for "it reports things it shouldn't" was not stronger
prohibition — it was building the place those things belong. Suppression is what you write
when the architecture is missing a box.

The eval is what made this legible: a stable 66.7% failing on the same three named items,
three runs running, is a diagnosis. One run at 85.7% would have looked like progress.

---

## Amendment, 2026-09-02: one of the three was our mistake, not the model's

Vaibhav's label review (E1-S3 Part 2) withdrew **T3-Q03**. He reads the tablet exchange as a
decision taken over a registered dissent — Wei says *"I'm okay with you deciding it"*,
Marcus closes with *"Let's call it cut for now"* — not as an argument left open. It is now
the constraint **T3-R07**.

That reclassifies the third false positive. `cut the tablet view from the pilot` was **not**
the extractor filing an argument in the wrong drawer. It was the extractor reporting a scope
decision correctly, and being scored as inventing it.

The card's headline claim narrows accordingly:

| | Before | After |
|---|---|---|
| False positives on T3 | 3 | **2** |
| …that are genuinely unsettled arguments | 3 | **2** — both sides of T3-Q01, the auth conflict |
| …that were labelling errors | 0 | **1** |
| T3 precision | 66.7%, 4 runs of 4 | **77.8%** — above the 0.75 floor |

**C1 now passes.** That does not close this bug, and the distinction matters:

- The two survivors are still both sides of *one* genuinely unsettled argument — Tom wants
  self-serve email login, Priya holds that auth is SAML-only, and the room ends with *"I'm
  not settling that in this meeting."* Both are emitted as requirements. The root cause
  above is unchanged and **E3-S4 is still the fix**.
- So C1 is green **while still containing the defect it was built to name.** A threshold met
  is not a defect absent. Anyone reading a passing C1 as "conflicts are handled" is reading
  it wrong, and this line exists so that is on the record.

## Second lesson

**Before tuning against a number, check the number is measuring what you think.** Three
prompt iterations were spent trying to suppress a behaviour that was, in one case out of
three, correct — and the labels said it was wrong. The card's own diagnosis, *"the extractor
is finding the argument correctly and filing it in the only drawer it has"*, was right about
the mechanism and wrong about the count, because it trusted the answer key without a human
having read it against the transcript.

The review that caught it took ten minutes and could have been run before any of the three
iterations. **A label review is cheaper than a tuning cycle and strictly more informative.**

## Third data point — BUG-018's narrowed clause did not fix this, 2026-09-02

BUG-018 replaced the exclusion bullet's **tone** test (*"for now"*, *"we'll come back to
it"*) with a **decision** test: *is there a decision in the document — did someone with the
authority settle it, or explicitly defer it?* That wording describes `T3-Q01` exactly. Marcus
says he is not settling it in this meeting and tells both of them to write it up. The clause
now names that case in the words the transcript uses.

**Both sides are still extracted as requirements, in 3 runs of 3, at prompt `47ac49c6330b`:**

| | run 11 | run 12 | run 13 |
|---|---|---|---|
| *"a prospect to be able to create a login with an email address…"* | FP | FP | FP |
| *"We authenticate through the customer's SAML provider and we store no passwords"* | FP | FP | FP |
| T3 precision | 75.0% | 77.8% | 77.8% |

**What that rules out.** It is not that the instruction was unclear about what counts as
unsettled — the clause is now explicit, uses the document's own structure rather than its
tone, and the model still emits both sides. **A fourth wording will not fix this**, which is
the same wall BUG-004 hit at three iterations before the structural change worked.

**What it confirms.** The root cause on this card stands unchanged: the extractor finds the
argument and **files it in the only drawer it has.** Told not to use that drawer, it uses it
anyway about two-thirds of the time, because the alternative is discarding something it
correctly identified as important. **E3-S4 is the fix** — not a better prohibition, but an
`open_questions` array to put it in. That is BUG-007's original diagnosis, BUG-004's proven
lesson, and now a third measurement agreeing with both.

**Do not spend another prompt iteration on this card.** Three have been spent, plus one
clause rewrite. The next change here is E3-S4 or nothing.

## E3-S4 was built, and it did NOT close this card — 2026-09-02

This is the important entry on this card, because three cards had concluded E3-S4 was the
fix and all three were wrong about *why*.

**What was built.** A gap detector: its own prompt, its own model call, `open_questions`
rows, three kinds, code-owned grounding. On T3 it works — it files the SAML/self-serve
argument as a **`conflict`**, grounded, with nine exact citations including Marcus's *"I'm
not settling that in this meeting."* The drawer exists and the detector uses it correctly.

**And both sides are still extracted as requirements, in 3 runs of 3.**

| | run 15 | run 16 | run 17 |
|---|---|---|---|
| `T3-Q01` filed as a conflict by the detector | yes | yes | yes |
| *"a prospect to be able to create a login…"* still a requirement | yes | yes | yes |
| *"We authenticate through the customer's SAML provider…"* still a requirement | yes | yes | yes |

**Why the reasoning was wrong.** The diagnosis on this card — *"the extractor is finding the
argument correctly and filing it in the only drawer it has"* — is right. The inference drawn
from it was not. **The second drawer was built in a different component.**

Extraction and detection are two separate calls to the model. The extractor runs first, sees
only its own schema, and still has exactly one output type. Nothing about adding a later
stage changes what the earlier stage can emit. *"Give it a destination"* was applied to the
pipeline, and the model that needed the destination never saw it.

**What would actually close this card**, and neither is small:

1. **One call, two outputs.** The extractor's schema gains `open_questions`, so the model
   choosing between "requirement" and "unsettled argument" makes that choice **once, with
   both boxes in front of it**. This is the true form of BUG-004's fix — there, the
   destination (`document_subject`) was added to the *same* call that had to act on it.
   Cost: one prompt doing two jobs, and C1 and C4 then move together.
2. **A reconciliation pass in code**, dropping any requirement whose citations overlap a
   detected conflict's citations. Cheap, mechanical, and needs no model change — but it
   silently deletes a requirement on the strength of a second model's opinion, which is a
   worse trade than it first looks.

**Do not spend another prompt iteration here.** Four have now been spent across three cards.
The next change is architectural, and it needs deciding rather than trying.

---

## Decided — 2026-09-02: Option 1, in its smallest honest form

**Option 1, and not Option 2.** The reconciliation pass drops a requirement the extractor was
confident about, on the strength of a *second* model's opinion, with no human in between —
and it would do so silently, in the one place this project has been most careful never to be
silent. It is cheaper and it is the wrong trade.

But Option 1 as the card describes it — the extractor's schema gains a full `open_questions`
array — buys a second author for open questions. The detector already writes them well, owns
the three kinds and the closed NFR checklist, and on T3 produces a genuinely good question
with nine citations. Two authors means duplicates, and duplicates mean a dedupe rule nobody
asked for.

**So: one call, two boxes — where the second box holds a position, not a question.** The
extractor gains `unsettled_positions`, each carrying the subject, the position, who held it
and at least one quote. The model still makes the choice **once, with both destinations in
front of it**, which is the entire mechanism BUG-004 proved. Code moves them out of the
requirement list. The detector, unchanged, still writes the question.

This is the smallest change that puts the destination in the call that has to use it.

**Why it should work when four wordings did not.** Every previous attempt asked the model to
*notice something and say nothing about it*, and this card's own diagnosis says why that
fails: the extractor found the argument, correctly judged it important, and had one drawer.
The instruction now reads *put it here* rather than *do not mention it*. That is the shape
that worked for BUG-004 (`document_subject`) and for BUG-016's promoted examples, and the
shape that has failed five times is not being tried again.

### Predictions, recorded before the run, each able to fail on its own

1. **T3 precision reaches 100% in 3 of 3.** Both sides of `T3-Q01` leave the requirement
   list. This is the card's own claim and the reason it exists.
2. **T3 recall stays 100% in 3 of 3.** `T3-R07` — the tablet cut, a decision taken over a
   registered dissent — **must not** be swept into the new box. This is the failure mode the
   change introduces, and it is the one worth watching: a model handed a new drawer tends to
   fill it.
3. **T1 is unharmed:** recall ≥ 86.7%, precision 100%.
4. **Separately, and it may fail alone: `T1-R05` returns in at least 2 of 3** — BUG-023's
   hypothesis, that a passage whose argument now has somewhere to go is no longer a passage
   the model has finished with. **If 1–3 hold and 4 fails, this card closes and BUG-023 stays
   open**, exactly as BUG-023's own card says it must.

If prediction 1 fails, the diagnosis on this card is wrong after four measurements agreeing
with it, and it is reopened rather than reworded.

---

## Closed — 2026-09-02, prompt `76f2c985b27f` plus one code rule

### The destination worked, and it did not go far enough on its own

Given `unsettled_positions`, the model files **both sides of `T3-Q01`, grounded, correctly
attributed, in 3 runs of 3** — the judgement four wordings of the prohibition never produced.
And in the same responses it left **one or both of those same positions in `requirements`**
as well:

| Prompt `76f2c985b27f`, no reconciliation | run 30 | run 31 | run 32 |
|---|---|---|---|
| Unsettled positions filed on T3 | 2 | 2 | 2 |
| …still also in `requirements` | 1 | 1 | 2 |
| T3 precision | 87.5% | 87.5% | 77.8% |

**So the destination fixed the hard half and not the easy one.** The model can recognise the
argument; asked to then say nothing about it, it behaves exactly as this project has now
measured six times.

### The rule that finished it, and why it is not the option this card rejected

Code reconciles the extractor's **two outputs against each other**: a requirement whose
citation span overlaps an unsettled position's is withdrawn, and its statement is attached to
that position rather than deleted.

**Option 2, which this card rejected, dropped a requirement because a *second model* — the
gap detector, a separate call — had called it contested.** That is one opinion deleting
another's work. This is a **single response contradicting itself**: the same call, in the
same JSON, said this sentence is an unsettled position and shipped it as agreed. Code
resolving that in favour of the model's own explicit judgement is the `concerns_product` gate
exactly (BUG-004): the judgement wins, the list gives way.

### Measured, three runs, prompt `76f2c985b27f` + reconciliation

| | before (`b9d627e994f8`) | **now** |
|---|---|---|
| **T3 precision** | 77.8 ×3 | **100.0 ×3** |
| **T3 recall** | 100.0 ×3 | **100.0 ×3** |
| T3 false positives | 2 ×3 | **0 ×3** |
| T1 recall | 86.7 ×3 | 93.3 / 86.7 / 86.7 |
| T1 precision | 100.0 ×3 | 100.0 ×3 |
| Unsettled positions filed | — | T3 **2 / 2 / 2**, all grounded |
| Requirements withdrawn by code | — | 1 / 1 / 1, all Tom's side on T3 |
| C1 / C2 | pass | **pass ×3** |

**`T3-R07` stayed a requirement in all three runs.** That is prediction 2, and it was the one
worth watching: the tablet cut is a decision taken over a registered dissent, it looks exactly
like an argument, and a model handed a new drawer tends to fill it. It was not filled with
this.

### The four predictions

| # | Prediction | Outcome |
|---|---|---|
| 1 | T3 precision 100%, 3 of 3 | **held** — after the reconciliation rule; **not** on the prompt change alone, and that distinction is the finding |
| 2 | T3 recall stays 100%, `T3-R07` untouched | **held**, 3 of 3 |
| 3 | T1 unharmed | **held** — recall 86.7% or better, precision 100% ×3 |
| 4 | `T1-R05` returns in ≥2 of 3 (BUG-023) | **failed** — 1 of 3, the same rate as before. **BUG-023 stays open**, exactly as its card requires |

Prediction 4 failing alone is the outcome both cards were written to allow. The deadline is
not recovered by giving the argument a destination, so BUG-023's remaining hypothesis is
narrower than it was, and it is recorded there rather than quietly folded in here.

### One defect filed, not folded in

**BUG-024** — on T1, in 1 run of 3, the new box also collected both sides of the
streaming-versus-hourly exchange, **which the room settled**. It cost no requirement and no
label, and nothing currently measures the contents of that box, which is the point of the
card. **Not to be tuned until C4 exists**, for the same reason BUG-020 waits.

### What is now true that was not

Three cards concluded that a destination would fix this, and each was right about the
mechanism. What none of them said is the part worth keeping:

**A destination makes the model produce the right judgement. It does not make the model
withdraw the wrong one — code has to do that, and it can, because both halves came from the
same response.**
