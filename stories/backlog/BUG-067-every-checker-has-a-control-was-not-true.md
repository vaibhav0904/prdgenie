# BUG-067: "Every checker has a negative control" was not true, and nothing computed it

**Severity:** major · a claim on a release slide that a stranger could have falsified in one command
**Found:** 2026-09-05, writing slide 8 of the deck and going to verify it
**Area:** the deck · `check-all.mjs` · every uncontrolled checker

## What happened

Slide 8 of the deck said, in the sentence meant to be the reason to believe every other slide:

> *&ldquo;and every checker has a **negative control** that breaks it deliberately and requires
> it to go red.&rdquo;*

I wrote it because it is the habit, and then went to count it before shipping it. It is false:

```
51 checkers
  20  have a negative-control SCRIPT
  12  have a CONTROL case inside them
  19  have neither
```

**Thirty-seven per cent of the checkers cannot be shown to fail.**

## Why it matters more than the number does

The claim is on the one slide whose job is *why you should believe the previous slide*. A stranger
who ran `ls *negative-control*` and counted would have caught it in ten seconds — and every
figure on slide 7 would then have been read as something I had also not checked.

Being wrong about a number is ordinary. **Being wrong about the reason to trust my numbers is the
one failure this project cannot absorb.**

## Why it was not caught

Because nothing computed it. The controls were a discipline, not a measurement: each one was
written because the story that added a checker also added a control. The claim was true for a
long time and became false gradually, as checkers were added faster than controls — which is
exactly the shape of a number that was true once and is quoted forever.

There is a rule in `CLAUDE.md` for this — *a check asserts its own coverage, derived not typed,
print the figure the case cannot fail on* — and it had never been applied to **the checkers
themselves**.

## What was done immediately

- `check-control-coverage.mjs` computes the three-way split and **prints the sentence the deck is
  allowed to say**, so the slide reads what the check produces.
- It is a **ratchet, not a gate**: it fails when the uncontrolled count gets *worse* than the
  recorded floor of 19, never for being non-zero. A gate that went red for an uncontrolled
  checker would be a gate against writing checkers, and a checker with no control still beats no
  checker.
- The slide now carries the real split, and the spoken line says out loud that the claim was
  written, checked, and found false. It is a better slide than the one that was wrong.

## What is still open — this card

**The nineteen.** Named on every run:

```
check-failure-routing      verify-cost-telemetry     verify-signoff
check-spine                verify-dead-letters       verify-structure
audit-approvals            verify-gaps               verify-unsettled
check-readme-links         verify-grounding          verify-labels
verify-assembly            verify-ingest             verify-pm-document
                           verify-judge-isolation    verify-prompt-hygiene
                           verify-passages           verify-results-hygiene
```

Not all of them should get one. Some are cheap to control (`check-spine`, `verify-labels`); some
are expensive (`verify-pm-document` calls a paid provider); at least one may be genuinely
uncontrollable, and if so **that must be written down beside it rather than left as an absence**.

The fix is to work down the list, and to lower the floor each time — never to raise it.
