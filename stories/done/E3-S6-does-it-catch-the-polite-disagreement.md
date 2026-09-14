# E3-S6: Does it catch the polite disagreement?

> **Re-scoped 2026-09-02, approved by Vaibhav.** This story used to be "build C4". It is now
> "build the fixture C4 needs, then build C4."
>
> It was written around **T3-Q03**, the tablet exchange — the one labelled conflict phrased
> as agreement, and the only case in the dataset that punished a system for keying on tone.
> Vaibhav's label review read it as a decision taken over a registered dissent, not an
> unsettled argument: Wei says *"I'm okay with you deciding it"*, Marcus closes with *"Let's
> call it cut for now."* The label was withdrawn and the scope decision inside it became the
> constraint **T3-R07**.
>
> T3's two surviving conflicts are both explicit — *"I'm not settling that in this meeting"*
> and *"The templates are not small"*. A C4 built on those measures whether the model finds
> disagreements that announce themselves, and PRD-E3 already decided that finding only those
> is a sentence, not a score.
>
> **Relabelling T3 back is not available.** That would be editing the answer key to keep a
> story alive, which is exactly what `evals/README.md` rule 2 forbids. The coverage has to
> be replaced with new data, not recovered by changing our minds about old data.

**As a** builder
**I want** case C4 measuring ambiguity detection against labelled conflicts, on a dataset that
contains disagreements the model has to *read* rather than hear
**So that** "surfaces what the room never settled" is a number with a sample size rather than a claim in a deck

## Acceptance criteria

### Part 1 — the fixture (new, and blocking)

- [ ] A new transcript fixture **T4** exists at `evals/datasets/docs/T4.json`, written to the
      same standard as T1 and T3: a real meeting shape with interruptions, tangents and at
      least one participant who joins late.
- [ ] T4 carries **at least three labelled `conflict` items, of which at least two are
      implicit** — phrased as assent, deference, a joke, a "sure, but", or agreement to a
      premise the speaker then quietly contradicts. One explicit conflict is included as a
      control so the case can report the two kinds separately.
- [ ] T4 carries **at least one decoy**: an exchange that *sounds* unsettled and is in fact
      decided, labelled as a requirement or constraint and **not** as a conflict. Without a
      decoy, C4 rewards a model that flags every disagreement-shaped passage, and precision
      on conflicts is unmeasurable. *(T3-R07 is now exactly this shape and is the model to
      follow.)*
- [ ] Labels are written **before any extraction is ever run against T4**, and
      `evals/datasets/labels/T4.labels.json` carries the rule verbatim like every other
      label file.
- [ ] `verify-labels.mjs` covers T4 with an **exact** count pin, not a range, and its quotes
      resolve against `raw_text` — 100% of them, checked before the file is saved.
- [ ] Vaibhav reads T4 beside its labels and signs off that the implicit conflicts are
      genuinely disagreements and the decoy is genuinely decided. **This is a judgment UAT
      and ships as one page (G6b).** It is the same review that caught T3-Q03, and it must
      happen *before* C4 is built, not after.

### Part 2 — the case

- [ ] `evals/cases/C4-ambiguity-detection.md` exists with its threshold, the third-verdict
      rule, the stories it gates, `Automated? YES`, and a *re-run when:* list.
- [ ] **The threshold is set once T4 exists and before C4 is first run against real output.**
      A threshold chosen after seeing a score is not a threshold. The old "≥2 of T3's 3" is
      void and must not be carried over by habit.
- [ ] **Implicit and explicit conflicts are scored and reported separately**, never averaged.
      Averaging is how a system that finds only the loud ones reports a respectable number.
- [ ] `conflict` and `unanswered` items are matched **by span overlap** (ADR 0008).
- [ ] `missing_nfr` items are matched **by category**, never by span, and are reported
      **separately** — never averaged into the span-matched score (ADR 0008 amendment).
- [ ] **The decoy is scored**: flagging a decided exchange as a conflict is a false positive
      and is counted as one.
- [ ] A reported conflict not in the labels yields `PASS-PENDING-MANUAL-REVIEW` with the item
      listed for a human, not a silent fail. It may be a genuine find the labels missed —
      **and on 2026-09-02 exactly that happened in reverse**, so this rule has now earned its
      place twice.
- [ ] The result states the **sample size beside every figure**: "2 of 3" never appears as
      "67%".
- [ ] If the implicit conflicts are consistently missed, the result says so **in words** —
      *"finds explicit disagreements, misses implicit ones"* — rather than reporting a
      percentage (decided 2026-09-01, unchanged).
- [ ] **Negative control run once**: suppress detection, confirm C4 goes red, restore.
- [ ] **Added 2026-09-02 (BUG-007, BUG-024): C4 also grades `unsettled_positions`.** The
      extractor now emits them beside its requirements, and **nothing measures what lands
      there** — C1 grades requirements, C2 grades grounding, and a position filed wrongly is
      grounded, cited and correctly shaped, so every existing check is green on it. On T1, in
      1 run of 3, a **settled** argument was filed as unsettled (BUG-024).
- [ ] T4's labels therefore carry expected **unsettled positions** as well as conflicts, and
      the **decoy is scored twice**: flagging a decided exchange is a false positive whether
      it arrives as a `conflict` open question or as an unsettled position.
- [ ] **The two outputs are reported separately**, never summed. They come from different
      model calls with different prompts, and one being right does not make the other right.
- [ ] Coverage asserted (BUG-003).

## Depends on
- **E3-S4** — done. It built the gap detector whose output this case grades.
- ~~E3-S5~~ — **dropped 2026-09-02, and checked rather than assumed.** E3-S5 builds C3:
  structure, linkage and RICE recomputation, none of which C4 reads. C4 grades open questions
  and unsettled positions, both of which exist today. The listing was epic sequencing, not a
  technical dependency, and starting this story does not require building clustering,
  story-drafting and scoring first. *If that turns out to be wrong, the story stops and says
  so rather than quietly building E3-S1 to E3-S3 inside itself.*

## Eval gate
- **C4** — built here and must leave a verdict, which may legitimately be
  `PASS-PENDING-MANUAL-REVIEW`.

## What is waiting on this story

**Three bug cards, and all three say the same thing in different words.**

| Card | Waiting for |
|---|---|
| **BUG-020** | `missing_nfr` is enumerated, not detected — all six categories on two fixtures. Cannot be tuned without a case that says whether a change helped. |
| **BUG-023** | the deadline extracted 1 run in 11; diagnosed, and its remaining hypothesis touches contested passages, which is what T4 is made of. |
| **BUG-024** | a settled argument filed as unsettled, 1 run in 3. Invisible to every existing check. |

Vaibhav chose this story out of order on 2026-09-02 for exactly that reason.

## Technical notes

- **A sample of one implicit conflict is not a measurement**, which is the position the
  dataset was in before T3-Q03 was withdrawn and nobody noticed because the item existed.
  Three conflicts with two implicit is the floor, and the case must still print the counts
  rather than a rate.
- **Write the decoy first, then the conflicts.** Written the other way round, the decoy tends
  to come out as a watered-down conflict rather than a real decision, which is how T3-Q03
  went wrong: it was written to be adversarial and read, to a PM, as settled.
- The `missing_nfr` split exists because category matching is cheap to game — a model could
  score well by reciting the checklist without reading the document. Keeping the halves apart
  is what stops the honest half being diluted.
- If C4 fails, PRD-E2's rule applies by analogy: at most three prompt iterations, then a BUG
  card naming the *failure pattern*. The threshold never moves and labels are never edited.
- Expect the implicit conflicts to be the hard ones. Missing them is an honest description of
  the capability, not a defect to tune away — and the deck should say which kind of
  disagreement this system finds.

## What this story cannot claim

T4 will be written by the same people who read its results, about an invented product, and
its implicit conflicts will be implicit *in our judgment*. The one guard that survives that
is Vaibhav signing off on the labels before any output exists to compare them against — which
is the guard that worked on T3-Q03, at the cost of three prompt iterations spent first.

---

## DONE — 2026-09-02. C4 exists, and it fails honestly

**Part 1: T4.** A transcript with three conflicts (one explicit control, two implicit), a
decoy written first, and six unsettled positions. `verify-labels` **19/19**, with exact count
pins and a separate pin on the implicit count.

**Part 2: C4.** `evals/cases/C4-ambiguity-detection.md` + `evals/harness/cases/C4.mjs`,
registered in the stranger. Two hard rules, four reported-with-no-threshold rows, the third
verdict, and a control that moves it in both directions.

| | run 2 | run 3 | run 4 |
|---|---|---|---|
| R1 explicit conflict found | 0/1 | **1/1** | 0/1 |
| R2 decoy not flagged | pass | pass | pass |
| Implicit conflicts | 0/2 | 1/2 | 0/2 |
| Verdict | **FAIL** | PASS | **FAIL** |

**The story is done and the case is red.** That is the acceptance criterion as written: the
case must exist and leave a verdict. Making it green would have meant moving a threshold that
was chosen before the first run, which is the one thing `evals/README.md` forbids outright.

### Two guards, one of them lost

E3-S6 required Vaibhav to sign off on T4's labels before C4 existed. **He delegated it back**
(*"I will go with your suggestion"*), so the second reader — the guard that caught `T3-Q03` —
is absent, and every C4 number now carries that sentence in the case file.

The mechanical half was installed instead, **before the first run**: T4's labels are frozen at
`sha256[0:16] = 3bac9d940f97d88c`, and `verify-labels` TC12 goes red if they move. *"Never
edit labels to match output"* stopped being prose today.

### What it found

- **BUG-025 filed:** the detector misses an announced deferral 2 runs in 3 while the extractor
  finds it 3 of 3. Two components reading the same document disagree, and the accidental
  cross-check is the only reason anyone can tell.
- **`missing_nfr` is zero on T4** in all three runs — BUG-020's enumeration is
  fixture-dependent.
- **The decoy was never flagged, 9 of 9.** The one clean result, and the property T4 was
  written to test.

### One defect fixed on the way in

`verify-labels.mjs` printed *"nine fixtures exist"* while ten sat on disk and passed — its
expected set was a floor. **T4 could have been graded carrying no count pin at all.**
