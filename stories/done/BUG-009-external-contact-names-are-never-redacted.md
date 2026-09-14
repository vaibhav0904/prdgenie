# BUG-009: External contact names are never redacted, and no code ever tried

**Found while:** E2-S3, C2's first run
**Severity:** major — it is a PII leak against a documented 100% floor
**Needs a decision from Vaibhav** before it can be fixed. See "The question", below.

## Repro

Ingest fixture **H2** and inspect the stored `raw_text`.

## Expected / Actual

Eight labelled name forms belonging to four external individuals must not survive.
**All eight did:** `Rachel Okonkwo`, `Rachel`, `Daniel Vetrov`, `Daniel`, `Sofia Marchetti`,
`Sofia`, `Luca Bianchi`, `Luca`.

## Root cause

There is no rule. `review-ui/normalize.mjs` has exactly two `PII_RULES`, for email addresses
and phone numbers, both by pattern. Names were never implemented — not implemented badly,
not implemented partially. The answer key says twenty-one values must not survive; the code
was only ever capable of addressing thirteen of them.

This is not a regression. It has been true since E1-S2, and nothing could have noticed it:
the redaction test in that story checked that the emails and phones it *did* implement were
removed. **A check written from the implementation cannot find a missing implementation.**

## The question, which is not mine to answer

Names cannot be redacted by pattern the way an email address can. The realistic options,
with what each costs:

1. **Redact names adjacent to an already-redacted contact detail.** `Rachel Okonkwo
   <rachel.okonkwo@…>` gives the full name away for free, and once a full name is known its
   first name can be removed everywhere. Deterministic, zero dependencies, no model. Misses
   a name that never appears beside an email or phone.
2. **Redact by an explicit allow/deny list per product**, maintained as control-plane data.
   Precise and auditable; requires someone to maintain it, and it fails silently on the
   first name nobody added.
3. **Send the text to a model to find names.** Rejected on sight: it puts un-redacted PII
   through a provider, which is the thing redaction exists to prevent, and it makes the door
   non-deterministic. Recorded so nobody proposes it later as an improvement.
4. **Narrow the claim instead.** Change `docs/assumptions.md` to say external contact
   *details* are redacted and names are not, re-label H2 to match, and say so plainly in the
   deck's honesty ledger.

**Option 4 is a legitimate scope call and it is not a cop-out** — the system is a local
demo, internal stakeholder names are deliberately kept, and a narrower claim honestly stated
is worth more than a broad claim that leaks. But it means editing a label file, and
`evals/README.md` rule 2 says labels are never edited to match output. The rule has an
escape: a label may change when the *specification* changes, deliberately and in writing,
which is a different act from relabelling a failure. H2's own notes anticipate this exactly:
*"If that reading is ever changed, this label file changes with it and every fixture is
re-labeled — it is not fixed by relabeling H2 alone."*

So option 4 is available, but it costs a re-label of the whole corpus and an amendment to
`assumptions.md`. It is a product decision about what this system claims, and it belongs to
Vaibhav rather than to me.

## Recommendation

**Option 1, plus option 4 for what option 1 cannot reach.** Adjacency redaction gets the
common case deterministically and with no new dependency; the residual — a bare name that
never appears beside a contact detail — is then a written, narrow limitation rather than an
unbounded one. On H2, every one of the four individuals appears beside an email address at
least once, so option 1 would catch all eight forms.

## Lesson

**A floor of 100% on a category nobody implemented reads exactly like a floor that is being
met.** The claim ("named external individuals are redacted") lived in `assumptions.md`, the
answer key encoded it, and the code silently addressed a subset — for two epics. What made
it visible was a case that compared the *answer key* to *storage*, rather than testing the
code against its own idea of what it does.

---

## Fix, as applied 2026-09-02

**Vaibhav's decision: option 1 plus option 4** — adjacency redaction for what it reaches, a
narrowed written claim for what it does not. Implemented with one refinement that makes
option 1 considerably more precise than the card described.

**The anchor is the address, not proximity.** The card proposed redacting names *adjacent to
an already-redacted contact detail*. On H2 that would have gone wrong: the text reads

```
Northwind Logistics — Rachel Okonkwo, Head of Operations (rachel.okonkwo@…)
```

The capitalised phrase nearest the address is **"Head of Operations"**, and the one before
it is a company. Proximity picks the wrong span twice before it picks the person.

What identifies her is the address itself. `rachel.okonkwo@` names her; `northwindlogistics.com`
says she is external. So:

1. **Seed** from the local part of every *external* email — tokens of 3+ letters, split on
   `. _ % + -`. `rachel.okonkwo` → `rachel`, `okonkwo`. `d.vetrov` → `vetrov` (the initial is
   too short to be a name).
2. **Extend** by adjacency, but only from a token already confirmed: the capitalised word
   separated by a single space from a confirmed one joins the name. `Vetrov` → `Daniel Vetrov`.
   `Bianchi` → `Luca Bianchi`. Adjacency never *nominates* a name, so it cannot reach
   "Northwind Logistics" or "Head of Operations".
3. **Redact every occurrence**, capitalised or all-caps, never lower case.

**Internal domains are exempt**, from `INTERNAL_EMAIL_DOMAINS` (default `neuronforge.com`,
documented in `.env.example`, subdomains included). That is what keeps Dana, Marcus and
Priya while still removing their addresses — the exemption is for names, and an address is a
contact route rather than an attribution.

### One thing that nearly shipped

The first version matched case-insensitively. On H2 it passed everything: `rachel`,
`okonkwo`, `marchetti`, `bianchi` are not English words. But an external contact at
`will.smith@…` seeds the token `will`, and a case-insensitive rule then deletes the verb
from every sentence in the document.

That is BUG-008's over-matching failure relocated — a rule that works on the names it was
written against and destroys text on the next one. It is caught by TC18 now, which is a test
H2 could never have produced, because the failure needs a name the fixture does not contain.

## Evidence

- `verify-redaction.mjs` → **16/16**, of which **five rows assert that something is KEPT**:
  internal names, customer organisations, job titles, ordinary prose, and lower-case tokens.
  Three of those five test things that are not in the answer key at all — H2 alone could
  never have failed on them.
- `negative-control-redaction.mjs` → removing the name rule turns TC12 and TC16 red naming
  `Rachel Okonkwo` and `Luca Bianchi`, while TC13/14/15 stay green; the file is restored
  byte-for-byte.
- Through the real door: H2 as `DOC-2026-0103`, read back from storage — **0 of 21 labelled
  values survive**, 21 redactions recorded (8 email, 5 phone, 8 `customer_name`), internal
  names and organisation names intact, and all 6 of H2's own label quotes still resolve.
- `C2-run5`: **PII 0 of 21 surviving — the 100% floor met.** C2 still FAILs, on BUG-004 alone.

## What is deliberately still true

**A named external individual who appears with no email address and no phone number anywhere
in the document is not redacted.** "Marta Kowalski said the depot view was useless" survives.
This is the narrowed claim, now in `docs/assumptions.md` in those words, and asserted by
TC17 so it stays a decision rather than becoming a discovery. The claim this system makes is
*external contact details are removed, and external names are removed wherever a contact
detail identifies them* — not *no external individual is ever named*.

## Lesson, revised

The card's original lesson stands: *a floor of 100% on a category nobody implemented reads
exactly like a floor that is being met.* Implementing it added a second one.

**An answer key that lists only what must be removed cannot catch a redactor that removes too
much.** H2 names 21 values that must go and says nothing about the thousands that must stay,
so a rule that redacted every capitalised word would have scored 21/21 and passed the 100%
floor cleanly. The five KEEP rows exist because of that asymmetry, and three of them assert
things no label mentions.

Which generalises: **for any rule that deletes, the labels are half the test.** The other
half has to be written from what the rule must not touch — and nobody writes that down
unless they go looking for it.

---

## Resolution, 2026-09-02: withdrawn on review. Names are kept.

**The fix above was built, worked, and was removed the same day.** Vaibhav read the UAT and
reversed the decision:

> *"External contact details can be removed, but I would prefer keeping the external names
> if they are there. This will help us in two ways. If someone is not stating their
> designation but is an external user, then it might be a problem. I would say keep the
> name, and we can drop the contact details of external folks."*

The reasoning is a product one and it is right. Internal speakers carry a role — "Priya
(Eng Lead)" — so redacting their name still leaves an attribution. An external speaker
often carries nothing but a name, and then

```
[CUSTOMER_NAME-2] will not sign the pilot agreement until this is written down
```

is not an anonymised requirement. It is a requirement nobody can act on. **Redaction does
not anonymise here; it orphans.**

So the option chosen is neither 1 nor 4 as this card framed them, but the one the card did
not list: **narrow the claim all the way.** Contact details go, names stay. Two rules, no
internal/external distinction, no configuration, no adjacency machinery. `docs/assumptions.md`
now says so, together with what it costs — real external individuals' names reach the
database the moment a real transcript does, and those people have not agreed to that the way
an employee has. That is the right trade for a demo on invented data and it is the first
thing to revisit if this leaves the demo.

### What survives the reversal, and is worth more than the code did

**The answer key learned to test the other direction.** H2 now carries
`expected_retentions` — 22 values that must SURVIVE, across four kinds — and C2 fails on one
going missing.

That list exists because implementing name redaction exposed what the dataset could not see.
H2 named 21 values that had to go and nothing that had to stay, so **a redactor that removed
every capitalised word would have scored 21 of 21 and passed the 100% floor cleanly.**
Over-redaction was structurally invisible. It is now an auto-fail, and the negative control
proves it: adding a rule that eats every capitalised word turns C2 red on the retention half
while the contact-detail half still reports a perfect score.

The H2 relabel is a **specification** change, not a relabelled failure — the one escape
`evals/README.md` rule 2 allows, taken deliberately and in writing.

### Cost of the reversal, honestly

About two hours of work deleted, and it was not wasted: the retention half of the answer key,
the over-redaction control, and the finding that a case-insensitive name rule would delete
the word "will" from any document mentioning a contact called Will all came out of building
the thing that was then withdrawn. The code is in the history if the claim ever widens again.

**The part that would have been cheaper differently:** this card *named* the decision as
Vaibhav's and then recommended an implementation, and the recommendation was built before the
decision came back. Had the question gone to him as a question — *should an external name be
redacted at all?* — rather than as a recommendation with a fix attached, the two hours would
have been ten minutes. **A card that says "needs a decision from Vaibhav" should block on the
decision, not proceed on the recommendation.**

## Lesson, final

**A 100% floor on a category nobody implemented reads exactly like a floor being met** — the
original lesson, unchanged.

And: **an answer key that lists only what must be removed cannot catch a redactor that
removes too much.** For any rule that deletes, the labels are half the test; the other half
has to be written from what the rule must not touch, and nobody writes that down unless they
go looking for it. That half is now in the dataset rather than in a script, which is the
durable outcome of this card.

---

## Outcome — closed 2026-09-02, WITHDRAWN not shipped

**Resolved by decision, not by code.** Vaibhav's answer of 2026-09-02 reversed the premise:
names are kept, only contact details are removed. The implementation described above was
built, verified, and deleted the same day.

The card is filed in `done/` because it is closed, not because a fix shipped. What shipped
is the opposite: `review-ui/normalize.mjs` now carries a comment where the rule was, saying
why there is no rule.

**What this card actually delivered:**

1. **`expected_retentions`** — 22 values H2 must keep, across four kinds, and a C2 auto-fail
   when one goes missing. Before it, the dataset could not see over-redaction at all.
2. **The over-redaction negative control** — a rule that eats every capitalised word turns
   C2 red on the retention half while the contact-detail half still reports a perfect score.
3. **A narrower, truer claim** in `docs/assumptions.md`, with its cost stated.

None of those existed before this card, and all three survive it.

**Cost:** about two hours of deleted code, and a process lesson worth more — *a card that
names a decision as the owner's should block on the decision, not proceed on the
recommendation.*
