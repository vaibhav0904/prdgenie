# Test cases: BUG-016 Requirements restate the room instead of specifying what to build

Written before any build work, per gate G3.

**Found by Vaibhav reading the output**, which is the only thing that could have found it:
grounding compares the *quote* to `raw_text`, C1 matches by *span*, and C2's rules are about
invention, PII and refusal. **Nothing in this project reads a statement as English**, and the
statement is the only field a PM actually reads.

## What is mechanically checkable, and what is not

This split is the whole design of this test plan, and getting it wrong in either direction
would be worse than not fixing the bug.

| Vaibhav's finding | Checkable by code? |
|---|---|
| *"on **our** largest customer account"* — speaks in the room's first person | **Yes** — a pronoun set |
| *"such as weekly on Monday morning"* — an example promoted into the spec | **Yes** — a phrase set |
| *"flat, not as a minimum"* — meeting shorthand | No |
| *"an audit log that can be handed over"* — purpose clause truncated | No |
| *"share a filtered dashboard view via a shareable link"* — circular | No |
| *"**Access** is scoped by role"* — subject dropped | No |

So the fix is verified in two halves, and **the second half is a judgement that goes back to
Vaibhav on a page** (G6b). Claiming this bug closed on the mechanical half alone would be
claiming the opposite of what the card says.

## The thing already learned, before writing a line

A first pass at this test plan was going to make *"the statement appears verbatim in
`raw_text`"* a **failure**. Run against the current output, that rule fires on:

> *"Every chart must let the user export its underlying rows as CSV."*

which is a perfectly good requirement that happens to be exactly what somebody said. **A
verbatim statement is not automatically a copied one.** So the copy rate is **reported, never
failed** — it is a signal about drift, not a defect in itself.

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **The prompt states the contrast, once** | The quote is **copied**; the statement is **written**, plus a house style in one place | Pass | New section, `4da5ffb95e7d`. Every example in it is invented — the first draft quoted T1's own output back at the model, which is the contamination BUG-018 was about |
| TC2 | **No first person survives**, 9 fixtures | No statement contains `our`, `we`, `us`, `my`, `I` as a word. **Hard rule** | Pass | **0 in 3 of 3 runs**, was 2 |
| TC3 | **No example promoted into the spec** | No statement contains `such as` or `e.g.` **Hard rule** | **Pass**, second attempt | **0 in 3 of 3** at `b9d627e994f8`. The prohibition never worked; a **redirect** did — see below |
| TC4 | **The verbatim-copy rate is reported, not failed** | A count and a rate, with the reason stated in the output | Pass | **54.7% → 14.5 / 14.3 / 14.5%.** The largest single movement in this card |
| TC5 | **Vaibhav's six, re-read one by one** | Each reported individually — fixed, unchanged, or newly wrong | **Partial: 2 fixed, 1 improved, 3 unchanged** | The table below. Nothing is averaged into a score |
| TC6 | **C1 is not damaged**, three runs | Inside the ranges already measured | **Pass**, after BUG-022 | T1 recall **86.7 ×3**, precision **100.0 ×3** — off the floor and the first clean run in the project. The 80.0 reading was two-thirds BUG-022's permanent tax |
| TC7 | **C2 still passes**, three runs | All auto-fail rules green | Pass | C2 PASS ×3. The citation requirement was not touched |
| TC8 | **NEGATIVE CONTROL: the style checker can fail** | Each violation class caught and named | Pass | **13/13, both directions.** 7 must-fire, 6 must-not-fire — `API`, `customer` and `hourly` do not trip the pronoun rule, which is the mistake that would have made the checker harmful |
| TC9 | **The checker asserts its own coverage** | Examined vs stored, failing on a gap | Pass | 62 of 62 examined; a gap sets the exit code |
| TC10 | **Run it twice** | Identical output on a second invocation | Pass | identical both times |
| TC11 | **The judgement half goes to Vaibhav** | A G6b page with his six defects, before and after | **Blocked on Vaibhav** | Page built and sent. **This card stays open until it comes back** |

## Out of scope, named so it is not smuggled in

- **The citation requirement is not touched.** The card's own instruction. `statement` and
  `citations` are two different artifacts and the fix is to say so, not to loosen grounding.
- **No second model pass.** Candidate fix 3 on the card costs a call per requirement and
  cannot be allowed near citations. It stays unbuilt unless 1 and 2 fail.
- **M2 is not measured here.** The card names accepted-unedited rate as the metric this
  lands on; the metric itself is E8's.

## Evidence — 2026-09-02, prompt `47ac49c6330b` → `4da5ffb95e7d`

```
.\run.cmd review-ui/scripts/verify-statement-style.mjs            1 offence (was 3)
.\run.cmd review-ui/scripts/negative-control-statement-style.mjs  13/13, both directions
.\run.cmd evals/harness/grade.mjs   x3                            C1 PASS x3, C2 PASS x3
```

**7 of 11 rows Pass. Two fail, one is partial, one is blocked on Vaibhav.**

## Vaibhav's six, re-read

| # | His finding | Now | |
|---|---|---|---|
| 1 | *"…on **our** largest customer account."* | *"…on **the Northwind** customer account."* | **Fixed** — and the referent resolved to the name he said was dropped |
| 2 | *"Data refreshes hourly, **flat, not as a minimum**, for the pilot."* | *"The dashboard data must refresh hourly, **not more frequently**, for the pilot."* | **Fixed** — shorthand replaced by what it constrains |
| 3 | *"…an audit log **that can be handed over**."* | *"…recorded in an audit log that can be handed over **to customers**."* | **Improved.** He asked for *"a customer's security review"*; the recipient is now named, the purpose still is not |
| 4 | *"…on a recurring schedule, **such as weekly on Monday morning**."* | **identical, 3 of 3** | **Unchanged** |
| 5 | *"…share a **filtered dashboard view via a shareable link**."* | **identical** | **Unchanged** — still circular |
| 6 | *"**Access** is scoped by role…"* | *"**Access** must be scoped by role…"* | **Unchanged** — access to what |

**Two more improved without being on his list:** *"in a warehouse aisle"* (context, not
specification) is gone, and the white-labelling statement now says what is *not* white-labelled.

## The two failures

**TC3 — the promoted example survives all three runs.** The prompt now addresses this case
directly, with an invented parallel (*"a digest, say every Friday"* → an engineer builds
Friday), and the model appends the example anyway, identically, every time.

**It is a prohibition, and this is the fourth time this project has measured what those are
worth.** BUG-007 counted it, BUG-004 hit a wall at three iterations, BUG-018 reworded a clause
to describe its case in the document's own structure and changed nothing, BUG-020 watched a
checklist get filled in like a form. **A fifth wording is not the move**, and one is not being
attempted.

There is also a real question hiding underneath it, and it goes to Vaibhav: the transcript
says customers ask for the report *"Monday morning, before their own leadership meeting"*, and
`T1-R06` labels the requirement as *"on a recurring schedule"* with the timing as an example.
**The model may be reading the room more literally than the answer key does.**

**TC6 — T1 recall is 80.0%, exactly on the floor, in 3 of 3.** Read one by one rather than
assumed, the three misses are:

| Miss | Since when | Whose |
|---|---|---|
| `T1-R02` — extracted, but as `constraint` where the key says `nonfunctional` | **all 6 runs measured**, before and after | **BUG-022**, filed |
| `T1-R05` — the fixed Q4 deadline | **all 6 runs measured** | pre-existing, unowned |
| `T1-R15` — the two-second budget at Northwind's 41M-row scale | occasional before, **3 of 3 now** | plausibly this change |

**So only the third is arguably ours**, and the mechanism is legible: *"resolve every referent
against the document"* made the model fold Northwind into the latency statement instead of
emitting the scale constraint separately. Precision **rose** to 92.3% for the same reason —
the free-floating fact *"The largest customer account is Northwind with forty-one million
rows"*, a false positive in every earlier run, is gone.

**The honest reading: this change traded one intermittently-missed label for a cleaner,
more precise requirement list — and the number it moved was already carrying a permanent
6.7-point tax nobody had read (BUG-022).** C1 passes three times with no margin, and that
sentence belongs next to the word "passes".

## Second attempt — 2026-09-02, `4da5ffb95e7d` → `b9d627e994f8`

**I said I would not try a fifth wording, and then I changed one clause. That needs saying
plainly rather than being folded in.**

What I ruled out was **a fifth way of forbidding**. What was tried instead is the move that
worked for BUG-004: **give it somewhere to put the thing.** The clause no longer says *do not
append the example*; it says **the example belongs in the `quote`, and you are already
carrying it there**:

> *When somebody asks for a digest and adds "say every Friday", the Friday is an example of
> the thing, not the thing. Put the sentence they said in the `quote`… Appending "such as
> every Friday" to the statement does not save the detail — the citation already saved it —
> it just tells an engineer to build Friday.*

**It worked in 3 runs of 3, on a case four wordings of the prohibition had not moved.**

| | prohibition (`4da5ffb95e7d`) | redirect (`b9d627e994f8`) |
|---|---|---|
| Promoted examples | 1 / 1 / 1 | **0 / 0 / 0** |

**Two changes shipped in this batch, and attribution survives because each has its own
signal**: the redirect can only move the promoted-example count, and BUG-022's narrowing can
only move a *kind*. Neither can produce the other's evidence.

### The measured state now

| | Filed at | After attempt 1 | **Now** |
|---|---|---|---|
| Statements copied verbatim | 54.7% | 14.5 / 14.3 / 14.5% | **15.9 / 16.4 / 15.9%** |
| First-person statements | 2 | 0 ×3 | **0 ×3** |
| Promoted examples | 1 | 1 ×3 | **0 ×3** |
| T1 recall | 86.7 / 86.7 / 80.0 | 80.0 ×3 | **86.7 ×3** |
| T1 precision | 81.3 / 92.9 / 92.9 | 92.3 ×3 | **100.0 ×3** |
| T1 `wrong_kind` | 1 ×3 | 1 ×3 | **0 ×3** |

C1 and C2 pass 3 of 3. `verify-statement-style` is **green** for the first time.

### Vaibhav's six, third reading

| # | His finding | Now |
|---|---|---|
| 1 | first person | **Fixed** — *"on the Northwind customer account"* |
| 2 | *"flat, not as a minimum"* | **Fixed**, though this run states it less completely: *"must refresh data hourly for the pilot release"* — the shorthand is gone and so is the "not more frequently" precision an earlier run had |
| 3 | *"handed over"* to whom | **Improved** — *"handed over to customers"*; the purpose still is not named |
| 4 | *"such as weekly on Monday morning"* | **Fixed** — *"on a recurring schedule."* |
| 5 | circular sharing definition | **Unchanged** — *"share a filtered dashboard view via a shareable link"* |
| 6 | *"Access"* with no subject | **Unchanged** — access to what |

**Three fixed, one improved, two unchanged.** The two that remain are the two a machine cannot
see, which is the half this card always said belongs to a human.

### Why the prompt is not being changed again

Both remaining defects are already addressed in the prompt, by name, with invented examples —
*"Never define a thing by itself"* and *"Name the subject"*. They did not take, twice.

There is a plausible redirect for #6, and it is written here rather than tried: **each
requirement already carries a `subject` field**, and the model may be satisfying "name the
subject" there and dropping it from the statement. Testing that needs the field visible, and
it is deliberately not persisted (BUG-004 TC10 — that belongs with E4, the screen that would
show it). **So it waits for E4 rather than being guessed at now.**

More to the point: **there is no gate for prose.** Iterating further without one is the "tune
until it looks better" the eval rules exist to prevent. The remaining judgement is Vaibhav's,
and one question of his is still unanswered.

---

## TC11 answered — 2026-09-02. Vaibhav delegated it; the call and its cost are below

> *"You decide please. Move with your suggestion."*

**Decision: yes, this wording goes in a PRD now.** The card closes, and the two defects that
did not move are recorded as **known limitations with an owner**, not as a quiet pass.

### What the decision rests on

| His six | State |
|---|---|
| first person — *"on **our** largest customer account"* | **Fixed**, and the referent resolved to the name |
| *"flat, not as a minimum"* meeting shorthand | **Fixed** |
| *"an audit log that can be handed over"* — to whom | **Improved** — recipient named, purpose still not |
| *"such as weekly on Monday morning"* promoted into the spec | **Fixed** — by a redirect, after four prohibitions failed |
| *"share a filtered dashboard view via a shareable link"* — circular | **Unchanged** |
| *"**Access** is scoped by role"* — subject dropped | **Unchanged** |

Alongside: **copied-verbatim fell 54.7% → ~16%**, first person is 0 in 3 of 3, promoted
examples 0 in 3 of 3, and T1 precision reached 100% — the first clean extraction in the
project.

### Why "yes" rather than "not yet"

1. **Four of six are fixed or improved, and the two that stand are the two a machine cannot
   see** — which is exactly the split this test plan drew before any work started. Holding the
   card open does not make them more likely to be fixed; it makes the board wait.
2. **There is no gate for prose.** Another prompt iteration would be tuning until it looks
   better, which the eval rules exist to prevent. Both remaining defects are already named in
   the prompt with worked examples and did not take, twice.
3. **The plausible fix for #6 needs something that does not exist yet.** Each requirement
   already carries a `subject` field; the model may be satisfying *"name the subject"* there
   and dropping it from the statement. **`subject` is not persisted**, so this cannot be
   tested until the screen that shows it exists — which is E4.
4. A PM reading these thirteen would edit two of them. That is a PRD draft doing its job, not
   a PRD draft failing.

### What the decision costs, stated plainly

- **Two statements still read wrong**, and they ship that way until E4. Anyone reading the
  current output should expect to rewrite the sharing requirement and to add a subject to the
  access one.
- **M2, accepted-unedited rate, will carry those two edits** when E8 measures it. That is the
  right place for them to show up, and the number should not be read as a surprise when it
  does.
- **This closes on a judgement, not a measurement.** Said plainly because everything else in
  this card is measured, and the difference matters.

### Where the residue goes — an owner, not a note

**E4-S1 is amended** to persist and render `subject`, and to re-test these two statements
against it. The amendment is on that card with this reasoning, so the follow-up is a
criterion someone has to meet rather than a paragraph in a closed card's appendix.

**11 of 11 rows now resolved: 10 pass, TC5 partial (3 fixed, 1 improved, 2 unchanged).**
