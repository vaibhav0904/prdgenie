# BUG-035: a guard placed inside the step it contradicts is read as part of it

**Severity:** major · **Filed:** 2026-09-03, at the end of BUG-032's third iteration
**This is the third confirmation of the same mechanism in one day**, and the first time it has
been named on its own instead of being absorbed into whichever card was open.

## The pattern

Three times today a rule was **present, correct and unambiguous** in the prompt, and did not
apply — and each time the cause was *where it sat*, not what it said:

| | the rule | where it sat | what happened |
|---|---|---|---|
| BUG-030 iter. 3 | *"a period like this is `nonfunctional`"* | mid-paragraph, after three negations | the model dropped the requirement rather than choose a kind |
| BUG-032 iter. 2 | *"a period a law requires is a `constraint`"* | a later, louder paragraph won | fixed only by making that paragraph defer in its own first sentence |
| BUG-032 iter. 3 | *"being mentioned is not requiring"*, *"a class of device is not a named external thing"* | **inside step 1**, after five bullets that all end `constraint` | both guards inverted: `F1-R06` and `T1-R02` became `constraint`, stably, 2 runs of 2 |

**A guard reads as an instance of the step it is printed under.** Two paragraphs whose whole
job is to say *"this one is NOT a `constraint`"* were placed inside the paragraph block headed
*"Is it a boundary? … Then `constraint`"*, and they started producing constraints.

This is the placement half of a finding the project already half-knows — *a prohibition holds
about two runs in three; a redirect holds* — and it sharpens it: **a redirect must be printed
under its destination, not under the thing it is redirecting away from.**

## The measurement that isolates it

Iteration 3 of BUG-032 was a pure restructure: **no rule added, no rule dropped**, 92 lines of
ten competing paragraphs folded under the three-step ordering, verified by reading. Every
sentence that changed is a sentence that moved.

| prompt | T4 | `F1-R06` | `T1-R02` | C1 |
|---|---|---|---|---|
| `dd2ce8269321` BUG-030 shipped | 66.7 / 57.1 | correct 4 of 4 | correct | FAIL |
| `5ca2e24cf806` BUG-032 iter. 2 | 66.7–100 / 50–75, unstable | correct 3 of 3 | correct | PASS 1 of 3 |
| `6f5aff6f5b0c` BUG-032 iter. 3 | **100 / 85.7, twice** | **wrong 2 of 2** | **wrong 2 of 2** | PASS 2 of 2 |

So the restructure is worth having — it is what finally made T4 stable — and it costs exactly
the two items whose guards it misfiled. **Both effects come from the same edit and neither is
noise.**

**C1 passes under iteration 3 and the per-item rows are what catch this.** Both damaged
fixtures still clear their floors, so a case that reported only fixture totals would have
called this a clean success and closed BUG-032 on it. That is the argument for per-item diffs,
made by a live example rather than by assertion.

## The fix, which is known and is not a new rule

Move the two guards out of step 1 and print them under step 2, phrased destination-first — the
form BUG-030 proved: say what the thing **is** before saying what it is not.

- *"Being mentioned is not requiring"* → under step 2, as: a level measured **at** a named
  customer's scale, or **from** a named business event, is still a level.
- *"A class of device is not a named external thing"* → under step 2, as: where the product
  runs is part of how well it behaves.

## Why it is a card and not a fourth edit inside BUG-032

PRD-E2 allows three prompt iterations per diagnosis and BUG-032 has spent its three. This is a
**different diagnosis** — BUG-032 says `constraint` is under-applied, this says a correctly
written guard is inverted by its position — and it is measured separately, exactly as BUG-032
was split out of BUG-030 for the same reason. **If that reading is wrong, the rule to enforce
is "three iterations on C1 per day", and this card is where to say so.**

## Verified by
- `F1-R06` `nonfunctional` and `T1-R02` `nonfunctional`, 3 runs of 3
- **T4 still 100% / 85.7%**, 3 runs of 3 — the restructure's gain kept, not traded back
- C1 PASS 3 of 3, and `T1-R05`, `T4-R03`, `T4-R05`, `T3-R04`, `T4-R04` all still correct


---

## Closed 2026-09-03 — the pattern held; the budget ran out on the second casualty

Vaibhav confirmed the iteration rule as **per diagnosis** and asked for this bug resolved.
Three iterations were spent under that budget:

1. **Move both guards under step 2** — `T1-R02` recovered and kept. This is the fix that
   shipped, and the half of the card that closed clean.
2. **Give the period-from-an-event case its own heading** — `F1-R06` right about 1 run in 4,
   and T3 fell to 71.4% twice while N1 failed for the first time in its life. A fifth headed
   paragraph under step 2 made the whole section noisier: **the pattern one level up. Placement
   matters, and so does how many places there are.**
3. **Fold the case into the heading that already wins** — paragraph count constant, `F1-R06`
   still wrong, T1 at its 80.0% floor.

Stopped at three, exactly as the rule says, and the prompt reverted to `7f9c3916173e` —
byte-identical by hash. **The residual is BUG-037**, which is a different diagnosis: not
"a guard is misplaced" but "the section's prominence is a budget, and it is spent." The
candidate fix there is structural (BUG-023's shape — a narrow second call), not a wording.

My earlier revert of iteration 2 on a single run was the right action for an unmeasured
reason; the four-run distribution above is what it should have rested on.
