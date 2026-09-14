# PRD-E1: One transcript becomes an approved PRD

**Status:** Approved
**Date:** 2026-09-01 · **Approved:** 2026-09-01 by Vaibhav

## Problem

Nothing exists yet. The risk at this stage is not that any single step is hard — it is
that six plausible steps get built in parallel and never meet, or that the human gate
turns out to be a convention once there is real code around it.

The PM's problem this epic addresses, narrowly: *I have one transcript and I want a
structured PRD I can read, check against what was said, and approve.* Everything else —
multiple document types, prioritization, deltas, reporting — is deferred so that the
full journey exists before any part of it is deepened.

## Goals / Non-goals

**Goals**

- One transcript, ingested through a real door, becomes a PRDVersion a human can read.
- Every requirement in it carries a citation, and "grounded" is decided by code.
- The PM can approve it in a UI, and **only** there — provably.
- The nine eval fixtures and their labels exist, written before any prompt is tuned.

**Non-goals** — deferred deliberately, with reasons:

- **No clustering into epics/features, no story drafting, no prioritization** (E3). The
  E1 PRD is a flat list of requirements. A flat list is enough to prove the spine and the
  gate, and structure built before the gate is proven is structure that may need moving.
- **No eval harness yet** (E2). The fixtures and labels are written *here*, deliberately,
  because labels must exist before tuning and E2 is where tuning starts. Writing the data
  in the epic before the grader is the whole point of the ordering.
- **No multi-document ingestion** (E5). One door, `doc_type: transcript`. The second door
  proves the adapter claim; one door proves nothing yet, and that is fine.
- **No ambiguity detection** (E3), **no deltas** (E6), **no metrics page** (E8).
- **No edit or reject in the review UI** — approve only. Edit-with-reason is the daily
  friction fix and belongs in E4 where it can be built properly. E1's UI is honest about
  being thin.
- **No authentication.** Declared in `docs/assumptions.md`; not in scope for the pilot.

## Who this is for

The **PM** persona (`docs/domain.md`): the person who owns the PRD and signs it. In this
pilot, Vaibhav. Secondarily the **operator**, who needs a failed run to be visible rather
than silent — which is why parks and dead letters exist from the first epic rather than
being retrofitted.

## Proposed scope → stories

- **E1-S1:** Review service and schema — SQLite, the tables from `docs/contracts.md`, and
  the state-transition trigger. Verified by a hand-run `UPDATE` being refused.
- **E1-S2:** WF1 ingest door — n8n Form → canonical SourceDocument stored, `trace_id`
  minted once, PII redacted before the insert, `ingested` event written.
- **E1-S3:** The nine fixtures and their labels — including regions per labeled
  requirement (ADR 0008), the hostile and garbage fixtures, and the
  labels-before-tuning rule in each label file's header. No prompt is tuned in this story.
- **E1-S4:** WF0 LLM subworkflow + extraction v1 → requirements with citations, and
  `/internal/grounding-check` deciding `grounded`.
- **E1-S5:** Assembly → a PRDVersion in `draft`, validated, transitioned to `in_review`;
  a run that fails or grounds nothing parks `needs_review` with a reason code instead.
- **E1-S6:** Review UI — read the version, see citations, click one to highlight the span
  in the source, and sign off. The sign-off endpoint is the only path to `approved`.

Six stories, each one sitting, each independently demonstrable.

## Success criteria

Once every story is done:

1. A transcript ingested through the n8n form produces a readable PRDVersion in the UI
   within one run, with no manual step in between.
2. Every requirement shows at least one citation; clicking it highlights the exact text in
   the source pane; ungrounded requirements are visibly badged.
3. `trace_id` joins the document, its requirements, its version and its events — one query
   answers "what happened to this document".
4. The PRDVersion reaches `approved` through the UI, and a hand-run
   `UPDATE prd_versions SET state='approved'` in `sqlite3` **fails**. Both halves are
   demonstrated in the UAT; the second half is the one that matters.
5. Nine fixtures and nine label files exist, and no prompt has been tuned against them.
6. A forced failure (service stopped mid-run) produces a visible park or dead letter, not
   a silent success.

## Technical constraints (confirmed during exploration, not assumptions)

- **n8n must reach the review service over HTTP.** If n8n runs in Docker, `localhost`
  from inside the container is not the host — `SERVICE_BASE_URL` must be
  `http://host.docker.internal:3000`. This is the single most likely first-run failure
  and is called out in ADR 0002; it belongs in the story that wires the first HTTP call.
- **Labels must be written against the post-redaction `raw_text`**, because redaction
  happens at the door and every span offset refers to the stored string. Writing labels
  against the pre-redaction draft would silently misalign every region in E1-S3.
- **`grounded` must be rejected as a schema violation if the model supplies it**, not
  merely ignored. Ignoring it invites a later refactor to "just use the model's value".
- **The trigger has to allow the sign-off path without allowing anything else**, which
  means the endpoint sets a marker the trigger checks. Getting this wrong in either
  direction — an open gate, or a gate the endpoint can't pass — blocks E1-S6 entirely, so
  it is built and proven in E1-S1 rather than discovered at the end.

## Open questions

**All three closed by Vaibhav, 2026-09-01. None remain open.**

- ~~**Does the E1 review UI need the source pane at all, or is a citation tooltip enough
  for a first pass?**~~ → **Decided: build the source pane.** E1-S6 includes
  click-to-highlight, not a tooltip. The reasoning stands as written — the plumbing gets
  built once, and it is the most persuasive fifteen seconds of the demo. E1-S6 is
  therefore the largest story in this epic; if it does not fit one sitting, it splits into
  "read the version" and "citations and the source pane" rather than losing the pane.
- ~~**Should E1-S3 write all nine fixtures, or only the three E1 can exercise?**~~ →
  **Decided: all nine, with labels.** Six of the nine exercise nothing until E2–E7, and
  that is the point: labels written later, once prompts exist, are labels written with one
  eye on the output. E1-S3 is a long story with no code in it, and it is the story that
  makes every later eval number honest.
- ~~**Does the trigger marker survive better-sqlite3's connection reuse?**~~ →
  **Decided: spike it in E1-S1 before committing to the mechanism.** Timebox five minutes.
  The fallback is a dedicated single-purpose connection for sign-off. Whichever way it
  lands, the result is written down: if the mechanism changes, ADR 0006 is **amended, not
  rewritten**, and the two records stand together.

### What the spike must actually prove

Worth stating precisely, because "it seemed to work" is the failure mode here. The spike
passes only if **both** hold, checked in this order:

1. The sign-off endpoint's `UPDATE` into `approved` **succeeds**.
2. A subsequent `UPDATE prd_versions SET state='approved'` on a *different* version,
   issued on the same pooled connection immediately afterwards, **is refused**.

The second check is the one that matters. A marker that leaks across reuse leaves a gate
that looks shut and is open — the one failure mode in this design with no visible symptom.
If the spike cannot demonstrate (2), the fallback is taken without further deliberation.
