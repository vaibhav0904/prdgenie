# Roadmap — from scope-complete to paid

This build's definition of done and a buyer's are different documents. The
buyer's is a renewal. This file stages the distance between them, so "the scope
is complete" and "we are done" stop being confused for each other.

Maintain it like the backlog: dated, honest, and re-prioritized on purpose.
Every item here that matters enough to write down twice gets a story card —
an honest limitations list that never becomes cards is documentation of
intent, not a plan.

Last audited: 2026-09-01 (before E1).

## The churn test

> A real PM has been using PRD Genie for three weeks. **What makes them stop?**

Four things, in the order they would actually happen:

1. **The second meeting doesn't land where they expect.** They ingest a follow-up
   transcript and get a delta that re-lists eight requirements nobody changed. Reviewing
   the delta costs more than editing the PRD by hand would have, so on week three they
   stop ingesting follow-ups — and a PRD tool that only handles the *first* meeting is a
   demo, not a tool. This is why C5 measures churn at zero rather than only measuring
   whether real changes were found, and why the living-PRD path is E6 rather than a
   stretch goal.
2. **One wrong requirement they didn't catch.** They approve a draft, an engineer builds
   from it, and it turns out a requirement was subtly not what the stakeholder said. After
   that they read every line against the transcript themselves — which is the entire job
   they were trying to avoid, now with extra steps. Trust does not degrade gracefully; it
   ends on a specific Tuesday. This is why grounding is code-checked and why a
   hallucinated-grounded requirement is an automatic eval failure rather than a score.
3. **Fixing one sentence means rejecting the whole draft.** The daily friction. If the
   only verbs are approve and reject, a PM with one bad line out of thirty has to reject
   thirty. This is why per-requirement edit-with-reason is in E4 and not deferred.
4. **They can't get their PRD out.** It lives in a SQLite file on someone's laptop.
   The first time they need it in Confluence for a stakeholder who will not open a review
   UI, the tool becomes an extra step between the meeting and the document that actually
   gets read.

The first three are answered inside the current scope. The fourth is Tier 1 below and is
**not** answered by anything built here.

## Tier 1 — the pilot gate

Everything that blocks the **first paying customer**. Entry criterion for this
tier: a named prospective user. Exit criterion: they are using it on real data
and paying.

- [ ] **Accounts and identity.** Every ReviewAction is currently attributed to one
      hardcoded reviewer, so "who approved this" has no answer. For a document that
      teams build from, the signature *is* the product. Biggest gap in
      `assumptions.md`; blocks everything else in this tier.
- [ ] **Export the PM actually needs.** Markdown and DOCX out, and a Confluence or
      Jira adapter reading `state='approved'` only. Answers churn reason 4.
- [ ] **A cost ceiling.** No per-document token cap and no daily spend limit exist. An
      intake anyone can post to with no cap is a cost-injection gap, not merely a missing
      feature — and this system's intake is a webhook.
- [ ] **Data rights.** Export, deletion, and a written retention policy. Source
      documents are meeting transcripts: the most sensitive thing a PM owns, and the
      first thing their legal team will ask about.
- [ ] **Real transcripts, not fixtures.** Everything measured so far is measured on nine
      documents written by the person being measured. The pilot's first honest act is
      running on transcripts nobody wrote for the test.

## Tier 2 — commercial depth

What makes customers **stay and pay more**. Only enter after Tier 1 exits —
depth built before the pilot gate is depth nobody can buy.

- [ ] **Outcome tracking past `approved`.** The state machine currently ends at sign-off.
      The buyer's currency is whether the PRD produced something — stories that entered a
      sprint, a feature that shipped. Until the machine reaches that, the renewal
      conversation has no number in it. This is also the deferred audience in
      `docs/reporting.md`.
- [ ] **The renewal metric.** At least one figure denominated in what a Head of Product
      renews on — time from meeting to *engineering-ready* backlog, not time to draft.
      The current reports end where a product leader's report would begin.
- [ ] **Multi-PRD products and cross-PRD conflict detection.** One product currently has
      one living PRD. The genuinely hard, genuinely valuable version of ambiguity
      detection is noticing that a new meeting contradicts a *different* PRD.
- [ ] **A real baseline study.** Three PMs who have not seen the fixtures, hand-logging
      for a week, then using the tool. Until then no improvement percentage may be
      claimed anywhere (`docs/metrics.md`).
- [ ] **Hosted onboarding.** Two local processes and an n8n import is a self-host guide
      measured in pasted setup steps. Minutes, or nobody arrives.

## Review cadence

Re-read this file at every epic boundary. For each item: still true? already a
card? deliberately deferred (say why, dated)? The audit that fills this file
goes stale the moment the product moves — audit the boring perimeter
(accounts, permissions, export, delivery, billing) deliberately, because the
documentation instinct never wanders there on its own.

**Cards already created from this file:** none yet — the four churn answers map to E4,
E6 and E7, which are already epics. At the E6 boundary, revisit whether "export the PM
actually needs" has become a card; it is the highest-ranked Tier 1 item that is small
enough to be one, and if it is still only written down here after two epics, that is the
signal to promote it.
