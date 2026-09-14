# BUG-076: The run sheet described a button the screen does not have

**Severity:** minor · nothing wrong in the product; three statements on the presenter's card
that a reader following them literally could not perform or would find contradicted
**Found:** 2026-09-10, while turning the run sheet into a shot list for the generated video —
the first reader who had to execute every row exactly as written, without judgement
**Area:** `deliverables/deck/slides.mjs` (slides 3 and 5, presenter notes only)

## What shipped

1. **Slide 3, row 2:** *"Click Approve — it is refused. Click Approve anyway."* An amber item
   renders **only** `Approve anyway` (`actionRow()` in `review.html`: `grounded === false` gets
   the override button and nothing else). There is no Approve to be refused. The spoken line
   was already right — *"I cannot just approve it. I have to click approve anyway"* — the
   stage direction beside it was not.
2. **Slide 5, row 1:** *Who wrote this? = `Someone else`.* The form's option is
   *"Someone else — a meeting, an email, a customer"*. A presenter finds it; a script does not.
3. **Two `command.does` figures had drifted from their own slide:** slide 3's said 97.20% where
   the figure block says 97.06%; slide 5's said 122 recorded changes where the block says 127.
   Same file, twenty lines apart. The count guard in `build-deck.mjs` checks story and bug
   counts against the repository, not a slide against itself.

## Why it was found now and not in five rehearsals

A presenter reads a stage direction and does the nearest thing the screen allows. A capture
script does exactly what the row says, and stops when it cannot. **The run sheet was tested by
being performed for the first time only when the performer could not improvise.**

## Fixed

The three rows now say what the screen shows. Both decks rebuilt; the slides themselves did not
change, so the video's frames of them did not either.

## Still open

Nothing checks a `command.does` against the figure block on the same slide. It joins the counts
`build-deck.mjs` already refuses to publish when they disagree — a small addition, not made
tonight because the deck is being filmed from.
