# BUG-061: A probe that now fires two pipelines per run

**Severity:** minor · it is a probe, run deliberately, and its findings are still readable
**Found:** 2026-09-05, reading `evals/harness/` for BUG-052
**Area:** `evals/harness/probe-missing-deadline.mjs`

## What happens

The probe posts each variant to the ingest door and then posts to generate by hand:

```js
const PRODUCT = process.env.EVAL_PRODUCT_ID ?? 'forgesight';
...
const env = await post(INGEST, { product_id: PRODUCT, doc_type: 'transcript', raw_text: v.text, ... });
const gen = await post(GENERATE, { doc_id: env.doc_id });
```

There is no `dispatch: false`. Since E6-S2 the door **calls the workflow it chooses**, and
`forgesight` has twenty approved versions — so the first post routes to **WF3** and runs a full
delta, and the second post then runs WF2 on the same document. Every probe run pays for two
pipelines and leaves a delta version behind in `forgesight`.

This is BUG-052 in a second file. BUG-052 fixed `produce.mjs`; **a fix that covers one file is a
fix for one file**, which is the lesson BUG-050 wrote down two cards earlier.

## Why it has not been noticed

The probe is declared out of the standing sweep (`check-all`: *"CALLS A PAID PROVIDER — a
probe"*), so it only runs when somebody runs it, and it has not been run since the fork shipped.
Its findings would still be right — it reads the requirements off the version WF2 produced — so
the symptom is spend and a polluted product, not a wrong answer.

## The fix

1. Give the probe its own product, the way the corpus now does: a product nothing has approved
   routes to generate, and the second post becomes unnecessary.
2. Delete the hand-driven generate post, for the reason BUG-052 gives: a harness that replays
   through the real doors must go through the fork like everything else.
3. `verify-corpus-routing.mjs` TC6 asserts this of `produce.mjs` by reading its source. Widen it
   to every file in `evals/harness/` that posts to the ingest door, derived from the directory
   rather than named — otherwise the next probe repeats this.

## Not a fix

Adding `dispatch: false` to the probe. That is the flag BUG-052 removed, and it would preserve
exactly the thing that card was about: a harness that avoids the product's central feature
rather than being shaped so the feature does the right thing.
