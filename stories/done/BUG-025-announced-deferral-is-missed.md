# BUG-025: The detector misses an announced deferral two runs in three — while the extractor finds it three of three

**Found by:** C4, on its first three runs — the case built to find exactly this
**Severity:** major — it is the easy half of the capability this epic exists to deliver, and
the component that was built for it is worse at it than the component that wasn't

## The finding

T4 contains one **explicit** conflict, `T4-Q01`. It ends with a person who can decide saying,
in as many words:

> *"Park it… Write both positions up and we'll take it next week."*
> *"It's not being decided in this meeting."*

| | run 2 | run 3 | run 4 |
|---|---|---|---|
| **Gap detector** reports it as a `conflict` | no | **yes** | no |
| **Extractor** files both sides in `unsettled_positions` | **yes** | **yes** | **yes** |
| C4 verdict | FAIL | PASS | FAIL |

**Two components read the same document, and they disagree about whether there is an argument
in it.** The one that is right in 3 of 3 is the one that was not built for the job.

## Why this is the interesting shape and not just a miss

`detect-ambiguity` exists **only** to find unsettled things. It is given the document and the
requirement list, and its whole prompt is about what was left open. It finds an announced
deferral **one run in three**.

`extract-requirements` was given a second box on 2026-09-02 (BUG-007) so it would stop
shipping contested positions as agreed requirements. Finding the argument is a side effect of
its actual job, and it does it **every run**, with both sides, correctly attributed and
grounded.

The obvious reading is that a model asked *"what did this document leave unresolved?"* is
answering a harder and vaguer question than one asked *"is this sentence agreed, and if not
where does it go?"* — but that is a hypothesis, and this card does not act on it.

## What else C4 measured on the way

Reported here because they are the same three runs and they are all new information:

- **Implicit conflicts: 0, 1, 0 of 2.** *"Finds explicit disagreements, misses implicit ones"*
  is roughly the story — except the explicit one is unreliable too, which is worse than the
  sentence suggests.
- **`missing_nfr`: zero on T4, in all three runs.** BUG-020 found all six categories
  enumerated on F1 and H1. **The enumeration is fixture-dependent, not universal** — which
  BUG-020 did not know and should not be diagnosed without.
- **Unsettled positions: 2 of 6, in all three runs** — the invites argument's two sides, every
  time, and neither implicit argument ever.
- **T3, the secondary: 1 of 2 explicit conflicts**, all three runs.
- **The decoy was never flagged**, in either output, in any run. `T4-R02` — the SSO cut,
  the most heated passage in the document — was correctly read as decided **9 times out of 9**
  across the two outputs and three runs. **That is the one clean result here**, and it is the
  property the fixture was built to test.

## Not diagnosed, deliberately

Three candidates, and they are cheap to separate before anything is changed:

1. **The detector never sees the extractor's positions.** It is given `raw_text` and the
   requirement list; the `unsettled_positions` array is not passed to it. If the two calls
   were joined, the detector would start from an argument the extractor had already found.
   **This is the same "give the destination to the call making the choice" that BUG-004 and
   BUG-007 both turned on** — and it would make the two outputs dependent, which is a real
   cost: today they are an accidental cross-check, and that is how this bug was found.
2. **Prompt length or position.** T4's conflict sits at ~35% of the document, and BUG-023
   established that position alone does not explain a miss — but that was the extractor, not
   the detector, and the finding does not transfer for free.
3. **The requirement list is doing harm.** The detector is told not to repeat requirements
   back as questions. `T4-U01`/`U02` are *not* in the requirement list (code withdraws them,
   BUG-007) but the invite argument is adjacent to material that is. It may be suppressing
   the conflict as "already covered".

**Re-run when:** C4. Read the per-item table, not the verdict — this card exists because the
verdict said FAIL and the interesting part was two components disagreeing.

## Lesson

**A component's own output is not the only evidence about it.** This was found because two
different calls were asked to read the same document for different reasons, and their answers
were compared. Nothing in the design intended that comparison; it fell out of building a
second box for a different bug.

The corollary is uncomfortable and worth keeping: **if the detector had been the only thing
looking, C4 would have reported "finds explicit disagreements" at 1 in 3 and we would have
had no way to tell whether the document or the detector was at fault.**

---

## FIXED — 2026-09-03. Candidate 1 was right, and it was structural

The card named three candidates and said the first was *"the detector never sees the
extractor's positions"*. The truth is sharper and worse: **the detector saw the argument, as a
requirement, and was told not to repeat it.**

### The evidence, before anything was changed

On a T4 run, both unsettled positions carried `also_stated_as` — meaning the extractor emitted
each side **twice**: once as an unsettled position and once as a requirement. Code withdrew the
duplicates. But it withdrew them **at assembly**, and the gap detector runs *before* assembly,
reading the requirement list from the grounding stage.

And the detector's user message says, in as many words:

> `ALREADY EXTRACTED AS REQUIREMENTS (do not repeat these as questions)`

**So the detector was handed both sides of the argument, labelled as settled requirements, and
instructed not to raise them.** It complied — 2 runs in 3. The component that "missed" the
conflict was doing exactly what it was told.

### The fix: reconcile once, early, so every stage sees the list that will ship

Reconciliation moved from `/internal/assemble` to `/internal/grounding-check` — the earliest
point where both halves exist. Everything after it — detector, clusterer, story drafter,
assembly — now sees the same requirement list, the one the PRD actually ships. Assembly still
reconciles and now finds **nothing** (`also_stated_as: 0`), which is how it stays a safety net
rather than the only net.

### Two things it broke, and both are worth keeping on the record

**1. Assembly refused code's own output.** T3 and T4 — the only two fixtures with unsettled
positions — came back `schema_invalid` and produced nothing. The positions now arrive already
grounded, and assembly asserted *"the model may not set `match_kind`"* against them.

`verify-gaps.mjs` TC8 had written this trap down for open questions two days earlier:

> *"the clean case must use a RAW model payload… this assert belongs on the way IN, and running
> it on the way out would reject the system's own work."*

I walked into it one layer up. Assembly now decides by shape: a position carrying `match_kind`
came from the grounding stage and passes through; one without it is raw and gets both the
assertion and the grounding.

**2. It then found the argument and filed it as the wrong kind.** With the detector no longer
told the argument was handled, it reported it **every run** — as `unanswered`. That was
BUG-020's redirect from the same afternoon over-generalising: *"a quality the document raises
and leaves open is `unanswered`"*, and an unsettled argument is also, technically, raised and
left open.

One sentence fixed the boundary: *"the test is not whether the document left something open; it
is whether two people wanted incompatible things. If you can name who was on each side, it is a
`conflict`."*

### Measured

| | before | after |
|---|---|---|
| **C4 R1** — the explicit conflict found | 0 / 1 / 0 of 1 | **1 of 1, three runs of three** |
| C4 verdict | FAIL / PASS / FAIL | **PASS / PASS / PASS** |
| Requirements withdrawn at assembly | 1–2 per run | **0** — nothing left to withdraw |
| C1 · C2 · C3 | pass | pass |

**All four cases pass on three consecutive clean runs — the first time in this project that C4 has been green twice, let alone three times.** Fourteen verifiers re-run afterwards: all green.

**Implicit conflicts are still 0 of 2**, and nothing here claims otherwise. That is the harder
half of C4 and it has not moved.

### A mistake in method, recorded because it cost two hours of confusion

Two measurement runs came back with C1 and C2 failing, and neither failure was real: **I edited
the prompt, re-synced and restarted n8n while a three-run measurement was executing in the
background.** The runs were reading a rig that changed underneath them.

**A measurement is a run of a fixed system.** Nothing may be edited, synced, imported or
restarted while one is in flight, and the two red results that came from doing so are not
evidence of anything.
