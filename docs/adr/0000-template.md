# ADR NNNN — <decision, as an imperative title>

**Status:** proposed | accepted | superseded by ADR-NNNN · **Date:** YYYY-MM-DD
<!-- add "· amended by ADR-NNNN" or "**Amends:** ADR-NNNN" when this changes -->

## Context

What forces this decision now. Include the constraints that are real even if
they are unflattering or non-technical — a deadline, a demo date, a skill
you do not have, a budget of zero. A constraint you are embarrassed to write
down is usually the one actually driving the design.

Name the alternatives you considered **with the property that disqualified
each one**. One clause is enough: "(weak state machines)", "(external
dependency)", "(SaaS-only — data would leave the machine)". An alternative
recorded without its disqualifier is not a record, it is a list.

If an option is genuinely better on some axis, say so. Conceding where the
rejected option wins is what makes the rest of the reasoning trustworthy.

## Decision

What was decided, in the present tense.

## Consequences

Benefits and accepted costs in **one list**, not separate sections — a "risks"
heading invites you to write the costs less honestly than the benefits.

- <benefit>
- <cost, accepted knowingly: "Slight indirection accepted for the architectural claim">
- <what this forces elsewhere: "Requires migrations discipline">

---

Keep it short — 15 lines is normal. The template is a floor, not a ceiling:
heavyweight decisions may add sections ("Scope (deliberately minimal)",
"Proof", "The finding that justified the work"). Never delete a superseded
ADR; amend it and let the two records stand together.
