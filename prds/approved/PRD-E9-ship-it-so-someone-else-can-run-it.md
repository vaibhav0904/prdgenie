# PRD-E9: Ship it so someone else can run it

**Status:** **Approved** by Vaibhav, 2026-09-02
**Date:** 2026-09-01 · approved 2026-09-02

## Problem

A system that works on the machine it was built on, explained by the person who built it,
is not a product. Four things have to exist — a working demo, a slide deck, a ~5-minute
video, and the n8n workflow export — and every one of them is a translation problem: from "it runs here" to "it runs for someone else", and from "I know why this is
interesting" to "a stranger with twenty minutes can see why".

Two specific risks. The **export** carries credentials unless something stops it, and a
leaked key in a published JSON file is not recoverable by apologising. The **setup** is
two processes plus an n8n import, and the most likely first-run failure — Docker
networking to `localhost` — is invisible until it happens.

## Goals / Non-goals

**Goals**

- A credential-free n8n workflow export, verified by a check that fails on a hit.
- A run-it-yourself README that someone else can follow verbatim, tested by following it verbatim
  against a clean state.
- A ≤9-slide deck and a ~5-minute video that lead with the honest story, not the demo.
- A full dress rehearsal before anything is published.

**Non-goals** — deferred deliberately, with reasons:

- **No new capability.** If something is not built by the end of E8, it is described in
  the limitations, not rushed in for the video. A feature built during the release epic
  has no test plan and no eval, which is exactly the "just this once" the method warns
  about.
- **No polishing of numbers.** Whatever the eval spread says at rehearsal is what the deck
  says, including a range that straddles a threshold.
- **No hosted deployment.** Local, two processes, documented. `docs/roadmap.md` names
  hosted onboarding as Tier 2.
- **No re-recording to hide a failure.** If a live eval run in the video fails, that is a
  finding to state, not a take to discard — subject to it being an honest failure and not
  a setup mistake.

## Who this is for

The **stranger**, who has twenty minutes, no context, and every reason to be sceptical — and the **sponsor**
persona, for whom the deck is the artifact that survives after the demo.

## Proposed scope → stories

- **E9-S1:** `npm run export:n8n` — pull workflows via the n8n API, strip credential ids
  and pinned data, grep for `sk-`, `AIza`, and every value in `.env`; **non-zero exit on
  any hit**. Committed exports land in `n8n/workflows/`. *Simplified by ADR 0010: the
  export reads `prdgenie-n8n`, which contains only our work, so "filter our workflows out
  of another project's" is no longer a step that can be forgotten.*
- **E9-S2:** `deliverables/RUN-IT-YOURSELF.md` — setup in order, the Docker networking
  trap front-loaded, the demo script, where the eval results live, and the biggest known
  gap repeated. Tested by following it verbatim on a clean database and a fresh n8n import.
- **E9-S3:** The deck, ≤9 slides.
- **E9-S4:** The demo video, ~5 minutes.
- **E9-S5:** The dress rehearsal and the release checklist.

## Success criteria

1. `npm run export:n8n` exits non-zero when a credential is present — **proven by planting
   one and watching it fail**, then removing it. A check that has never failed has never
   been tested.
2. Someone other than the author, or the author on a clean state pretending to be someone
   else, follows `RUN-IT-YOURSELF.md` verbatim and reaches a generated PRD without asking a
   question. Every question asked becomes a line in the README.
3. The dress rehearsal passes end to end: clean database → all nine fixtures produced →
   all six cases graded, three times, spread reported → a run across ≥5 documents of ≥3
   types → export hygiene green.
4. The deck's final slide is the honest one — biggest known gap, what is deliberately not
   claimed, and the next two improvements. It is not the last thing squeezed in; it is
   drafted first.
5. The video shows the gate being refused. Fifteen seconds of `sqlite3` refusing an
   `UPDATE` is worth more than a paragraph claiming a human-in-the-loop design.
6. Every artefact on the list is present, and the release checklist is confirmed line by
   line rather than remembered.

## Technical constraints (confirmed during exploration, not assumptions)

- **n8n exports embed credential *ids*, and pinned execution data can embed model
  responses and source text.** Both are stripped. The grep is a second line of defense, not
  the first.
- **The run-it-yourself README must front-load the two-process setup and the Docker networking
  trap** (ADR 0002, `docs/assumptions.md`). It is the most likely way a first run fails,
  and a stranger who hits it in minute two may not reach minute five.
- **The demo needs a reset-to-clean command.** UAT scripts assume clean dummy data
  (`stories/README.md`); the video needs the same, and rehearsing without it means
  rehearsing a state no stranger will have.
- **The video's live eval run takes real time.** Either it is genuinely run and the wait
  is part of the honesty, or it is pre-run with the result file shown and *said* to be
  pre-run. Silently cutting the wait to look fast is the small dishonesty that costs the
  larger claim.
- **Nine slides is a hard cap**, self-imposed. The honesty slide and the architecture
  slide are non-negotiable; the demo screenshots are what gets cut.

## Decisions — 2026-09-02, all four closed

**1. The deck opens with the churn test** — *"a PM has been using this three weeks; what
makes them stop?"* It frames every design decision that follows, and it is more
interesting than a problem statement the reader can guess. The answer
the deck gives is the project's own: they stop when they stop believing the output, which
is why every requirement carries a citation and why the approval gate is a trigger.
E9-S3 owns it.

**2. The video shows both paths, in this order:** ingest and review a real transcript,
sign off, show the delta on the follow-up, then run the eval live **including the
injection case**. The happy path is table stakes; the failure cases are the
differentiator. E9-S4 owns it.

**3. The fixtures ship, prominently.** They contain no real data, and they are what makes
every number in the deck reproducible by someone else. A release whose figures cannot
be re-derived is asking to be taken on trust, which is the opposite of this project's
argument. E9-S2 owns it.

**4. One method slide, no more.** The gated process, the ADRs and labels-before-tuning are
context for *why the numbers are trustworthy* — they are not the subject. A second slide
starts selling the method instead of the product. E9-S3 owns it.

**The consequence of 1 and 4 together, stated so it is not discovered late:** the deck
leads with a product question and spends exactly one slide on how it was built. If
something has to be cut for the ≤9-slide limit, it is not the honest-limitations slide.
## Open questions (all four now decided above)

- **What is the deck's opening?** Leaning the churn test — "a PM has been using this three
  weeks; what makes them stop?" — because it frames every design decision that follows and
  is more interesting than a problem statement the stranger already read.
  *Decided by Vaibhav at E9-S3.*
- **Does the video demo the happy path or a failure?** Leaning both, in this order: ingest
  and review a real transcript, sign off, show the delta on the follow-up, then run the
  eval live including the injection case. The failure cases are the differentiator; the
  happy path is table stakes. *Decided by Vaibhav.*
- **Are the fixtures shipped with the release?** They contain no real data and they are
  what makes every number reproducible. Leaning yes, prominently. *Decided at E9-S2.*
- **How much of the build method is in the deck?** The project was built with a gated
  process — six gates, ADRs, labels before tuning — and that is arguably as interesting as
  the product. Leaning one slide, no more: it is context for why the numbers are
  trustworthy, not the subject. *Decided by Vaibhav at E9-S3.*
