# BUG-004: Extraction returns 14 requirements from a document that contains none

**Found while:** E1-S4, first live extraction run
**Severity:** major — it defeats the fixture written specifically to catch it, and it gates C1/C2 in E2

## Repro

1. Ingest fixture **G1** (an all-hands about parking permits, the holiday calendar and the
   coffee machine).
2. `POST http://localhost:5678/webhook/generate` with its `doc_id`.

## Expected / Actual

- **Expected:** `total: 0`. G1's labels say `expected_requirements: []`, and the prompt
  says explicitly that "meeting logistics, holiday schedules, office facilities and social
  chatter are not requirements, even when phrased with 'must' or 'should'".
- **Actual:** `status=ok total=14 grounded=14`. Fourteen confidently-cited requirements,
  every one of them correctly quoted from a document about parking.

## Root cause (initial diagnosis — not yet fixed)

Not a grounding failure: all 14 are *genuinely* quoted, and the grounding check is right to
mark them grounded. The quotes are real; the *judgement* that they are product requirements
is wrong.

G1 was written deliberately full of requirement-**shaped** language about non-product
things — "permits must be displayed on the dashboard of the vehicle", "it must be descaled
weekly", holiday carry-over caps. The fixture author flagged this in G1's notes as the
trap. The model is pattern-matching on modal verbs and obligation phrasing rather than on
whether the subject is *the product*.

Notably, "displayed on the **dashboard** of the vehicle" is a near-miss for this product's
own domain language, which makes G1 a harder negative than it first appears.

The prompt's refusal instruction is present but weak: it names the categories to ignore in
one sentence, and gives no positive test for what makes something a product requirement.

## Fix (deliberately deferred to E2-S2/E2-S3)

**Not fixed in E1-S4, on purpose.** That story's technical notes say: *"Do not tune the
extraction prompt against the fixtures in this story. Get it working on T1; quality
iteration belongs in E2 where a case can say whether an iteration helped."* Changing the
prompt now would be tuning with no scoreboard — I would have no way to tell whether a fix
helped G1 while quietly hurting T1's recall.

The likely direction, to be tested under C1 and C2 rather than asserted:
- give the prompt a positive test ("does this constrain the software product being
  discussed?") rather than only a list of exclusions;
- consider a required `subject` field per requirement, so the model must name what the
  requirement is *about* — a closed field is harder to hand-wave than a prose rule.

PRD-E2's decision applies: at most **three prompt iterations**, then a diagnosed failure
pattern rather than more attempts.

## Measured, 2026-09-01 (E2-S3)

C2 now grades this rather than describing it. G1's requirement count across the prompt
versions E2-S2 produced, each an independent run:

| Prompt version | G1 requirements | Expected |
|---|---|---|
| `e1s4` (E1's) | 16 | 0 |
| `2951b0636a95` (iteration 1) | 15 | 0 |
| `7767a84fd2db` (iteration 2) | 14 | 0 |
| `7267c39b005e` (iteration 3, current) | 14 | 0 |

Three iterations of increasingly explicit refusal language moved it from 16 to 14. That is
not a trend toward zero; it is noise around "the model finds requirement-shaped sentences
wherever they are". The prompt now contains a positive test ("does it constrain the product
being discussed, or the commitment to deliver it?"), an explicit exclusion list, and a
worked contrast pair. G1 still produces fourteen.

**E2's three-iteration budget was spent on C1 in E2-S2, and this card does not get a fourth
attempt by the back door.** What the measurement adds is that the remaining candidate fix
is the *structural* one this card proposed at the outset — a required `subject` field
naming what each requirement is about — and not more prose. That is a schema change, it
affects every case, and it wants a decision rather than an afternoon.

Also worth recording: C2 confirms all fourteen are genuinely quoted and correctly marked
grounded. The grounding guarantee is working perfectly on a page of complete nonsense, which
is the point this card was filed to make.

## Lesson

**A confident, well-cited, entirely wrong answer is the failure mode this product is built
around, and grounding does not catch it.** Every one of those 14 requirements would pass
the grounding check, render with a clickable citation, and look trustworthy in the review
UI. Provenance proves *where a claim came from*; it says nothing about *whether the claim
should exist*.

That is the argument for G1 existing at all, and for `evals/README.md`'s rule that a
dataset must include an input whose correct output is nothing. It is also why C1's
precision half matters as much as recall: a system measured only on what it finds will
happily find everything.

Worth stating plainly in the deck: the grounding guarantee is narrower than it looks, and
this bug is the evidence.
