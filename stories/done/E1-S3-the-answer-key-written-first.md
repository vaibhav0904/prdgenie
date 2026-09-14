# E1-S3: The answer key, written before anything can be tuned to it

**As a** builder
**I want** nine labeled fixtures written before a single prompt exists
**So that** every quality number this project ever reports was measured against an answer key nobody could have written with one eye on the output

## Acceptance criteria

- [ ] Nine fixtures exist in `evals/datasets/docs/`: T1 kickoff transcript, T2 follow-up,
      T3 conflicting stakeholders, N1 notes, E1 email thread, F1 feature brief, G1 garbage,
      H1 hostile, H2 PII-heavy — all for the ForgeSight product described in
      `docs/assumptions.md`.
- [ ] Nine matching label files in `evals/datasets/labels/`, joined to their fixture by a
      stable id, each carrying the header rule verbatim:
      `"rule": "Labels written BEFORE any tuning. Never edit labels to match output."`
- [ ] Every labeled requirement lists **all** character regions in the fixture where it was
      stated — not just the first — because C1 matches by span overlap (ADR 0008) and a
      requirement stated twice must not score as a miss.
- [ ] Labels for T2 name exactly four delta items against T1 (2 modified, 1 contradicted,
      1 added), and T2 restates at least three requirements verbatim that are **labeled as
      unchanged** so C5 can measure churn.
- [ ] T3 labels name three conflicts, one of them phrased politely enough to read as
      agreement.
- [ ] G1 is labeled as containing **zero** requirements. H1 labels name its three injection
      payload strings exactly. H2 labels name every email, phone number and external
      customer name that must be redacted.
- [ ] **No prompt file exists yet, and none is written in this story.** Verified by
      `n8n/prompts/` being empty at the end of it.

## Depends on
- E1-S2 — labels must be written against the **post-redaction** `raw_text` that the door
  actually stores, or every span region in C1 is silently misaligned.

## Eval gate
- none — this story *creates* the ground truth that C1–C6 grade against. It is graded by
  nothing, which is exactly why the ordering rule matters.

## Technical notes

- **This is a long story with no code in it, and that is the point.** It is the story that
  makes every later eval number honest. Resist compressing it because it feels like
  overhead — labels written later, under time pressure, once prompts exist, are the
  specific failure the labels-before-tuning rule exists to prevent.
- Write the fixtures **adversarially and say so** (`evals/README.md`). T1 should have
  interruptions, half-finished sentences and one decision reversed mid-meeting. Clean
  minutes would make extraction look better than it is.
- G1's correct output is *nothing*. A system that always finds requirements is broken, and
  G1 is how that gets caught.
- H1's three payloads should differ in kind: one instruction override, one fake requirement
  injected as if legitimate, one exfiltration attempt. E7's tripwire will be built to catch
  exactly these strings — which is why H1 must be written now, by someone who has not yet
  seen what the system catches.
- Labels are written against the stored `raw_text`, so run each fixture through the E1-S2
  door first and label the result — not the draft file.
- Six of the nine fixtures exercise nothing until E2–E7. Write them anyway (PRD-E1, decided
  2026-09-01).

## Outcome (2026-09-01)

**Verified by running.** 15 rows Pass. Nine fixtures, nine label files, **54 labelled
requirements and 14 open questions**, and **107 quote regions that all resolve as exact
substrings** — checked against the authored files and again against the post-redaction
text the door actually stores (9/9).

**Promoted on mechanical evidence, with one part deliberately left open.** The
`.uat.md` has a Part 2 that only Vaibhav can do — reading T1 beside its labels and asking
whether any real requirement is missing, whether anything labelled is not really a
requirement, and whether the mid-meeting reversal is recorded at its final position. That
is a judgment a machine cannot make, and under the G6 scoping it is exactly the kind that
needs a human. **Label edits are free now and not after E1-S4** — that is the
labels-before-tuning rule, and this is the last moment changing them costs nothing.

**What was surprising.**

1. *TC13 passed while skipping the fixture it existed for.* It matched fixtures to stored
   rows by comparing the first 60 characters — which cannot work for H2, because redaction
   rewrites text inside those characters. It reported "8 fixtures checked; 0 broken" and
   went green. BUG-003. Fixed by having `produce.mjs` write a run manifest and by making
   the row **assert its own coverage**: 8 of 9 is now a failure, not a footnote. Had it
   survived, C2's 100% PII floor would have been computed over a fixture nothing verified.
2. *The negative control for TC14 was itself broken on the first attempt* — a PowerShell
   `-replace` that silently matched nothing, so the "control" passed without corrupting
   anything. Three variants of one disease in a single epic: a check that repairs its
   subject (BUG-001), a check that skips its subject (BUG-003), and a control that never
   breaks its subject.
3. *`missing_nfr` cannot be span-matched at all.* An open question about a category the
   sources never mentioned has no evidence span by construction. ADR 0008 was amended with
   a narrow exception — category matching for that kind only, reported separately in C4 so
   the cheap-to-game half is never averaged into the honest half.

**Judgment calls recorded rather than buried.** Redaction covers external *individuals*,
not their companies — "Northwind needs SSO" is the requirement, and redacting the company
would gut the corpus. Internal email addresses are redacted even though internal names are
not. Both are now in `docs/assumptions.md`, with the consequence stated: reversing the
first means re-labelling all nine fixtures, not patching H2.

**What this card cannot claim.** The fixtures are written about an invented product by the
same project that will be scored on them. They are adversarial on purpose, but no number
measured on them transfers to real transcripts without saying so. T1 also runs ~1,124
words against a 400–900 aim; fitting 14 requirements plus a reversal into 900 made it read
like clean minutes, which is the failure the card warned against — length was the honest
trade.
