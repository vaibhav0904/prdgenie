# E9-S3: Nine slides that lead with the hard part

**As a** stranger
**I want** the deck to open with the question the product answers
**So that** every design decision after it has a reason I can already see

## Acceptance criteria

- [ ] **≤9 slides.**
- [ ] **Opens with the churn test** (PRD decision 1): *"a PM has been using this three weeks;
      what makes them stop?"* — and the deck's answer is the project's: they stop when they
      stop believing the output.
- [ ] **Exactly one method slide** (PRD decision 4). The gates, the ADRs and
      labels-before-tuning are context for why the numbers are trustworthy, not the subject.
- [ ] Every number on every slide is **reproducible from the shipped fixtures**, and the slide
      says which command produces it.
- [ ] The honest-limitations slide **survives any cut** made for the 9-slide limit.
- [ ] The baseline appears as *"we did not compute this, and here is why"* — E8-S3's refusal,
      not a percentage.

## Depends on
- E8-S1, E8-S3

## Eval gate
- None.

## Technical notes

- The strongest material in this project is the failures it measured: a check that could not
  fail, a park that wrote nothing, a prohibition that held two runs in three. **A deck that
  only shows the demo throws that away.**
- ≤9 slides with one method slide means the product has 7 or 8. Cut features before cutting
  the reason anyone should believe the numbers.

---

## Closed 2026-09-05 — and it carries E9-S4's script

**Two artefacts, one source.** `deliverables/deck/slides.mjs` holds the nine slides;
`build-deck.mjs` renders both. A deck maintained as two files is a deck whose speaker notes
describe a slide that changed.

- `presentation.html` — https://claude.ai/code/artifact/51391a13-9513-4afe-abe5-76e379f3313f
- `presenter.html` — https://claude.ai/code/artifact/f25dcad3-7070-45ee-9f50-9ef283140e03

### Against the acceptance criteria

| | |
|---|---|
| ≤9 slides | **9** |
| Opens with the churn test | slide 1, verbatim: *&ldquo;A PM has been using this for three weeks. What makes them stop?&rdquo;* |
| Exactly one method slide | slide 8, and its eyebrow says *&ldquo;one slide, on purpose&rdquo;* |
| Every number reproducible, command named | 7 of 9 slides carry a figure; each names its command. Slides 1 and 9 carry none |
| Honest limitations survives any cut | slide 9, and the builder&rsquo;s over-budget message names it as the slide never to cut |
| Baseline as a refusal, not a percentage | slide 7: *&ldquo;there is no hours-saved figure here, and that is deliberate&rdquo;* |

### The design decision worth recording

**The deck is built out of the product's own components** — the citation block with its source
chip, the amber ungrounded badge, the metric-with-denominator pair, the delta rows in their three
colours, all from the review UI's palette. Switching from a slide to the live demo is visually
continuous instead of a jump between two design systems.

### The timing is derived, and it caught a lie

The first draft carried a hand-typed `seconds:` on each slide, summing to a comfortable 5:55.
Counting the words actually written, at 150 wpm, the real figure was **9:26** — the shape of every
stale number this project has filed a card about, in a file written twenty minutes earlier.

Two rounds of cutting brought it to 6:01. Rather than mutilate slides 6 and 9 — the two the story
says are the differentiator — six lines are marked `{ t, cut: true }`: *decided in daylight,
not at 4:50 on the take*. The run sheet marks them **cut first** and the builder reports both:

```
full script                     6:01
without the 'cut first' lines   5:19
budget                          5:20
```

**The speaking rate was not adjusted to fit.** 150 wpm is the model; moving it to make the
number pass is tuning a threshold to output, and the honest move was to cut words.

### What is E9-S4's and what is still open

The run sheet carries the **script and the demo cues** — four switch points, each with what to do,
in what order, and when to come back — so E9-S4's script requirement is met here. What remains on
E9-S4 is Vaibhav recording it, after the dress rehearsal, from a clean state. The cue for slide 6
says it explicitly: **if a run parks on camera, that is the take that ships, with the reason read
aloud.**
