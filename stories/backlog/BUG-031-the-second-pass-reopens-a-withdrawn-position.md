# BUG-031: The second pass re-opens a position the room withdrew

**Severity:** minor · **Filed:** 2026-09-03, during BUG-023's measurement, run 3 of 3
**Predicted before it happened** — this card exists because the risk was written down first.

## What happens

T1's contested exchange ends with Marcus withdrawing the thirty-second refresh; the room
settles on hourly. Pass 1 gets this right in every run: it emits *"data refreshes hourly"* and
cites the withdrawal sentence itself (BUG-024's redirect, working).

The second pass, reading that same exchange **on its own**, emitted:

```
1115-P2-004  false_positive  Data refreshes every thirty seconds with streaming to
                             provide near real-time operations visibility.
```

**One false positive, in 1 of 3 runs.** T1 precision on that run: 93.3%, against a 0.75 floor.

## Why it is not a surprise

BUG-023's re-measurement recorded this exact risk before the second pass was built, from the
`C` probe variant:

> *"\`C\` is high recall and low precision. Reading the exchange alone, the model also emitted
> the **withdrawn** position, which is exactly BUG-024's failure mode returning… So 'read the
> passage again' cannot be a naive union."*

It is not a naive union — code drops anything ungrounded from the second pass and anything
whose citation overlaps a pass-1 requirement. **Neither catches this one.** The withdrawn
sentence is really in the document, so it grounds; and pass 1 cites the *withdrawal* while
pass 2 cites the *withdrawn claim*, which are different spans.

## Why it is minor and not a blocker

- It costs one requirement in one run of three, and precision stays 18 points above the floor.
- The false requirement is **visible and cited** — a PM reading the review screen sees
  *"thirty seconds"* beside a quote, next to a requirement saying hourly, and the two
  contradict each other on the same screen. That is a bad row, not a silent one.
- The label it contradicts (`T1-R04`, hourly) is extracted correctly in every run, so the PRD
  is not wrong about what was decided — it carries an extra claim about what was not.

## The candidate fix, not attempted

**A second-pass requirement may not re-open a subject a first-pass requirement already
settled.** Both passes emit `subject` (BUG-027), and pass 1's hourly requirement and pass 2's
thirty-second one are about the same thing. Code would drop the second.

Not attempted today, for the reason this project keeps re-learning: **it needs a comparison
that is not string equality** — *"data refresh"* versus *"refresh frequency"* — and a fuzzy
subject match is a new judgement dressed as a check. It wants measuring on more than one
fixture before it is written.

## What must NOT be done

**Do not narrow the second-pass prompt further.** It already carries the withdrawal rule in as
many words, and it followed it in 2 runs of 3. Another wording is the move BUG-023 spent an
iteration on and the card forbids twice.

## Verified by
- three runs with the subject rule in place, showing the false positive gone **and**
  `T1-R05` still recovered 3 of 3 — the second half matters, because a rule that drops
  too much would take the deadline with it
