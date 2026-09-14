# UAT: E1-S3 The answer key, written before anything can be tuned to it

**This one is worth Vaibhav's eyes**, unlike E1-S1 and E1-S2. Under the G6 scoping of
2026-09-01, a story needs human UAT when it contains a check a machine cannot make — and
"is this ground truth *correct*?" is exactly that. A script can prove every quote resolves;
only a person can say whether the labelled requirements are the ones a PM would have
written down.

Everything downstream inherits these files. If a requirement is missing from T1's labels,
C1 will score the system as *hallucinating* when it correctly extracts it.

---

## Before you start

**Every command is `.\run.cmd ...`, typed from the project root in PowerShell.**

The leading `.\` is required — PowerShell does not search the current directory, and a bare
`run.cmd` gives the same "not recognized" error you saw. `run.cmd` finds Node itself, so it
works whether or not your terminal's PATH has it.

**Rewritten 2026-09-01 (BUG-010).** The previous version told you to type
`node evals/harness/verify-labels.mjs`, which could not run on your machine. Every command
below has now been executed, in this order, in a shell where `node` is *not* on the PATH —
the same condition your terminal is in.

---

## Part 1 — the mechanical half (~2 minutes)

**Step 0. Does the environment have what the next steps need?**

```powershell
.\run.cmd
```

*Verified output:* six `ok` lines — Node, `node:sqlite`, `.env`, the review service, n8n and
the WF1 door — ending `Everything the next command needs is here.`

If anything says `FAIL` it prints the exact command to fix it, in the order to run them. The
likeliest is the review service, which needs its own terminal:

```powershell
.\run.cmd review-ui/server.js
```

Leave that window open and come back here.

---

**Step 1. Is the ground truth usable?**

```powershell
.\run.cmd evals/harness/verify-labels.mjs
```

*Verified output:* 11 rows, all `PASS`, ending
`Ground truth verified: every quote resolves, every count is as specified.`
Notable rows: `TC3  107 regions resolved`, `TC5  14 requirements, kinds:
nonfunctional/functional/constraint`, `TC8  3 conflicts`, `TC11  21 redactions`.

---

**Step 2. Watch the checker fail.** A check never seen to fail is an assumption (BUG-001).

```powershell
.\run.cmd evals/harness/negative-control.mjs
```

One command: it breaks a quote in T1's labels, runs the checker, and restores the file —
restoring in a `finally`, so it cannot leave the repository broken if you stop halfway.

*Verified output:*

```
  1. clean             exit=0  green, as expected
  2. one quote broken  exit=1  RED, as required
     names the fixture: true   quotes the offending text: true
  3. restored          exit=0  green again
     file is byte-identical to before: true

PASS — the ground-truth checker was seen to fail, and recovered.
```

> The previous version of this step was four hand-typed PowerShell commands, and **it did
> not work**. Its `-replace '"quotes": \["'` matched nothing: the labels are pretty-printed,
> so the bracket and the quote are on different lines. It corrupted nothing, the checker
> stayed green, and the "control" passed while testing nothing at all. Fourth check in this
> project that could not fail — and the first one handed to you.

---

**Step 3. Do the labels hold against what is actually *stored*?** Not against the draft
files. This is the dependency that put this story after E1-S2: redaction rewrites the text,
so a label written against the pre-redaction fixture would misalign silently.

```powershell
.\run.cmd evals/harness/produce.mjs --ingest-only
.\run.cmd evals/harness/verify-labels.mjs --stored
```

`--ingest-only` pushes all nine fixtures through the real door without calling the model, so
this is free and takes about ten seconds.

*Verified output:* nine `ok` lines with fresh `doc_id`s and `Coverage: 9 of 9`, then 12 rows
passing — the twelfth being
`TC13  every fixture is checked against stored text, and every quote still resolves  9/9 checked`.
H2 is the fixture where this would break, because redaction rewrites it.

> This replaces the run manifest with an ingest-only run, so `grade.mjs` will afterwards
> refuse to grade — correctly. To get a gradeable run back:
> `.\run.cmd evals/harness/produce.mjs` (~90 seconds, about two cents of model spend).

---

## Part 2 — the half only you can do (~10 minutes)

No commands. Read **T1** (`evals/datasets/docs/T1.json`) beside **T1's labels**
(`evals/datasets/labels/T1.labels.json`) and answer four questions.

1. **Are any real requirements missing from the labels?** Read the transcript as a PM and
   note anything you would have written into a PRD that is not in `expected_requirements`.
   *A miss here permanently understates the system: it will be scored as inventing things
   when it is right.*
2. **Is anything labelled that is not really a requirement?** Chatter, a preference, a thing
   someone floated and dropped. *A false label permanently overstates the difficulty and
   depresses precision.*
3. **Does the reversed decision read correctly?** Marcus first calls for thirty-second
   streaming refresh, then withdraws it for hourly. Check the labels record the *final*
   position (T1-R04), not the first.
4. **Does T1 read like a real meeting?** Interruptions, unfinished sentences, tangents. If it
   reads like clean minutes, extraction will look better than it deserves to, and every
   number that follows will be flattering.

Then skim **T3's three conflicts** and confirm the third (T3-Q03, the tablet exchange)
genuinely reads like agreement while being a disagreement — that is the case that separates
real ambiguity detection from keyword-spotting.

**Two things now measured rather than predicted, worth knowing before you read:**

- **T1-R05, the Q4 pilot deadline, was missed by three consecutive prompt versions** before
  the third fixed it. If you think a ship date is not really a *product* requirement, say so
  — that would make the label wrong rather than the extractor.
- **T1's four `constraint` vs `nonfunctional` items are the ones the model finds hardest**
  (SAML, white-labelling, role-scoped access, audit logging). C1 counts a disagreement there
  as *both* a miss and a false positive. If any of those four reads to you as a coin-flip,
  tell me: it would mean the answer key asserts a distinction that is genuinely a judgement
  call, and the case is double-penalising it.

**Sign-off:** reply "UAT passed", or tell me what to change.

---

## What this card cannot claim

The fixtures are written by the same person who will read the results, about an invented
product. They are adversarial on purpose but they are not real meetings, and no number
measured on them transfers to real transcripts without saying so (`docs/assumptions.md`).

**On editing labels now.** `evals/README.md` rule 2 says labels are never edited to match
output, and the extraction prompt now exists — so the free window this card originally
described has closed. What remains legitimate is correcting a label that is **wrong on its
own terms**: a requirement the transcript plainly contains that nobody wrote down, or a
labelled item that is not a requirement at all. What is not legitimate is changing a label
*because the model disagreed with it*. The test is whether you would make the same edit
having never seen an extraction result — and since you have not seen any, this is the last
moment that test is easy to apply honestly.

Any label change re-runs C1 and C2, and is recorded in `evals/results/README.md` with its
reason.
