# BUG-034: a thing already built is written down as a requirement

**Severity:** minor · **Filed:** 2026-09-03, while scoping BUG-032
**Costs one precision point on T4, every run.** T4 clears its floor without it, which is why
it is a card and not part of BUG-032.

## What happens

T4 contains this exchange:

> **Wei (Design):** And an audit entry when someone exports.
> **Priya (Eng Lead):** Every export is already written to the audit log. **That's done.**

The extractor writes it down:

```
Every export action must be recorded in the audit log.     false_positive, 4 runs of 4
```

The answer key has six requirements for T4 and this is not one of them, because **a capability
the team says already exists is not something the PRD is asking for**. Wei asked; Priya
answered that it is done; nothing was decided, because nothing needed deciding.

## Why it is its own card

It is not a kind error. Every failure BUG-032 lists is a requirement that *is* in the answer
key arriving with the wrong `kind`. This one is a sentence that should not have become a
requirement at all — the **fact-versus-requirement** boundary, which is the same boundary that
makes `T1-R15` hard from the other side:

| | reads as | is | outcome |
|---|---|---|---|
| `T1-R15` *"forty-one million rows in the events table"* | a statement of fact | a requirement | **missed**, every run (BUG-023) |
| T4's audit line *"already written… that's done"* | a requirement | a statement of fact | **kept**, every run |

One prompt has to get both right, and a rule that fixes either one by itself will move the
other. That is the reason this is measured on its own rather than folded into a card whose
subject is `constraint`.

## What makes it tractable

The signal is in the source and it is not subtle — *"already"*, *"that's done"*, past tense.
The `extract-from-passage` prompt written for BUG-023 **already carries a fact-exclusion
rule**; `extract-requirements` does not carry an equivalent one, and the two prompts have
never been reconciled on this point. Reading them side by side is the first step, not writing
a new rule.

## The divergence is wider than the fact rule (added 2026-09-03)

Reading the two prompts side by side, as this card says to, they have **also diverged on
`kind`** — the same field, the same three-value enum, decided by two different rules:

| | `extract-requirements` | `extract-from-passage` |
|---|---|---|
| a fact is not a requirement | absent | **present** — *"a sentence whose main verb describes what **is** … is never a requirement"* |
| what makes a date a `constraint` | *"a fixed calendar deadline"* (narrowed by BUG-030) | *"a date or deadline"* — **the pre-BUG-030 rule** |
| the ordering | boundary → level → capability (BUG-032) | absent |

Which law applies to a requirement depends on **whether it happened to arrive through a
contested passage**, and nothing checks that the two agree. Today that divergence is
load-bearing *by luck*: `T1-R05` reaches `constraint` through the passage prompt's older, wider
date rule, and narrowing that rule to match might well have cost BUG-023's result.

**A field with two laws is one field with a coin flip in it.** Whatever this card decides about
facts, it should decide about kinds in the same breath, and the reconciliation wants a check —
the shape `check-injection-layers.mjs` already uses for the fence would work: assert that both
prompts' kind vocabularies agree, derived from the files rather than typed.

## What it must not break

`T1-R15` is missed every run for exactly this reason and a heavier fact-exclusion rule would
cement that. **Any fix here is measured on `T1-R15` as well as on T4**, and if it trades one
for the other it is not a fix — it is a preference, and the card should say which.

## Verified by
- T4 precision 100% over three runs, with `T4-R01`–`T4-R06` all still matched
- `T1-R15` no worse than its standing figure — missed, but not *more* missed for a new reason
- the two prompts' fact rules reconciled, or the difference between them written down
