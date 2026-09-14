# Test cases: BUG-044 — a control that cannot run is not a control

```
.\run.cmd evals\harness\negative-control-clause.mjs    six model runs, four n8n restarts
```

**The control was never wrong; it was unfindable.** It located its subject by matching a bullet
heading exactly, and the heading is the part that changed. Everything below is about making the
anchor survive the next rewording — and about not replacing a brittle match with a loose one,
which would be worse.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **The control locates its subject again** in the current prompt | 1 span found | **Pass** | `start` and `end` prefixes match **exactly once each**; span 2051→3249, 1198 characters — the "Either side of an unsettled disagreement" bullet and its follow-on paragraph, ending before "A position that was later withdrawn" |
| TC2 | **The anchors are prefixes, not whole headings** — the part that changes is excluded from the match | prefix only | **Pass** | anchors stop before the em-dash where both headings grew their redirect |
| TC3 | **A loose match cannot silently grab the wrong span**: each anchor must occur exactly once, the span must be ordered and non-empty | asserted | **Pass** | `startHits !== 1 \|\| endHits !== 1 \|\| end <= start` exits 1 and **prints both match counts** |
| TC4 | **The swap actually changes the prompt** — a no-op swap would make the whole experiment vacuous | changed | **Pass** | asserted before deploy: the swap changed the prompt — asserted inline before deploying |
| TC5 | **It replaced the right thing**: the removed text carries the `unsettled_positions` redirect and the restored bullet does not | both true | **Pass** | the removed text carried the `unsettled_positions` redirect; the restored bullet does not — asserted inline |
| TC6 | **Direction 1** — with the current clause, `T3-R07` is extracted in all 3 runs | 3 of 3 | **Pass** | 3 of 3 with the current clause |
| TC7 | **Direction 2** — with the pre-BUG-018 bullet restored, `T3-R07` goes missing in at least 1 of 3 | <3 | **FAILED TO DEMONSTRATE** | 3 of 3 **present** with the old bullet — carried to **BUG-048**, not resolved by editing the assertion — statistical by design: the old clause was ignored in roughly 1 run of 3 |
| TC8 | **Prompt hygiene moves with the swap**: it FAILS with the old bullet (which quotes the answer key) and PASSES with the current one | fails then passes | **Pass** | hygiene FAILS with the old bullet, naming T3-R07 and the quote; PASSES restored — deterministic half — a string is there or it is not |
| TC9 | **The prompt is restored byte-for-byte** and n8n is left running the current text | identical | **Pass** | 27,192 bytes, `7f9c3916173e`; workflow carries the same — `finally` block, byte-compared |
| TC10 | **A failure to demonstrate is reported, not re-rolled** | reported | **Pass** | printed its own FAILED-TO-DEMONSTRATE text and did not retry — the control prints its own "FAILED TO DEMONSTRATE" text and does not retry |

## The correction this card owes

**My own card stated the wrong premise.** It said this control exists to prove *C2's grounding
case* can fail, and that C2's green had therefore demonstrated nothing. **That is not what this
file does.** It is the negative control for **BUG-018**: the claim that one exclusion bullet in
the extraction prompt is what decides whether `T3-R07` is extracted. It controls two things —
prompt hygiene (deterministic) and extraction behaviour (statistical, three runs each way).

The `FAILED: C2` lines in the `check-all` output that led me there were **stderr from other
scripts in the same sweep**, interleaved with this one's. A conclusion drawn from adjacent lines
in a combined log is a conclusion drawn from formatting.

**What was true regardless**: the control could not run, said so, exited non-zero, and nothing
noticed for a day. The severity stands; the subject was misidentified.

## Outcome

*(written when the run finishes)*

## Outcome: it runs, it is honest, and it cannot support its claim

```
PASS  the extraction node carries the prompt on disk (a7001fa162f1 vs a7001fa162f1)
PASS  the two directions deploy DIFFERENT prompts (7f9c3916173e then a7001fa162f1)
PASS  hygiene FAILS with the old bullet — and names T3-R07
FAIL  T3-R07 goes missing in at least one of 3 runs with the old bullet (present in 3)
```

**Two defects, and the second was worse than the one on the card.** The control could not find
its subject — a heading match against a heading that had grown a redirect. But the line that
was supposed to prove the swap had reached n8n was scraping the *first* `prompt_version=` out of
a list, and printed the same number in both directions. Had the swap silently failed, this
control would have reported a clean negative result. It now asserts the shipped node's hash
against the file on disk, and that the two directions ship different prompts.

**The claim did not survive the repair.** `T3-R07` is present 3 of 3 with the old bullet
restored, where it was missed 2 of 3 at prompt `5ad1a07854f1`. That is BUG-018's claim, not this
control's machinery, and it is carried to **BUG-048** with the measurement.

**The assertion was not weakened to make the suite green.** Demoting the statistical half on the
strength of one three-run sample would be tuning a threshold to output, in the same session that
produced the output. `check-all.mjs` stays red on this check with BUG-048 as its stated reason.
