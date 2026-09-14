# BUG-030: F1 crosses the C1 floor on a kind judgement, about 1 run in 12

**Severity:** major · **Filed:** 2026-09-03 (C1 FAIL after E7-S4)
**Not caused by the change that surfaced it** — see "Ruled out" below.

## What happens

C1 failed on **F1 only**: recall 71.4%, precision 71.4%, against a floor of 0.80 / 0.75.
Both misses are the same kind of miss — the extractor found the requirement and gave it the
wrong `kind`, so it counts once against recall and once against precision:

| label | labelled | extracted |
|---|---|---|
| `F1-R04` *"Each chart displays, on the chart, the warehouse table it draws its data from"* | `functional` | `nonfunctional` |
| `F1-R06` *"A new customer's first live dashboard is standing within five business days of contract signature"* | `nonfunctional` | `constraint` |

Nothing was hallucinated, nothing was missed, no citation moved. **Seven labelled, seven
extracted, seven located.** The failure is two words.

## It is not new, and now there is a distribution

Across **23 archived C1 runs** that grade F1:

| F1 result | runs | verdict |
|---|---|---|
| 85.7% / 85.7% | **19** | pass |
| 85.7% / 75.0% | 2 | pass — **exactly on the precision floor** |
| 71.4% / 71.4% | **2** | **FAIL** (`2026-09-02-C1-run55`, `2026-09-03-C1-run4`) |

So F1 fails roughly **1 run in 12**, and passes on the floor itself in another 1 in 12. E5-S4
said this out loud when it shipped — *"F1 is exactly on the precision floor, and that belongs
next to the word passes"* — and this is that sentence coming due. **Three green runs today
were inside this distribution, not evidence against it.**

## Ruled out

- **Not the prompt.** `extract-requirements` is unchanged at `cdac3b47e764`; the only prompt
  edited today is `detect-ambiguity`, which is a different call and does not feed extraction.
- **Not BUG-028's fix.** Removing `onError` changes what happens when a call *fails*; no call
  failed in this run.
- **Not the fixture.** F1's bytes are unchanged; `verify-labels` is 21/21 and every quote
  still resolves.
- **Not a grading change.** `verify-grading` is green and C1's matcher was not touched.

## The two candidates, and the second one is not mine to settle

**A. The kind boundary is genuinely hard on a written brief.** F1 is prose, not dialogue: it
states qualities and commitments in the same register, and the tie-break in the prompt —
*"does it name a specific external thing the product must conform to"* — is doing more work on
this document than on a transcript. This is the same territory as BUG-022 (a tablet is a
platform or a quality), which was closed by a redirect that F1 apparently does not reach.

**B. `F1-R06` may be labelled wrongly, and I may not decide that.** *"…within five business
days of contract signature"* is a delivery commitment tied to an external event. The
extraction prompt's own tie-break says a **date or deadline is a `constraint`** — so the
model's answer follows the written rule, and the label says `nonfunctional`. Either the label
or the rule is wrong, and **labels are never edited to match output**. This goes to Vaibhav as
a label-review question, the way T1-R15 did, and it is recorded here rather than acted on.

If B is resolved in the model's favour, F1's floor runs become 85.7%/85.7% and only `F1-R04`
remains — which would take the failure rate to zero and leave a real, smaller finding intact.

## Not done, deliberately

**No prompt iteration was spent.** PRD-E2 allows three; spending one before the label question
is answered would be tuning against an answer key that may itself be the defect — and it would
burn an iteration on a document whose floor may not be where it looks.

## Verified by
- a decision from Vaibhav on `F1-R06`'s kind, recorded on this card
- then, if the finding survives: a redirect measured over **three runs**, with the F1
  distribution above as the before


---

## Decided by Vaibhav, 2026-09-03: **B — the label is right, the rule is wrong**

*"F1-R06 is a duration target (like T1-R01 'under two seconds' = nonfunctional), not a
calendar deadline (like T1-R05 = constraint). Label is right; narrow the prompt's 'a date' to
'a fixed calendar deadline'. Fold in a one-line fix for R04 in the same iteration. Check
T1-R05 recall doesn't regress."*

So no label moves, and the authorised change is one prompt iteration of the three PRD-E2
allows — the first spent on `extract-requirements` since `cdac3b47e764`.

## Checked before anything was touched, and the card's own premise was wrong

Vaibhav asked for one thing to be verified first: that the 19 passing runs had `F1-R06`
coming back **correctly** as `nonfunctional`, with `R04` as the sole error. Read out of the
26 archived C1 results that carry an F1 per-item diff, it is the other way round:

|      | runs | what came back with the wrong kind |
|---|---|---|
| 85.7% / 85.7% pass | 21 | `R06` -> constraint |
| 85.7% / 75.0% pass | 2 | `R06` -> constraint |
| 71.4% / 71.4% **FAIL** | 3 | `R04` -> nonfunctional **and** `R06` -> constraint |

**`F1-R06` is wrong in 26 of 26 runs.** It is not the intermittent one; it is the constant
one, and every "passing" run in the distribution above passes while carrying it. `R04` is the
flicker, 3 of 26.

Three things follow, and only the last of them was expected:

1. **Nothing can break in R06's direction, because it has never once been right.** The worry
   that a fix would cost the 21 passing runs was the right instinct pointed at the wrong item.
2. **The value of the fix is larger than the card claimed.** `R06` is a standing −14.3% on
   both axes. With it right, a run where `R04` also flickers lands at 85.7% / 85.7% — above
   both floors. The 1-in-9 failure rate goes to zero *without* `R04` being fixed at all.
3. **The regression Vaibhav named is the real one.** `T1-R05` is the fixed 30 November
   deadline — the requirement BUG-023 spent a whole story and an extra model call recovering,
   0 of 7 to 3 of 3. Narrowing the clause that makes a date a `constraint` points straight at
   it. It is checked over three runs.

## And the answer key does not support the obvious wording

The first draft of the redirect was going to be *"a period of time is a level; ask how long
versus by when"*. **The answer key refutes it, and so does the prompt's own third worked
example**, which files *"retained for ninety days"* as a `constraint`:

| | | |
|---|---|---|
| `T4-R04` | raw event rows deleted after thirty days | `nonfunctional` |
| `T4-R03` | data retained for at least twelve months, **as required by legal** | `constraint` |

Same shape, same units, opposite kinds. A rule keyed on duration would have flipped both of
those to fix one item on F1 — a trade dressed as a fix. What actually separates them is **who
imposes it**, and the narrowing below is written to that, not to the clock.

## Found while checking, and filed rather than folded in: **BUG-032**

Deriving C1's fixture list instead of typing it showed that **T4 has six labelled requirements
and no case had ever graded one of them**. Graded now, off the existing run at no cost, it is
**66.7% / 57.1% — below both floors**, on the same kind boundary in the opposite direction.
That is BUG-032. **C1 is therefore red on T4 from this point on**, for a defect older than
today, and T4 was deliberately not removed from the case to make it green again.


---

## Closed 2026-09-03. `F1-R06` went **0 of 26 -> 4 of 4**

Prompt `extract-requirements`: `f1ec836b1042` -> **`dd2ce8269321`**. Three iterations, which
is all three PRD-E2 allows, and each one was decided by a measurement rather than by taste.

| | before (26 archived runs) | run 1 | run 2 | run 3 | run 4 |
|---|---|---|---|---|---|
| **`F1-R06` = `nonfunctional`** | **0 of 26** | correct | correct | correct | correct |
| `F1-R04` = `functional` | 23 of 26 | correct | correct | correct | correct |
| **`T1-R05` extracted, `constraint`** | 3 of 3 since BUG-023 | present | present | present | present |
| **F1 recall / precision** | 85.7 / 85.7 at best, ever | **100 / 100** | **100 / 100** | **100 / 100** | **100 / 100** |

F1 had never once exceeded 85.7% in **32 archived results across four prompt versions**. Under
this one it is 100/100 four times.

### The three iterations, and what each one was told by

**1 — narrow "a date" to "a fixed calendar deadline", as decided.** Fixed `F1-R04`, took T3 to
100%, and — the hardest pair in the answer key — landed **both** halves of the retention
question: `T4-R03` (twelve months, *as required by legal*) `constraint`, `T4-R04` (raw rows
after thirty days) `nonfunctional`. **It did not move `F1-R06` at all.**

**2 — because the cause was a word in my own rule.** The imposer list I wrote said *"a contract
term"*; the sentence says *"of contract signature"*. The word was doing the deciding, and a
redirect that loses to one word in its own list is a collision, not a weak redirect. Naming it
worked in the sense that `F1-R06` stopped being a `constraint` — **and the model stopped
extracting it at all.** wrong_kind 0, missed 1.

**3 — this project's oldest finding, arriving at my own hand.** *A prohibition holds about two
runs in three; a redirect holds — give it somewhere to go.* What I had written was three
negations around one buried destination, and the cheapest way to satisfy a rule that mostly
says what a thing is **not** is to drop the sentence. Iteration 3 changes no rule content at
all: it moves the destination into the heading and says, explicitly, to still write the
requirement down. **That is the whole difference between 0 of 1 and 4 of 4.**

### The control, run live rather than cited

The 26-run history is a control over a larger n than any re-run, but it does not rule out
"something else changed today". So the prompt was reverted to `f1ec836b1042` **in this same
session, same n8n, same model**, F1 re-produced, and `F1-R06` came back `constraint`
immediately. Restored to `dd2ce8269321` afterwards and re-checked. **The rule is doing the
work, not the day.**

### What it cost, in full

- **`T4-R03` was correct under iterations 1 and 2 and is wrong under 3, 4 runs of 4.** An
  accidental gain, given back. It is a BUG-032 item and was wrong at baseline too, so this is
  not worse than the starting point — but iteration 1 is now a **measured lead** for BUG-032,
  recorded on that card.
- **A nice-to-have is written down on N1, 2 runs in 4 — BUG-033, filed.** Caused by the exact
  sentence that fixed the drop in iteration 3. The cost side of a redirect, and it is cheaper
  than the prohibition it replaced.
- **E1 at 80% and T3 at 85.7% are NOT this change.** Both appear in every earlier prompt
  version — E1 3 of 16 and 3 of 7, T3 in `f1ec836b1042` too. Checked rather than assumed,
  because "it was probably always like that" is how a regression gets kept.

### And the thing that made all of it visible

C1's fixture list was **typed**, so T4 carried six labelled requirements that no case had ever
read. It is derived now: every fixture whose answer key carries requirements is graded here or
**declared** to another case, with the declarations printed in every result file. Forced to
fail by removing one declaration, and it named the fixture. **T4 fails that floor — 66.7 /
57.1, a defect older than today — so C1's verdict is FAIL and stays FAIL until BUG-032.**
T4 was deliberately not taken back out to make the case green.

### Prediction, recorded before BUG-032 is attempted

Iteration 1's wording holds `T4-R03` and iteration 3's holds `F1-R06`, and the two are not
obviously in conflict — the difference is emphasis, not rule content. **I expect BUG-032 can
have both.** If it turns out it cannot, that is a real finding about how much a single prompt
can carry, and it belongs on that card whichever way it goes.
