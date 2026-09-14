# BUG-020: `missing_nfr` is enumerated, not detected

**Found while:** E3-S4, reading the first full run rather than counting it
**Severity:** major — 12 of the 18 open questions the system produced are of this kind, and
the kind is close to worthless in its current form

## Repro

Produce all nine fixtures and run `.\run.cmd evals/harness/report-gaps.mjs`.

## Expected / Actual

- **Expected:** a `missing_nfr` where the document really is silent on a quality that
  matters to it. The prompt says so in as many words: *"Emit one only where the document
  really is silent… 'Covered badly' is not 'missing', and reporting it as missing makes the
  category worthless."*
- **Actual:** on **F1** and on **H1**, all **six** categories are emitted. Not five, not a
  judgement — the whole checklist, in order, phrased as questions.

| Fixture | `missing_nfr` emitted | of a possible 6 |
|---|---|---|
| F1 (feature brief) | 6 | 6 |
| H1 (hostile) | 6 | 6 |
| everything else | 0 | — |

**And the detail that settles what kind of defect this is:** F1 carries a *labelled*
`missing_nfr` — `F1-Q02`, about the brief committing publicly to an onboarding time and an
embeddable widget without stating the quality behind either. The detector **emitted all six
categories and still missed the one the answer key names.**

## Root cause — a hypothesis, not yet proven

A closed checklist in a prompt reads as a form to fill in. Given six named categories and a
document, the cheapest coherent response is one item per category, and each is individually
defensible: a nine-paragraph feature brief genuinely does not mention localization.

The instruction not to do this is a *prohibition*, which is the shape of instruction this
project has now measured three times as roughly two-thirds effective (BUG-007, BUG-004,
BUG-018). **This is the fourth instance of the same finding**, and it should be treated as
the expected behaviour of a prohibition rather than as a surprise.

## What NOT to do

**Do not spend prompt iterations on this yet.** There is no case that can say whether a
change helped: C4 is unbuilt, it belongs to E3-S6, and its old threshold is void. Tuning a
prompt against a report a human reads is exactly the "tune until it looks better" this
project's eval rules exist to prevent.

## Candidate fixes, for when C4 exists

1. **Give it a destination instead of a prohibition** — the move that worked for BUG-004.
   Require, per category, a `verdict` of `covered` / `partially` / `absent` **with a quote
   when it is anything but absent**. A category the model must find evidence for is a
   category it cannot claim for free, and the six-of-six answer becomes visibly wrong.
2. **Cap by document length or by requirement count.** Cheap, arbitrary, and a number
   nobody has chosen — it would make the report look better without making it truer.
3. **Drop `missing_nfr` from the contract.** Worth considering honestly. If the useful
   version cannot be built, a kind that fires six-for-six is worse than no kind at all.

Option 1 is the one that follows the project's own evidence. It is written here so the
choice is on record, not so it gets built before there is something to measure it with.

## Lesson

**A checklist given to a model is a form, and a form gets filled in.** The closed list was
chosen to stop the categories drifting run to run — which it does, and which was the right
call for stability. The cost, unnoticed until the output was read rather than counted, is
that a closed list also tells the model exactly how many answers are expected.

---

## FIXED — 2026-09-03, and the defect was narrower than this card said

**Unblocked by C4 existing.** The card's own instruction was *do not tune this until C4 exists
to say whether a change helped*, and the first thing C4 said was that this card's evidence had
moved: `missing_nfr` was emitted on **F1 only** — all six categories, every run — and on no
other fixture, where the card had recorded "F1 and H1".

### What was actually wrong

F1's labels expect two open questions: an `unanswered` about a French request the brief defers,
and one `missing_nfr`. The detector emitted **six generic `missing_nfr`** and **no
`unanswered`** — including *"What are the plans or requirements for localization?"* on a brief
that **explicitly discusses localization** and defers French.

So the defect was not "it enumerates". It was: **a quality the document raises and leaves open
was being filed as a quality the document never mentions** — which loses the specific question
and replaces it with a category.

### The fix: a redirect, because `unanswered` is where that item belongs

> **A quality the document RAISES and leaves open is `unanswered`, not `missing_nfr` — and it
> is the more useful of the two.** A PM can act on *"they asked for French and nobody said yes
> or no"* and can do nothing at all with *"what are the localization requirements?"*

Prompt `df8499a97cb1` → **`ace1eb4ba436`**. Three runs:

| | before | after |
|---|---|---|
| F1 `missing_nfr` | 6 / 6 / 6 | **0 / 0 / 0** |
| F1's labelled `unanswered` (French) | 0 of 3 | **3 of 3** |
| `T4-Q04`, the labelled unanswered C4 had never found | 0 of 3 | **found** |
| Template questions across the dataset | 18 | **0** |
| C1 · C2 · C3 | pass | **pass** |
| C4 | fails 2 of 3 (BUG-025) | unchanged — still R1 |

And the new items are specific and quoted, not categories: *"How long do we keep it?"* (T1),
*"does last 30 mean rolling or calendar month"* (N1), *"Tell me which of the four you want in
the pilot"* (H2).

### The probe that stopped this being over-claimed

**Does the category still fire at all?** A brief written to be genuinely silent about every one
of the six — a bookmarks feature, five requirements, no quality mentioned anywhere
(`DOC-2026-0646`) — came back with **all six**, phrased as templates.

**And that is correct.** The document really is silent about all six. The rule says emit one
where the document is silent, and it was.

So the honest closing statement is narrower than the card's title:

- **Fixed:** a quality the document *raises* is no longer reported as one it never mentions.
  That was the defect, it cost the specific question underneath it, and it is gone 3 of 3.
- **Not a defect:** six categories on a document that mentions none of them. That is the rule
  working.
- **Still unproven:** whether `missing_nfr` ever finds a *useful* single gap — F1's own
  labelled one is still missed. C4 reports the count and sets no threshold, which is the right
  place for it until a fixture is written to test it.

### The design question this leaves, with a recommendation

**Are six template questions useful to a PM, or are they the checklist read aloud?** My
recommendation: **leave the count uncapped and let C4 report it.** A cap would be a number
chosen to make the output look considered, and on a genuinely silent one-feature brief the six
are true. The screen shows them under *"what the room did not settle"*, where a PM can dismiss
six lines faster than they can discover a gap nobody mentioned.

**Re-run when:** C4, and F1's per-item detail specifically.
