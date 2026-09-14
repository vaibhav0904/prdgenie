# BUG-018: The prompt forbids the exact requirement the answer key demands

**Found while:** BUG-004, when the structural fix made T3 recall unstable and the misses were
read rather than assumed
**Severity:** major — C1 fails roughly one run in three, and the failure is the extractor
obeying its instructions correctly
**Needs a decision from Vaibhav.** See "The question". **Nothing is being changed until it
comes back** — BUG-009's lesson, applied.
**Review page (G6b), sent 2026-09-02:** https://claude.ai/code/artifact/4781cbc7-3f8f-4db0-aa85-04929dda7550

## The finding, in two quotes

The extraction prompt, line 44:

> A decision described as provisional — **"let's call it cut for now"**, "we'll come back to
> it" — is not settled either.

`T3-R07`, in the answer key, with its three supporting quotes:

> "I want to cut the tablet view from the pilot." · **"Let's call it cut for now."** ·
> "I'd want it back in the release after"

**The prompt uses this requirement's own quote as its worked example of something that must
not be extracted.** A model that skips T3-R07 is following instructions exactly. A model that
extracts it is ignoring them and happening to agree with the labels.

## How it got here

Neither half was wrong when it was written.

- The prompt clause was added in E2-S2, to stop the model reporting one side of an unsettled
  argument as a decision. The tablet exchange was the case it was written against, because at
  the time the tablet cut was **`T3-Q03`, a labelled conflict.**
- On 2026-09-02 Vaibhav's label review read that same exchange as a decision taken over a
  registered dissent, withdrew `T3-Q03`, and added the scope decision as **`T3-R07`**.

The relabel was right on its own terms and is recorded. What nobody did — me — was ask what
else in the system had been built to treat that passage as unsettled. **The prompt had, by
name, quoting the sentence.**

## Why it was invisible for six runs

Runs 4, 5 and 6 on 2026-09-02 all scored T3 recall 100%: the model extracted T3-R07 despite
being told not to. The contradiction was live and silent because the instruction was being
ignored about a third of the time — the same unreliability BUG-007 recorded, working in our
favour by accident.

BUG-004's structural change (naming `document_subject` and a per-requirement `subject`) made
the model apply its exclusion rules more consistently. So it began obeying the clause, and the
contradiction surfaced as a recall regression:

| T3, prompt `7267c39b005e` (before) | recall | T3, prompt `5ad1a07854f1` (after) | recall |
|---|---|---|---|
| run4 | 100% | run8 | 85.7% |
| run5 | 100% | run9 | **71.4%** |
| run6 | 100% | run10 | 100% |

**A more obedient model scored worse.** That is the shape of this bug.

## The question, which is not mine to answer

`T3-R07` and the prompt clause cannot both stand. Three ways out, and they are not equivalent:

1. **Keep T3-R07; narrow the prompt clause.** Distinguish *"provisional, and nobody owns it"*
   (an open question) from *"decided for this release, with a dissent and a follow-up"* (a
   constraint). This matches Vaibhav's reading — Wei said *"I'm okay with you deciding it"*,
   and the scope of the pilot genuinely changed. **Cost:** the clause gets harder to state,
   and the boundary between the two is exactly the judgement E3-S4 exists to make. There is a
   real risk of re-opening BUG-007 from the other side.
2. **Keep the prompt clause; reconsider T3-R07.** If *"let's call it cut for now"* is too
   provisional to be a requirement, the label is wrong and the extractor has been right all
   along. **Cost:** this reverses part of the 2026-09-02 review, and it would mean the tablet
   cut is neither a requirement nor a conflict — it would be nothing, which is the outcome
   nobody argued for.
3. **Keep both and accept the contradiction**, reporting T3 recall honestly as unstable.
   **Cost:** C1 fails about one run in three for a reason we have written down and chosen not
   to fix, which makes the gate meaningless.

**Recommendation withheld when the card was filed** — given on request 2026-09-02, see the section at the end. BUG-009's card named a decision as Vaibhav's, then
recommended an implementation, and the recommendation got built before the decision came back
— two hours deleted. This one is his reading of his own relabel, so it goes over as a
question.

## Secondary observations, not the main finding

- Run 9 also missed **T3-R05** ("an admin can see which dashboards have not been opened in
  thirty days"), which no clause excludes. One miss in three runs; noise until it repeats.
- A new false positive appeared: *"Nobody adds a fourth without me"* — an over-split of
  T3-R06, which it restates. Worth watching, not worth a card yet.
- **T1 is unaffected**: 86.7%, 93.3%, 86.7%, inside the range measured before the change.
- **G1 is fixed and stable**: 0 requirements in 3 of 3 runs, parked every time.

## Lesson

**A label change has a blast radius, and the prompt is inside it.** `evals/README.md` rule 2
governs *when* a label may change and says nothing about what else must change with it. The
review that produced T3-R07 checked the transcript, the label file, the verifier's counts, C4's
threshold and E3-S6's premise — and not the prompt, which is the one artefact that had been
written specifically about that passage.

The general form: **when ground truth moves, everything that was built against the old ground
truth is suspect, including the things that are not code.** A relabel is not a data edit; it
is a specification change with dependents.

## Recommendation — asked for on 2026-09-02, given, still not built

The card withheld one on BUG-009's grounds. Vaibhav asked for it directly, so it is recorded
here. **Nothing changes until he picks an option.**

**Option 1 — keep `T3-R07`, narrow the clause.** In order of weight:

1. **Option 2 has closed on its own.** The relabel was legitimate because nothing extracted
   open questions yet, so no result existed to tune toward. Reversing it *now* would be a
   label change made **after watching the model fail on that label** — the one move
   `evals/README.md` rule 2 forbids. It stays available on the merits, but it would have to
   ship with "changed after seeing the failure" beside it, and that footnote discounts every
   T3 number.
2. **Option 3 is not a third option.** A gate that fails one run in three for a reason we
   wrote down and declined to fix has stopped being a gate.
3. **The clause is keyed on tone, which is BUG-007's defect in a different hat.** It watches
   for hedging words — *"for now"*, *"we'll come back to it"*. The real distinction is a fact
   about the document: **did someone with authority settle it, or explicitly decline to?**
   Both cases are in T3, twenty lines apart: Wei's *"I'm okay with you deciding it"*
   (settled, `T3-R07`) against Marcus's *"I'm not settling that in this meeting"*
   (`T3-Q01`).
4. **It is controllable both ways with the fixture we already have** — which was not true
   when the clause was written. T3 now carries one settled decision that must appear and two
   live disagreements that must not. One fixture measures the fix and its regression at once.

**Proposed replacement clause**, for Vaibhav to accept or redraft:

> An argument is unsettled when the document contains **no decision** — nobody with authority
> settles it, or someone explicitly defers it. A decision that is **made and accepted is a
> requirement**, even when the wording is casual, and even when someone registers a dissent or
> a follow-up condition. The dissent is an open question; the decision is still a requirement.

It also produces *both* halves of the tablet passage once E3-S4 exists: the scope cut as a
constraint, and Wei's *"tell Northwind before their supervisors find out"* as a follow-up.

**Side benefit:** it removes a verbatim sentence of a labelled fixture from the prompt. Part
of what C1 currently measures is whether the model pattern-matches a string it was handed.
**A prompt should not quote the answer key.**

**Cost, plainly:** C1 re-run three times on T1 and T3, plus an explicit check that `T3-Q01`
and `T3-Q02` stay out of the requirement list. If T3 precision drops, one failure has been
traded for another and the answer is to come back to Vaibhav — not to nudge the wording until
it goes green.

## Fix applied — 2026-09-02, prompt `5ad1a07854f1` → `47ac49c6330b`

One exclusion bullet, and nothing else. The old text keyed on **hedging words**; the new one
states a test on a **fact about the document**:

> **The test is whether the document contains a decision — not how confident the wording
> sounds.** A disagreement is unsettled when nobody with the authority to settle it does, or
> when someone with that authority explicitly defers it. It **is** settled when a decider
> decides and the other party accepts, and it stays settled when the phrasing is casual and
> provisional, and when the person who gave way records a dissent or a condition on top of
> it. **Casual wording is not deferral, and a dissent registered after a decision is not an
> open disagreement** — extract the decision as a requirement, and leave the condition
> attached to it alone.

The examples in it are invented. The clause no longer quotes T3, which is a fix in its own
right — see the new check below.

## Outcome — partly delivered, and the shortfall is not a mystery

Three graded runs, `2026-09-02-C1-run11/12/13`:

| | before BUG-004 | this card opened at | **now** |
|---|---|---|---|
| T3 recall | 100 / 100 / 100 | 85.7 / 71.4 / 100 | **85.7 / 100 / 100** |
| T3 precision | 77.8 (4 of 4) | 75.0 / 77.8 / 77.8 | **75.0 / 77.8 / 77.8** |
| T1 recall | 86.7–93.3 | 86.7 / 93.3 / 86.7 | **86.7 / 86.7 / 86.7** |
| C1 | fails ~1 in 3 | fails ~1 in 3 | **passes 3 of 3** |
| C2 | — | passes 3 of 3 | **passes 3 of 3** |

**C1 is green, which is what this card blocked.** It is green *marginally* — run 11's T3
precision is exactly on the 0.75 floor — and that belongs beside the word "green" every time
it is said.

**`T3-R07` came back in 2 of 3 runs, not 3 of 3.** Pooled with the negative control the
new clause carries it in 4 of 6, the old bullet in 2 of 6. Better, and one run wide: nobody
should read a 6-run difference as a measurement.

**`T3-Q01` is untouched.** Both sides of the SAML/self-serve argument are still extracted as
requirements, 3 runs of 3, even though the new clause describes that case in the document's
own structure rather than its tone. Recorded as BUG-007's third data point, with the
conclusion that **the next change there is E3-S4 or nothing.**

**So the honest summary is:** the contradiction is gone, the gate is unblocked, and the
underlying behaviour — an instruction to withhold is obeyed about two runs in three — is
exactly where BUG-004 and BUG-007 already found it. **A fourth prompt iteration is not the
answer. E3-S4 is**, and it is now the fix for two closed cards rather than one.

## Two instruments were wrong, and the control is what found them

Neither was in the product. Both were in checks written the same afternoon, and both had
already reported PASS.

1. **`verify-prompt-hygiene.mjs` could not catch its own founding case.** It compared the
   full label quote, `"Let's call it cut for now."`, against a prompt that read
   `"let's call it cut for now"` — **one full stop apart**, so the substring test missed. It
   had reported *"PASS — no prompt quotes any labelled fixture"* on a prompt that did.
   Fixed by trimming punctuation at each end before comparing; interior punctuation is left
   alone, because that really is a different sentence.
2. **The control read `/healthz` as "n8n is ready".** It is green well before the production
   webhooks re-register, so all six runs got HTTP 404 from the door — and the control read
   six empty runs as *"T3-R07 missing"* and **passed** one of its assertions on them. That is
   BUG-001's shape exactly: an assertion satisfiable by absence. Fixed by probing the door
   itself (n8n's two 404 bodies differ) and by refusing to interpret a run that did not
   execute.

**The general form, and it is the more useful half of this card:** *a check that has only
ever been run in its passing direction is not a check.* Both of these were green. One was
green because it could not see its subject; the other was green because its subject never
ran.

## Standing checks added

- `evals/harness/verify-prompt-hygiene.mjs` — **no prompt may quote any labelled fixture.**
  109 quotes × every prompt, coverage asserted, short quotes skipped as collision-prone and
  counted. Where a prompt quotes the answer key, part of C1 is measuring string matching.
- `evals/harness/negative-control-clause.mjs` — swaps the bullet back, byte-compares the
  restore, and states in its own header which half of it is deterministic and which half is
  three runs wide.
