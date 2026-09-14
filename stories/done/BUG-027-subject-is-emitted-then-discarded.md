# BUG-027: `subject` is required, emitted, and thrown away

**Found while:** E4, keeping a promise BUG-016 made when it closed
**Severity:** minor — nothing is wrong with the output; a field the model is required to
produce is discarded, and one open question cannot be answered without it

## The finding

Every requirement the extractor emits carries a **`subject`** — a short noun phrase naming
what that requirement constrains (*"dashboard render time"*, *"authentication"*). It is in the
schema's `required` list. The prompt explains it at length and uses it as a gate: *"if the
subject is a car, a kettle or a coffee machine, you have found something that is not a product
requirement — do not emit it."*

**It is never stored.** `requirements` has no `subject` column, and assembly drops the field.

## Why it matters, which is narrower than it sounds

Not because the field is wasted — it earns its place in the prompt whether or not anything
reads it, by making the model name what it is constraining before it writes a statement.

It matters because **BUG-016 closed on a promise that depends on it.** Two of Vaibhav's six
wording defects never moved, and the one plausible explanation, written down at the time, is:

> the model may be satisfying *"name the subject"* in the `subject` field and dropping it from
> the statement — which is why *"Access must be scoped by role…"* has no subject after two
> attempts at the prompt.

**That hypothesis cannot be tested while the field is discarded.** E4-S1 was amended to persist
and render it, and E4 shipped without doing so.

## Why it was not folded into E4

E4 was six stories in one chunk with two project rules already set aside. Adding a column, a
migration and a change to the extraction storage path — none of it the review gate — inside
that chunk would have hidden it in a commit that is already too wide to review.

**BUG-016 closed by promising this would be a criterion someone has to meet rather than a
paragraph in a closed card's appendix.** A card is that; a sentence in E4's test plan is not.

## Fix (not applied)

1. `subject TEXT` on `requirements`, plus a `migrate()` step — the migration mechanism now
   exists (E4-S6 added it for `authorship`).
2. Store it in `insertStructure`'s sibling loop in `assemble.mjs`.
3. Render it beside the statement on the review screen.
4. **Then re-read BUG-016's two survivors against it**, which is the point:
   - if the subject is present in the field and missing from the statement, the fix is a prompt
     redirect and it belongs with the extraction prompt;
   - if the subject is missing from both, BUG-016's two limitations are permanent and its card
     says so instead of staying hopeful.

**Re-run when:** C1 (the extraction path changes), and `verify-statement-style`.

## Lesson

**A promise made while closing a card is a card, or it is nothing.** BUG-016 was closed on a
judgement with two known limitations and an explicit undertaking about where they would be
picked up. The undertaking survived one epic because it was written into E4-S1's criteria —
and then E4 shipped without it, and the only reason it is not lost is that the test plan had
to account for every row.

---

## FIXED, and it answered BUG-016's open question — 2026-09-03

**`subject` is stored and rendered.** A column, a migration (the mechanism existed from
E4-S6), storage in `assemble.mjs`, and one line on the review screen beside the statement.

### The hypothesis was right

BUG-016 closed with two wording defects unfixed and one written-down explanation for the
second: *the model may be satisfying "name the subject" in the `subject` field and dropping it
from the statement.* With the field visible, on T1:

| | |
|---|---|
| **statement** | *"**Access** must be scoped by role so that a regional manager only sees rows for their own region…"* |
| **`subject`** | **`row-level access control`** |

**The missing words were in the model's own answer, one field away.** That is exactly what
BUG-016 predicted and could not test.

It does **not** explain the other defect. The circular sharing definition — *"share a filtered
dashboard view via a shareable link"* — sits beside a perfectly reasonable subject
(`dashboard sharing`). Circularity is a different failure from a dropped subject, and one
diagnosis does not cover both.

### And the redirect it implied did not work

BUG-016 said: *"if the subject is present in the field and missing from the statement, the fix
is a prompt redirect and it belongs with the extraction prompt."* So one was written, in the
shape that has worked twice — **you are already naming it; the two fields do not share the
work** — with the real pair quoted as the illustration.

| Prompt `f9aa3b36f528` | run 1 | run 2 | run 3 |
|---|---|---|---|
| *"Access…"* gains its subject | no | **partly** — *"Access control must be…"* | no |
| The circular sharing definition | unchanged | unchanged | unchanged |

**One run in three, and that run added one word.** Reverted to `76f2c985b27f`; C1, C2, C3 and
C4 all pass afterwards.

### So BUG-016's two limitations are permanent, and its card should say so

That was the other half of the instruction: *"if it does not, BUG-016's limitations are
permanent and the card says so instead of staying hopeful."* Three prompt attempts have now
been spent on the missing subject across two cards. **A fourth is not the answer, and the
honest statement is that this system writes a statement that occasionally needs its subject
put back by a person** — which is what the review screen's edit control is for, and why an
edit costs a reason and leaves the grounding rate.

**What the field bought instead:** the screen now shows the subject beside every statement, so
a PM reading *"Access must be scoped by role"* sees `row-level access control` underneath it
and can edit in one click rather than going back to the transcript. **The diagnosis became a
feature when it failed as a fix.**
