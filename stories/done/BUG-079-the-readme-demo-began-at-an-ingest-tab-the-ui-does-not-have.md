# BUG-079: The README demo began at an "Ingest tab" the UI does not have

**Severity:** minor · the first sentence of the first demo step in the run-it-yourself README names a
place in the product that does not exist
**Found:** 2026-09-10, following the README from a fresh extraction of the source archive
(the E9-S2 walk-through, done at last because Vaibhav asked for the instructions to be checked
by following them)
**Area:** `deliverables/RUN-IT-YOURSELF.md`, "The demo, in the order it is worth seeing", step 1

## What shipped

> Ingest tab → paste `evals/datasets/docs/T1.json`'s `raw_text` (or use the n8n form …)

`review-ui/public/` has no ingest surface. `index.html` lists versions; `review.html` reviews
one. The only two ways in are the n8n form and the ingest webhook — which the parenthesis
mentions as the alternative. The same shape as BUG-076: a run sheet describing a control the
screen does not have, this time in the document a stranger reads first.

## Why nothing caught it

`check-readme-links` checks paths. "Ingest tab" is not a path. Nobody had followed the demo
steps from the README rather than from memory.

## Fixed

Step 1 now starts at the form, gives `show-fixture.mjs T1` as the way to get the text and the
field values, and names the webhook as the other door. Step 4 says that `grade.mjs C6` needs a
produced run first, which the fresh-clone run also showed (it says "Nothing to grade: no run
manifest" otherwise, which is correct, but the README implied it stood alone).
