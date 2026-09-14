# BUG-046: The room's example got into the specification

**Severity:** minor · kind-confusion family (BUG-023/030/033/037)
**Found:** 2026-09-04 by `check-all.mjs` on its first run, via `verify-statement-style.mjs`
**Area:** `n8n/prompts/extract-requirements.md`

## What happens

```
FAIL  1 statement(s) break a hard rule:
  [T1] promoted_example — "such as"
    A user must be able to schedule a dashboard to be emailed to them as a PDF
    on a recurring schedule, such as weekly on Monday morning.
```

68 statements examined, 1 breaks the rule. "Weekly on Monday morning" is **an example somebody
gave in the room**, not part of the requirement. A specification that says *such as* has handed
the reader the job of deciding what is actually required.

The checker's own line is the instruction: **fix the prompt, never the checker.**

## Why it is small and still worth a card

It is one statement of 68 and it changes no metric. But this is the family this project spends
its prompt budget on, and the last three attempts at it (BUG-030/033/037) all taught the same
thing: **a prohibition holds about two runs in three; a redirect holds.** "Do not include
examples" is a prohibition. The fix has to give the example somewhere to go.

The natural somewhere already exists: the requirement states the capability, and the specific
cadence is either a detail the source settled (in which case it belongs in the statement as a
requirement, not as an illustration) or one it did not (in which case it is an **OpenQuestion**).
That is the redirect, and it is testable.

## The fix, when this is taken

1. Add the redirect to the extraction prompt **in a heading**, not buried in a paragraph —
   a redirect placed where the model is not looking is a prohibition (BUG-004/007/016).
2. **PRD-E2's iteration budget applies: three attempts, then stop and file the pattern.**
3. Re-run `verify-statement-style.mjs` and C1 together. A prompt change that fixes style and
   costs recall is not a fix, and C1 is already unsettled (BUG-040) — so this needs the
   **spread**, not a single run, before anyone calls it better.

## Not fixed here

Found during BUG-038's repair. The fourth and last card from `check-all.mjs`'s first run.

---

## 2026-09-07 — this went GREEN without being fixed, and that is the finding

The sweep reported **73/73**, this check among them:

```
2026-09-05    Statements stored: 70    1 statement(s) break a hard rule
              [T1] promoted_example — "such as weekly on Monday morning"

2026-09-07    Statements stored: 69    PASS, no promoted examples
```

**The prompt was not touched.** What changed is the population: the dress rehearsal re-ran
`produce`, extraction ran again, and the offending sentence is simply not in this extraction. It
will come back.

This is **BUG-068 in a second place** — the doer is non-deterministic, so a defect that appears in
some runs and not others makes any single run's verdict a coin toss. A green check here is not
evidence of a fix, and **this card stays open.**

Two consequences, both acted on:

- The deck said *&ldquo;one statement in seventy still fails my own style checker&rdquo;*. On the
  published database that is **false**, and a stranger running the sweep would have seen 73/73 and
  wondered what the slide meant. Slide 9 now describes the **intermittency** rather than the
  instance, which is the truer and more interesting claim anyway.
- `deliverables/RELEASE.md` no longer lists this as a standing red. It lists it as a defect
  that comes and goes, which is what it is.

**The lesson, and it is the same one twice:** a check that reads a re-generated population cannot
be closed by one green run, and this project now has two cards saying so.
