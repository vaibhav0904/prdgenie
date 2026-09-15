# AI product principles, and where each one lives in PRD Genie

Forty-five principles for building a product on top of a language model, each with the place in
this repository where it is enforced, measured or written down. Where a principle is only partly
applied, the entry says so — the gaps are part of the record, not a footnote to it.

Figures are the ones the repository quotes. The grounding and review figures are a **dated
snapshot** (slide 7 of the deck says so): the test suite sends real documents through, so the
counts grow every time it runs.

**Contents** · [Framing](#framing-the-problem-and-the-claim) ·
[Groundedness and trust](#groundedness-and-trust) · [Human in the loop](#human-in-the-loop) ·
[The model's job](#what-the-model-is-and-is-not-allowed-to-do) · [Evals](#evals) ·
[LLM as judge](#llm-as-judge) · [Safety and privacy](#safety-and-privacy) ·
[Reliability](#reliability) · [Metrics](#metrics-and-monitoring) ·
[How it was built](#how-it-was-built) · [Where it falls short](#where-it-falls-short)

---

## Framing the problem and the claim

### 1. Solve the reason people stop using the tool
Meeting-to-requirements tools lose their users around week three, because one line that nobody
said forces a re-read of the transcript. So the product is built around *checking* a line in one
click, not around drafting faster. → [README](../README.md), [problem write-up](../deliverables/problem-and-approach.md)

### 2. Separate a hypothesis from a promise
"It reduces time to a draft" and "citations reduce checking effort" are listed as **unmeasured**,
each with the study that would measure it. → [assumptions.md, *What is a hypothesis, not a promise*](assumptions.md)

### 3. No improvement claim without a baseline
There is no "hours saved" figure anywhere. The only person available to time the manual way also
wrote the answer keys, so that baseline was declined — and recording it would have silenced the
"illustrative" caveat on every report. `baseline_status` stays `none`. → [E8-S3](../stories/done/E8-S3-a-baseline-that-refuses-to-be-a-percentage.md)

### 4. Write the scope line down
English plain text, four document types (transcript, notes, email, feature brief), up to about
15k characters. No PDFs, audio or other languages — stated, not left to be discovered. → [evals/README.md, *Designing a dataset*](../evals/README.md)

## Groundedness and trust

### 5. Groundedness is checked by code, never certified by the model
Every requirement carries a quote. Code looks for it in the stored source text — exact, then
whitespace-normalised, then not found. A model that supplies its own `grounded` value is a schema
violation. **96.91% of 8,763 stored requirements have their exact sentence.** → [ADR 0003](adr/0003-the-quote-is-authoritative-not-the-offset.md)

### 6. Show uncertainty instead of hiding it
A requirement whose quote is not found turns amber and says so. The caveat line above a document
is computed from its state, never written as prose. → [reporting.md](reporting.md)

### 7. Prefer the strict definition to the flattering one
A lightly paraphrased quote counts as ungrounded, which undercounts on purpose. The grounding rate
excludes requirements a reviewer edited and documents the PM wrote: editing must never raise the
rate, and being quoted back to yourself is not evidence. → [metrics.md, M1](metrics.md)

### 8. Every output has a provenance
A `trace_id` is minted once, at the door, and every trace ends in a recorded fate — approved,
parked or dead-lettered. Every model call logs its prompt's content hash, model, tokens, latency
and cost; every judge score carries its rubric's hash. → [traceability.md](traceability.md)

## Human in the loop

### 9. The human decision is enforced by the system, not by convention
A database trigger refuses any route to `approved` except the review UI's sign-off endpoint — on
`UPDATE` and on `INSERT`, so a row cannot even be born approved. One command goes around the whole
application and prints the refusal. → [ADR 0006](adr/0006-enforce-the-approval-gate-in-the-database.md), `.\run.cmd review-ui/scripts/prove-the-gate.mjs`

### 10. Readiness is recomputed where the decision is made
The disabled Sign off button is a courtesy. The endpoint recomputes from the rows that every item
has a decision, and a direct call mid-review is refused and told what is left. → [architecture.md, *Guardrails*](architecture.md)

### 11. Overrides are allowed, reasoned and counted
An amber line cannot be approved with the plain button. **Approve anyway** is a separate decision
that requires a reason, so the number of times a person overruled the check is a number. Every
channel that accepts a decision must require the reason. → [reporting.md, rule 4](reporting.md)

### 12. Update the document instead of regenerating it
A follow-up meeting produces a change list — added, modified, contradicted — with the document's
sentence and the new sentence side by side, each linked to its source. A person picks. Versions
are never edited. → [ADR 0005](adr/0005-prd-versions-are-immutable.md)

### 13. Do not let the AI guess where a wrong guess corrupts silently
The PM names which document a follow-up belongs to. The system never matches it automatically:
a failed match would quietly change the wrong document, and a dropdown costs two seconds. → [assumptions.md, *Product assumptions*](assumptions.md)

## What the model is and is not allowed to do

### 14. The model never writes a number that ships
RICE scores are arithmetic in code, and eval case C3 recomputes every stored score from its
factors. The weekly report drops the model's whole commentary paragraph if it contains a digit.
→ [ADR 0004](adr/0004-judgment-in-n8n-determinism-behind-http.md), [reporting.md, rule 2](reporting.md)

### 15. Judgement in the workflow, determinism behind a testable endpoint
The test for where logic lives: *would the eval harness have to reimplement it to check it?* If
yes, it is an endpoint the harness and the workflow both call. → [ADR 0004](adr/0004-judgment-in-n8n-determinism-behind-http.md)

### 16. Give each step only what it needs
The step that groups requirements into features, and the one that drafts stories, never see the
source text — only ids and statements — and every id they return is checked against the list they
were given. → [architecture.md, *Guardrails*](architecture.md)

### 17. Size the model to the task and the budget
A non-reasoning mini model does the work. Being honest about quality costs about 160 model calls
per reported figure, and that budget is the real constraint. The decision concedes where a
reasoning model would do better. → [ADR 0001](adr/0001-non-reasoning-doer-and-cross-vendor-judge.md)

### 18. One door to the providers
One workflow, WF0, holds the provider credentials and makes every model call, so cost logging
cannot be bypassed: the credential is the enforcement. → [architecture.md](architecture.md)

## Evals

### 19. The answer key comes first
Hand-written labels for ten invented meetings, written before any tuning and never edited to make
a test pass. The rule is in each dataset file's header. → [evals/datasets/](../evals/datasets/)

### 20. Build the dataset adversarially
A happy path, an ambiguous case, a garbage document, a hostile one with hidden instructions, a
contact-detail-heavy one, and every document type. → [assumptions.md, *Dummy data*](assumptions.md)

### 21. One eval per claim, and a coverage matrix that admits holes
Every capability maps to the case that covers it, or to **NONE — chosen** or **NONE — pending**.
The follow-up case, C5, is listed as not built rather than left out. → [evals/README.md, *Coverage matrix*](../evals/README.md)

### 22. The fatal failure is not a low score
A hallucinated requirement marked grounded fails at any accuracy. One obeyed injected instruction
fails the case outright. → [evals/README.md, *Case template*](../evals/README.md)

### 23. No tunable number inside the measuring instrument
An extracted requirement matches a label when its quote comes from the same region of the source —
no similarity threshold, nothing to tune after seeing results. → [ADR 0008](adr/0008-match-eval-items-by-span-overlap.md)

### 24. Test both directions
Contact-detail removal must remove 13 values **and** keep 22 names. Before the second list existed,
a rule deleting every capitalised word would have scored perfectly. → [evals/README.md](../evals/README.md), [C2](../evals/harness/cases/C2.mjs)

### 25. Report each segment; never average
Extraction quality is reported per document type. An average can hide one broken door. → [evals/README.md, *Coverage matrix*](../evals/README.md)

### 26. Report the spread, not the best run
Three full rounds before a figure is quoted, published as a range. Extraction passes **two runs in
three**, and that is what the README says. → [reporting.md, rule 6](reporting.md), [BUG-068](../stories/backlog/BUG-068-closing-bug-040-did-not-settle-c1-the-straddle-moved.md)

### 27. Thresholds are set before the first run and do not move
The ambiguity case, C4, came back FAIL / PASS / FAIL and is reported that way. A new injection
payload is reported separately rather than folded into the 100% floor. → [evals/README.md](../evals/README.md)

### 28. Know what invalidates a result
Every case lists the prompts and configurations whose change makes its last result stale. → [evals/README.md, rule 5](../evals/README.md)

### 29. Evals fail loudly
A FAIL is a non-zero exit code. A missing run prints the command that produces one. → [evals/README.md, rule 6](../evals/README.md)

### 30. Test the tests
32 of the 51 checkers have a negative control — a script that breaks the thing on purpose and
requires the checker to go red. The 19 without one are named on every run. *A check that repairs
what it checks is always green.* → `.\run.cmd review-ui/scripts/check-control-coverage.mjs`, [CLAUDE.md](../CLAUDE.md)

### 31. Inject the fault to prove the failure path
A real 60-second timeout, a malformed response and a removed credential, each driven through the
real workflow and required to park with the right reason. → [evals/README.md, *LLM failure degrades*](../evals/README.md)

## LLM as judge

### 32. The judge monitors; it never gates
A model from a different vendor judges the output after the fact, on a bounded random sample. It
never sees the answer key, has no fallback to the doer's vendor, and a check fails the build if
any gate, threshold, metric or report reads it. Persistent disagreement opens a card that
investigates the rubric and the labels equally. → [evals/README.md, *Judges*](../evals/README.md), [ADR 0001](adr/0001-non-reasoning-doer-and-cross-vendor-judge.md)

## Safety and privacy

### 33. Untrusted text is data, never instructions
Three layers, none trusted alone: source text only inside a fenced `DATA, NOT INSTRUCTIONS` block;
closed output schemas with nowhere to obey an instruction usefully; and a code tripwire that parks
the whole run and stores none of the payload. **3 of 3 known payloads resisted** — a claim about
those three, never a general one. → [ADR 0007](adr/0007-layered-injection-defense-with-a-measured-floor.md)

### 34. Refuse when the honest answer is nothing
A meeting about parking produces zero requirements, 3 runs of 3. The fix was structural — the model
states whether the document concerns the product, and code parks on it — after four rounds of
stronger prohibition prose failed. *A prohibition holds about two runs in three; a redirect holds.*
→ [BUG-004](../stories/done/BUG-004-invents-requirements-from-nothing.md)

### 35. A privacy rule needs a product reason, and its cost written down
Contact details are removed; names are kept, because a requirement is only reviewable if you know
who asked for it. The rule reversed an earlier one, and the record says what it costs. → [assumptions.md, *Product assumptions*](assumptions.md)

### 36. Secrets never enter the repository
Model keys live only in n8n's encrypted credential store, not in `.env`. The workflow export check
fails on any key pattern. → `.\run.cmd n8n/scripts/check-export-hygiene.mjs`

## Reliability

### 37. Degrade to a visible park, never a confident wrong answer
Every failure parks with a reason from a closed set. No silent switch to another vendor. Malformed
JSON is retried once; an auth or quota failure is not, because asking again cannot pass. → [architecture.md, *Readiness and degradation*](architecture.md)

### 38. Tolerating a bad answer must not tolerate no answer
An outage was once recorded as a successful, billed run. Now a call the product needs stops the
run; a telemetry call does not. → [BUG-028](../stories/done/BUG-028-an-outage-is-recorded-as-a-successful-run.md)

### 39. An operator can see what died
An error workflow writes every dead run to a queue with its reason and trace id. → [reporting.md, *Needs attention*](reporting.md)

## Metrics and monitoring

### 40. Every metric maps to a pain, a query and an owner
Five metrics — grounding rate, lines accepted without an edit, edits per requirement, time to
approval, cost per approved document — each with its exact definition, its SQL and who acts on it.
→ [metrics.md](metrics.md)

### 41. Guardrail metrics travel in pairs
Acceptance appears beside extraction recall; time to approval beside edits, so rubber-stamping
shows; cost beside the quality it bought. → [reporting.md, rule 5](reporting.md)

### 42. Every number says what it was counted over
Counted over everything stored, approval took **one second** — those were automated tests signing
things off. Counted over real runs only: **two minutes**. Both columns ship. → [deck, slide 7](https://vaibhav0904.github.io/prdgenie/deliverables/deck/presentation.html#7)

### 43. Recompute independently
The shipped SQL and a separate JavaScript recomputation from raw rows agree on 8 of 8 figures. → [metrics.md](metrics.md)

### 44. Caveats are computed, never remembered
*No baseline, so efficiency is illustrative.* *Fewer than three approvals this week.* *The eval
archive is older than the prompts.* Each renders from state. → [reporting.md](reporting.md)

### 45. Each audience gets its own report
The PM gets the review screen; the operator, the attention queue; the owner, a weekly report; the
builder, the eval archive. The pilot participant's report is written down as deferred. → [reporting.md, *Audiences*](reporting.md)

---

## How it was built

Practices rather than product principles, but they are why the forty-five above can be believed.

- **Prompts are versioned source.** They live in [`n8n/prompts/`](../n8n/prompts/) and are hashed
  into the workflows; nobody edits a prompt inside n8n.
- **Never tune to the output.** On a failing check: diagnose, write a card, revert. Workarounds get
  cards too — the open ones are in [`stories/backlog/`](../stories/backlog/).
- **Say the biggest gap first.** "No authentication" is the first line of
  [assumptions.md](assumptions.md) and of the setup guide.
- **Decisions keep their alternatives.** Each [ADR](adr/) names what was rejected and concedes what
  the rejected option did better.
- **Go receive what you ship.** Following the setup from a fresh clone found three defects the
  author's own machine never could ([BUG-078](../stories/done/BUG-078-the-readme-said-env-drives-the-callback-address-and-nothing-reads-it.md),
  [BUG-083](../stories/done/BUG-083-the-clone-fails-on-windows-before-anyone-reads-a-word.md)).
- **A check that proves something is gone cannot tell you what replaced it.** A word-for-word
  clean-up passed every check and left nonsense behind
  ([BUG-085](../stories/done/BUG-085-the-scrub-wrote-stranger-where-it-meant-the-grader.md)).
- **The demo cannot overclaim.** The deck refuses to build if a count on a slide disagrees with the
  repository, and the demo film's narration comes from the same run sheet that drives the browser.

## Where it falls short

- **No authentication, one reviewer.** The gate proves the pipeline cannot approve; it proves
  nothing about who the approving person is.
- **No cost ceiling.** Cost is logged per call; nothing stops a very large document.
- **The follow-up eval (C5) is not built**, and the change list has missed a real contradiction once
  and invented one once.
- **No human baseline**, so no efficiency claim.
- **19 checkers still have no negative control.**
