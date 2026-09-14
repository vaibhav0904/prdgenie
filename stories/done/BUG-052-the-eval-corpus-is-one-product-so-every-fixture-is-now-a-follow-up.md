# BUG-052: The eval corpus is one product, so every fixture is now a follow-up

**Severity:** major · nothing is failing today, and that is only because the harness steps around it
**Found:** 2026-09-04, E6-S2, the moment WF1 started routing on product state
**Area:** `evals/harness/produce.mjs` · `evals/datasets/` · cases C1, C2, C3, C5

## What happens

All nine fixtures are ingested as product `forgesight`. `forgesight` has an approved PRD — T1
was approved so E6 had a baseline to delta against. WF1 now routes on exactly that fact:

> a document whose product has an approved version goes to **WF3**.

So under real routing, **T2 through H2 are all follow-up documents.** The door would compute a
delta for each of them against T1's approved version, and C1 (extraction quality), C2 (grounding
fidelity) and C3 (structure and determinism) would grade a database with no generation runs in
it at all.

`produce.mjs` does not go through the fork — it posts to `/webhook/generate` itself. As of this
story it also sends `dispatch: false`, so the door stores the document and does not act. The
corpus is therefore correct today **because the producer declines to use the product path.**

## Why that is not good enough

The producer's job is to replay fixtures **through the real doors**, so that grading always
describes a run that actually happened (its own opening comment). It now replays them through
the door with the pipeline switched off, and drives the pipeline by hand. The gap between what
a PM's document does and what a graded document does is exactly the gap `produce.mjs` exists to
close.

It is also a fixture problem hiding as a routing problem. Nine documents about one product,
where the first is approved and the rest are not follow-ups of it, is not a corpus that
describes anything real.

## What the fix has to decide

1. **One product per case, or one per fixture?** C1/C2/C3 need documents that generate; C5 needs
   T1 → T2 against an approved baseline, which is the only pair where "follow-up" is *true*.
   G1, H1, H2 and N1 are not follow-ups of T1 in any sense — they are separate first documents
   that happen to share a fixture directory.
2. **Where the approved baseline lives.** If C5 keeps its own product with its own approved T1,
   then the extraction corpus never has an approved version and routes to generate naturally —
   no flag, no exception, no comment. That is the shape to aim for.
3. **What happens to the labels.** They join on fixture, not product (`labels.mjs`), so a
   product change should not touch them — **verify that, do not assume it.**
4. **Whether `dispatch: false` survives.** If the corpus is fixed properly, the producer should
   go through the fork like everything else, and the flag should disappear from it. A flag that
   stays is a corpus that was not fixed.

## Not a fix

Approving nothing, so the fork never fires. That would keep the evals green by removing the
product's central feature from the environment they run in.

---

## Closed 2026-09-05 — ten first documents, and the producer goes through the fork

The four questions, answered in order.

**1. One product per case, or one per fixture? — One per fixture.** These are ten first
documents. G1 is an all-hands about parking, H1 is an attack, H2 is a PII sample, N1/E1/F1 are
separate briefs; none is a follow-up of a kickoff transcript. `productFor` lives in
`labels.mjs`, because it is corpus structure and because a check must be able to import the rule
without importing a script that replays the corpus.

It also bounds the damage. Under one shared product a single sign-off changes the meaning of
every case; under ten, it changes one — and `verify-corpus-routing` names which.

**2. Where the approved baseline lives. — `forgesight` itself.** It keeps its twenty approved
versions and stops receiving fixtures. It is now the living product a delta deltas against,
which is what C5 needs. C5 is E6-S5 and is not built, so that is a stated shape rather than a
tested one, and the card for it says so.

**3. What happens to the labels. — Nothing, and it is verified rather than assumed.** TC7
derives it: no `product` reaches `resolveLabels` or `match.mjs`. `git status evals/datasets/` is
empty — not one fixture or label byte changed.

**4. Whether `dispatch: false` survives. — Not on the normal path.** The producer now posts
**once**, to the ingest door, and the pipeline runs because the door chose it. Because the
webhook answers with its last node, what comes back is the envelope of whichever workflow ran —
`doc_id`, `trace_id`, `component`, and every count the manifest records — so the producer lost
nothing and no longer references the generate webhook at all.

The flag survives in exactly one place: `--ingest-only`, which means *the door and nothing
else*, for a run that must not spend. That is a different statement from "the corpus is wrong",
and TC5 asserts the difference by reading the source.

### What the run says

```
10/10 attempted fixtures reached storage      components: assembler   any delta: 0
ok  T1  DOC-2026-2045  v2204 in_review  14/14 grounded
park G1 DOC-2026-2041  parked: no_requirements_found
```

C1, C2, C3, C4 and C6 all **PASS** on the moved corpus. The per-fixture figures moved, because
a fresh produce is fresh model output — T1 80.0→93.3% recall, T4 85.7→**75.0%** precision, which
is the floor to two significant figures. Both are BUG-040's subject, and the tests file records
them rather than reporting "unchanged".

### The check, and what its control caught

`verify-corpus-routing` asks the shipped `routeFor()` what road each product is on *now*: no
ingest, no model call, no row written. A check that replayed ten fixtures every sweep to prove
they route correctly would be BUG-059 in a new place.

Its control's NC7 first compared the database's size and mtime and **went red on a check that
changes nothing** — opening a WAL database and closing it checkpoints the log, so the bytes move
while not one row does. It counts rows now. A control that reports a checkpoint as a write
teaches the reader to ignore it.

NC3 is the row worth keeping: a *shared* product that nothing has approved must turn TC2 red and
leave TC3 green. "Distinct products" and "on the generate road" are two claims, and a check that
ran them together would report one verdict and be unable to say which was true.

**Found while reading and not folded in: BUG-061** — `probe-missing-deadline.mjs` has the same
two-post shape with no flag, so since the fork shipped it fires a delta *and* a generation per
run. A fix that covers one file is a fix for one file.
