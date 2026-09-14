# Assumptions and known limits

Everything here is an explicit, deliberate simplification. **Nothing below is
hidden behind "it works" — each item names what is real, what is simulated, and
what would change in production.**

An undeclared simplification is a defect. The purpose of this file is that
"what's fake here?" has exactly one place to look.

## The biggest known gap, first

**There is no authentication and no multi-tenancy.** Anyone who can reach
`localhost:3000` can approve a PRD. The gate that this whole design is built around
proves that *the pipeline* cannot approve a document — it proves nothing about *who* the
approving human is. Every ReviewAction is attributed to a single hardcoded reviewer.
This is stated here, in the run-it-yourself README, and in the deck, because a gap discoverable
only by reading to the end of a file is a gap being hidden. Production replacement:
per-user accounts with the reviewer identity written into `review_actions`, and the
sign-off endpoint behind a session check.

## Dummy data

| What | How it was made | Why it looks like this |
|---|---|---|
| ForgeSight, the product | Invented — an analytics dashboard NeuronForge sells to enterprise clients | Needs enough surface for genuine cross-stakeholder disagreement without domain expertise to follow |
| T1 kickoff transcript | Hand-written to read like a real kickoff: interruptions, half-finished sentences, one decision reversed mid-meeting | Clean minutes would make extraction look better than it is |
| T2 follow-up transcript | Written **against** T1: 2 modifications, 1 direct contradiction, 1 addition, and several requirements restated unchanged | The unchanged restatements are the trap — they must **not** appear in the delta (C5 churn = 0) |
| T3 conflicting-stakeholder transcript | Three labeled disagreements, one of them polite enough that it reads like agreement | Deliberately adversarial: a system that only catches shouting matches has not detected ambiguity |
| N1 raw notes, E1 email thread, F1 feature brief | Same product, different registers — bullet fragments, a quoted reply chain, marketing-flavoured prose | Proves the doors are adapters: same spine, no branching on `doc_type` |
| G1 garbage | An all-hands about parking and the holiday calendar; zero requirements | Deliberate: the correct output is *nothing*, and a system that always finds requirements is broken |
| H1 hostile | Three prompt-injection payloads embedded in otherwise ordinary meeting text | Deliberately adversarial. Anything that reads strangers' text and acts on it needs this section |
| H2 PII-heavy | Emails and phone numbers throughout, plus named external individuals who must SURVIVE | Deliberately adversarial in both directions — 13 values must go, 22 must stay |

Labels for all nine were written when the fixtures were created, before any prompt was
tuned, and carry that rule in their header.

**They are ten separate products, and the table above is why that is honest rather than
convenient (BUG-052).** Every fixture describes ForgeSight in its text, but only T2 is a
*follow-up* of anything: G1 is an all-hands about parking, H1 is an attack, H2 is a PII sample,
and N1/E1/F1 are separate briefs in different registers. Ingesting them all as one product made
the corpus one kickoff and nine follow-ups the moment WF1 started routing on product state, so
each is now its own product and every one takes the generate road because it genuinely is a
first document.

**The fiction that remains, named:** T2 *is* T1's follow-up, and in the extraction corpus it is
graded as a first document. That is sound for C1/C2/C3, which grade its extraction against its
own labels and never look at T1 — and it is exactly wrong for **C5**, whose entire subject is
the pair. C5 therefore needs a product with an approved baseline, which is `forgesight` itself.
C5 is E6-S5 and is not built, so this is a stated shape, not a tested one.

## Mock or absent integrations

| Integration | Status today | Why | Production replacement |
|---|---|---|---|
| Meeting transcription | **Absent.** Text transcripts are the input contract | Commodity, and adds no learning to this build | Any transcription service writing into the same door |
| Jira / Azure Boards | **Absent.** Approved PRDs export as a file | The irreversible outward action stays manual on purpose — pushing epics into a team's backlog is exactly the act that should need a human | An export adapter reading `state='approved'` only |
| Slack / email notification | **Mocked.** WF2 writes the review link to the n8n execution log | No workspace to send to, and outbound messaging from a pilot is a deliverability problem the pilot does not own | An n8n Slack node behind the same "notify" step |
| Confluence / Drive as a source | **Absent** | A third door would be an adapter, not new capability, and the architecture claim is already proven by two | A third thin adapter to the canonical shape |
| Identity provider | **Absent** — see the gap above | | |

## Product assumptions

Each with the reason it was chosen, and honesty about which were guesses:

- **One product has exactly one living PRD.** Simplifies versioning to a single chain.
  *Deliberate: a real PM has several PRDs per product, and this would be a schema change
  — `prds` already has a `product_id`, so it is a small one.*
- **The PM names the target product at ingest; the system never auto-matches a follow-up
  document to a PRD.** *Deliberate: an auto-match failure silently corrupts the wrong
  document, and a dropdown costs the PM two seconds.*
- **Redaction removes contact details. It does not remove names.** *Two rules: email
  addresses and phone numbers. Every name — internal, external, individual or company —
  is deliberately kept.*

  **Decided by Vaibhav on 2026-09-02, and it is the reverse of what this document said
  the day before.** External-name redaction was built (BUG-009), worked, and was withdrawn.
  The reason is a product reason: **a requirement is only reviewable if you can tell who
  asked for it.** Internal speakers are usually labelled with a role — "Priya (Eng Lead)"
  — but an external one often is not, and then the name is the only thing identifying
  them. Redacting it does not anonymise the requirement, it orphans it: `[CUSTOMER_NAME-2]
  will not sign the pilot agreement until this is written down` is a requirement nobody
  can act on.

  - **What this costs, stated plainly.** The moment a real transcript arrives, real
    external individuals' names sit in this database — people who have not agreed to that
    the way an employee has. For a local demo on invented data it is the right trade and
    the attribution is worth more. It is **not** a posture that survives contact with a
    real customer conversation, and it is the first thing to revisit if this ever leaves
    the demo, together with the internal-names position it now generalises.
  - **Contact details still go, for everyone.** `priya.raghavan@neuronforge.com` and
    `rachel.okonkwo@northwindlogistics.com` are both removed; "Priya" and "Rachel Okonkwo"
    both stay. An address is a contact route rather than an attribution, so removing it
    costs nothing a reviewer needs. There is no internal/external distinction in the code
    any more — the special case that BUG-009 required disappeared with the rule.
  - **Customer organisations stay**, unchanged from the original reading: "Northwind needs
    SSO" *is* the requirement, and redacting the company would gut the corpus.
  - **The answer key now enforces both directions.** H2 carries `expected_retentions` —
    names, organisations and job titles that must SURVIVE — and C2 fails on one going
    missing. Before that list existed the dataset could only see under-redaction: it named
    21 values that had to go and nothing that had to stay, so a rule deleting every
    capitalised word would have scored 21 of 21 and passed the 100% floor cleanly. **For
    any rule that deletes, the answer key is only half the test.**

  *So the claim this system makes is: **contact details are removed; names are kept.** Not
  "PII is redacted", and the difference is the whole of it.*
- **RICE constants** (`impact ∈ {0.25, 0.5, 1, 2, 3}`, `confidence ∈ [0.5, 1.0]`,
  `effort` in person-weeks) are the standard published RICE scales, taken as-is. Chosen
  because they are conventional and externally defined — **not** tuned against the labels,
  and deliberately not tuned at all, since a scale tuned to make outputs look good is not
  a scale.
- **Grounding floor for assembly is ≥1 grounded requirement**, not a percentage. Chosen
  because any percentage would be a number picked to make the fixtures pass. A real floor
  needs data this pilot does not have.
- **Documents up to ~15k characters go to the model whole.** Chosen from the fixture
  sizes and the model's context, not from measurement of a real transcript corpus. This
  is a guess, and it is the assumption most likely to be wrong first.

## Security posture

State the gaps plainly.

- **No authentication whatsoever** — see the top of this file. This is the biggest gap.
- **The `/internal/*` endpoints are protected only by a shared secret in `.env`**, which
  is adequate for localhost and nothing else. Anything that can read the file can call
  the deterministic endpoints — though notably still *not* approve a PRD, which is the
  one thing the trigger protects independently.
- **Prompt injection is defended in layers, not solved** (ADR 0007). The tripwire knows
  only the payloads in fixture H1, so it is a regression guard, not a detector; a novel
  payload is caught by the delimiting and the closed schemas or not at all. The 100%
  figure in C6 describes three known payloads and must never be quoted as a general claim.
- **A hit parks the WHOLE run, and the false park is an accepted cost, not a bug.** A
  transcript that *quotes* an attack — a security review discussing a phishing email, a
  post-mortem naming a hostile domain — will park the moment the model repeats the string
  in a requirement or a question. There is no per-item drop and no override: an output
  with one obeyed instruction in it is an output nobody should trust the rest of. The PM
  sees a parked version naming the reason, and no PRD is produced from that run.
- **The tripwire runs at assembly, so a contaminated run is still billed for the four
  model calls after extraction.** Detection is before anything is *stored*, which is the
  property that matters; it is not before anything is *spent*.
- **The park stores no part of the payload.** The parked version carries an empty
  requirement list and the event detail names marker ids and JSON paths only — never the
  matched text. A payload cleaned up after storage has already been in the database.
- **The database is unencrypted at rest** and holds full source-document text. Fine for
  dummy data, wrong for real meeting content.
- **Cost has no ceiling.** Nothing stops a very large document from running up a bill;
  there is no per-document token cap and no daily spend limit. In a pilot with an open
  intake this would be a cost-injection gap, not merely a missing feature.

## Known limitations

Things that are wrong or missing right now, written up before anyone else finds
them. Include the ones that are embarrassing; those are the ones a reader most
needs.

<!-- Fill as they are found. Each gets a BUG card; the card number goes here. -->

- **A lightly paraphrased quote is reported ungrounded even when its requirement is
  correct** (ADR 0003). This deliberately undercounts the grounding rate rather than
  softening what "grounded" means.
- **Two processes must be running for anything to work** — n8n and the review service. If
  n8n runs in Docker, `SERVICE_BASE_URL` must be `host.docker.internal`. This is the most
  likely way a stranger's first run fails.

## What is a hypothesis, not a promise

- **"PRD Genie reduces the time from meeting to circulated draft."** Plausible, and the
  entire premise — but **unmeasured, and now unmeasured by decision** (E8-S3, 2026-09-03).
  There is no baseline, and none will be recorded from the one available PM: he wrote the
  fixtures and their answer keys, so any "before" time he could produce is anchored in both
  directions — and recording it would mechanically **silence the illustrative caveat
  everywhere**, since the caveat machinery trusts `baseline_status`. A weak "measured" would
  replace an honest "unmeasured" across every report at once, which is the strongest reason
  not to feed it one. To turn this into a claim: three PMs who have not seen the fixtures,
  hand-logging start and first-draft-circulated times for a week, then the same three using
  the tool. Until that study exists, `none` is not a gap in the data — it is the data.
- **"Grounded citations reduce PM verification effort."** The mechanism is obvious and the
  evidence is zero. To measure: time-to-decision per requirement in the review UI, with
  citations shown versus hidden.
- **"Ambiguity detection surfaces conflicts a PM would have missed."** C4 measures whether
  it finds *labeled* conflicts — conflicts a human already found. Whether it finds ones a
  human missed is untested and is a different, harder study.

**Deliberately not claimed:** real-time transcription; automatic matching of follow-up
documents to PRDs; production authentication or multi-tenancy; general robustness to
prompt injection beyond the three tested payloads; any percentage improvement over human
PM effort.


## The second pass over contested passages (BUG-023)

Added 2026-09-03, and it is the narrowest fix that moved the measurement.

- **What it fixes, measured:** a requirement spoken inside a disagreement was being discarded
  with the disagreement. T1's fixed delivery date went from **0 of 7 runs to 3 of 3**.
- **What it does not fix:** T1's forty-one-million-row scale is still missed, every run. It has
  a second cause — it reads as a statement of fact — and this change does not touch it.
- **What it costs:** one extra model call **per contested passage**, and only then; nine of ten
  fixtures have no argument and make no second call. Bounded at three passages per run.
- **What it can get wrong:** the second pass reads a passage without the rest of the document,
  so it can re-open a position the room withdrew. Measured at **one false positive in one run
  of three**, filed as BUG-031, and visible on the review screen rather than silent — the
  contradicting requirement sits on the same page with its own citation.
- **What it is not:** a general fix for long documents. It is keyed on the model saying where
  an argument was, so a commitment lost somewhere that nobody argued about is still lost.

## The judge runs on a free-tier key, and that bounds what it can see (E7-S5)

The Gemini credential is on the free tier. This is not a footnote about billing; it decides
how much of this system's output ever gets a second opinion.

- **Measured, 2026-09-03:** a sweep asks for 22 items. The first sweep of the day scored 5,
  the next 3, and the rest of the day's sweeps were refused outright — `llm_no_credit`, with
  Google's own quota message stored beside it. Two other flash models were tried and one has
  no free allowance at all (`docs/adr/0001`, amendment 1).
- **So the nightly cron is disabled here and the demo is manual-only.** That was already
  PRD-E7's decision for a different reason (a sweep on command demonstrates better than a
  sweep at 2 a.m.); the quota makes it the only honest setting as well.
- **What this does NOT weaken.** The judge gates nothing, so a sweep that does not run costs
  no decision, blocks no PM and changes no figure. Coverage is a thing that grows over
  sweeps, and every judge figure carries the sample it was taken over — a sweep of 3 says 3.
- **What it does mean, stated plainly:** *the judge has looked at a handful of items, not at
  the corpus.* 995 PRD versions and 6,778 requirements have never been judged, and
  `/api/judge` prints exactly that number on every page load rather than letting a reader
  assume coverage from the presence of scores.
- **The fix is a spending decision, so it is not mine.** Billing on the Gemini key would make
  nightly sweeps real; it is on the decision page for Vaibhav, unmade rather than assumed.

### Update, 2026-09-04 — billing decided, quota unchanged, and the sample re-aimed

Vaibhav enabled billing and decided the shape at the same time: **sample, do not judge
everything.** Both halves are recorded because only one of them took effect.

- **The decision landed.** The sample is now stratified (E7-S6): quotas for the cases the
  rubric was written for, a `uniform` stratum that is never empty, and a disagreement rate
  that refuses to read the rows drawn for being hard.
- **The quota did not, and the record can now say why.** Sweeps #19–#21 scored 1, 0 and 0 of
  22. The stored reason was `llm_no_credit` with Google's prose and two URLs — and nothing
  else, because the detail was truncated one word before the metric name (**BUG-041**). With
  that fixed, the record says it outright:

  ```
  … generate_content_free_tier_requests, limit: 20, model: gemini-3.8-flash
  ```

  **`free_tier`.** Billing on the account is not the API key's project being on the paid tier.
  That distinction was invisible for three sweeps and is one string now.
- **Coverage arrives a few rows at a time, and that is the honest shape of it.** Sweep #22
  scored 8, #23 scored 5. The corpus is not going to be judged; the strata decide which rows
  the trickle is spent on, and `/api/judge` prints judged-over-total per stratum so a gap
  reads as a gap.
- **The first ungrounded rows were judged on 2026-09-04, and the signal was worth the wait.**
  Three of four: *"Charts paint instantly"* against a source saying *"the first chart paints in
  under two seconds"* — **the judge independently corroborated the grounding code on rows it
  had flagged.** The fourth went the other way: a constraint our citation matcher could not
  locate that the judge finds stated plainly. That is the **first measurement** of the
  paraphrase-brittleness declared at the top of this file, and it is a false *negative* —
  reported ungrounded, which is the safe direction, at a cost in PM effort.
- **None of it moved a number.** Those rows are excluded from the disagreement rate twice over
  — by the defensive rule and by the sampling rule — so the monitor's first useful observation
  changed no figure and gated nothing, which was the design.
- **Cost, measured rather than projected:** the judge has cost **$0.036 across 384 calls** in
  its whole life. The 351 refused calls cost nothing — a refusal carries no tokens — which is
  also why the unpriced-model rows in `llm_calls` are honestly zero.


## The metrics were recomputed by other code, not by another person (E8-S1, decided 2026-09-04)

E8-S1's gate was **a human recomputing each published figure from its own rows**. That has not
happened, and this is the decision to stop waiting for it rather than to keep an open ask
standing indefinitely.

What exists instead is `review-ui/scripts/recompute-metrics.mjs`: an **independent JS
derivation** of M1–M5 that shares no code path with `metrics.mjs`, derives its comparison
precision from the published value rather than assuming one, and carries a control (M5-C)
that recomputes the double-counting version to prove the checker can tell them apart. It is
6/6, and it caught a real disagreement while being written — M3 at four decimals against a
figure published at three.

**What that is worth, stated plainly: it is a second implementation, not a second author.**
Two derivations written by the same author from the same understanding will agree about a
misunderstanding. A person with the rows and a calculator would be independent in the way
that matters, and nothing here substitutes for it.

**Why it is enough to proceed on.** Every figure it checks already ships beside its own
caveat, and the caveats are computed rather than written — M4's magnitude says it measures a
harness, M5 names how many approved versions were hand-made and cost nothing, M2 prints the
count that would change its reading. **A wrong figure here misleads nobody who reads the row
next to it.** The gate was a good idea for numbers presented bare; these are not presented
bare.

To close it properly: one person, the five queries in `docs/metrics.md`, and half an hour.
