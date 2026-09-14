# UAT: BUG-008 and BUG-009 — what redaction removes

**One card would have been dishonest and three pages would have been a scavenger hunt.**
These two bugs have different root causes — one a bad pattern, one a missing implementation
— but they are the same claim to a reader: *does PII reach the database?* So they are fixed
separately, tested separately, and reviewed together.

**The review page:** <https://claude.ai/code/artifact/ee0e1894-64e9-48c9-aa16-79634f7ce766>

Built from the live database (G6b): fixture H2 before and after the door, every one of the
21 labelled values with its status, everything that stays on purpose, and the gap the
narrowed claim admits to. Nothing to open, nothing to run.

---

## The mechanical half — signed off by evidence, not by you

Per the G6 scoping of 2026-09-01, a criterion whose expected result is stated exactly is
signed off by running it. These were run; the output is in the `.tests.md` files.

```
.\run.cmd review-ui/scripts/verify-redaction.mjs            16/16 passed
.\run.cmd review-ui/scripts/negative-control-redaction.mjs  both scenarios red, then green,
                                                            normalize.mjs restored byte-for-byte
.\run.cmd evals/harness/grade.mjs                           C1 PASS · C2 FAIL (BUG-004 only)
```

- **21 of 21** labelled PII values removed, read back from `source_documents.raw_text` after
  a real `POST /webhook/ingest` — document `DOC-2026-0103`. The PII floor is met.
- **Five checks assert that something is KEPT**, and three of those test things no label
  mentions: internal stakeholder names, customer organisations, job titles, ordinary
  capitalised prose, and lower-case tokens.
- **Both negative controls go red on demand** and the working tree is byte-identical after.
- H2's own six label quotes still resolve against the newly stored text.

If you want to see any of it fail with your own hands, that is the second command above —
it breaks each fix in turn and restores it.

## The half only you can do — three questions, all on the page

1. **Is the narrowed claim one you are willing to make?** *"External contact details are
   removed, and external names are removed wherever a contact detail identifies them."* Not
   *"no external individual is ever named."* A person mentioned with no address and no phone
   number anywhere in the document is **not** redacted, and the page shows exactly that case.
   The three alternatives are listed with what each costs; none is free.

2. **Should internal stakeholder names still be kept?** Dana, Marcus, Priya and Tom stay by
   design — their addresses do not. This predates both bugs and is worth re-confirming now
   that names are redactable at all. Reversing it is one config change and it removes
   "Priya asked for this" from every requirement.

3. **Should customer company names still be kept?** `assumptions.md` calls this *"the single
   most likely place a reader disagrees"*. Reversing it means re-labelling all nine fixtures,
   not patching H2 — so it is much cheaper to settle now than at release.

**Sign-off:** reply "UAT passed for BUG-008 and BUG-009", or use the buttons and paste the
summary back.

---

## What this UAT cannot claim

**One document.** H2 is the only fixture of the nine that contains an email address at all,
so the name rule is exercised on a single file written by the person who reads the result,
about an invented company. Seven synthetic shapes are tested beside it — an internal
subdomain, a surname-only local part, a company adjacent to an external address, the known
gap — precisely because a fixture is not enough evidence. That is BUG-008's lesson, and it
was earned twice: the case-insensitive version of the name rule passed everything H2 could
throw at it and would have deleted the word "will" from any document containing a contact
named Will.

**C2 still fails.** On BUG-004 alone — the requirement-free document still produces
requirements. Two of C2's three auto-fail rules now pass. The case going green is not what
is being claimed here, and a reader who sees "PII 100%" should read the sentence under it.

---

## Amendment, 2026-09-02: answered, and the answer reversed the fix

Vaibhav's reply:

> *"External contact details can be removed, but I would prefer keeping the external names
> if they are there… If someone is not stating their designation but is an external user,
> then it might be a problem."*

Plus: **keep internal names**, **keep company names**. So the policy is now simply
**contact details out, names in** — and the name-redaction rule built for BUG-009 was
removed the same day.

**The review page has been rebuilt** at the same link and now shows what actually shipped:
13 contact details removed, 22 names and organisations kept, and why the feature was built
and withdrawn. Two questions remain on it, both small — does the stored document read right
to a PM, and is the cost worded strongly enough for the deck.

**Re-verified after the reversal:**

```
.\run.cmd evals/harness/verify-labels.mjs                   13/13 passed
.\run.cmd review-ui/scripts/verify-redaction.mjs            13/13 passed
.\run.cmd review-ui/scripts/negative-control-redaction.mjs  both scenarios red, tree unchanged
.\run.cmd evals/harness/grade.mjs                           C1 PASS · C2 FAIL (BUG-004 only)
```

C2 run 6, `DOC-2026-0117`: **0 of 13** values that must go survived; **0 of 22** values that
must stay were redacted.

**What changed in the answer key, and why it is allowed.** H2's eight `customer_name` entries
moved out of `expected_redactions` and into a new `expected_retentions` list. That is a
**specification** change, which is the one escape `evals/README.md` rule 2 permits — taken
deliberately and written down, as distinct from relabelling a failure.

**The half that outlasts the reversal.** `expected_retentions` also carries the internal
names, the customer organisations and the job titles, none of which were ever labelled. Until
today H2 listed only what must GO, so **a redactor that removed every capitalised word would
have scored 21 of 21 and passed the 100% floor cleanly.** C2 now fails on a retention going
missing, and the negative control proves it can: adding a rule that eats every capitalised
word turns C2 red on the retention half while the contact-detail half still reports a perfect
score.

**One process note, filed against myself.** BUG-009's card said *"needs a decision from
Vaibhav"* and then recommended an implementation — and the recommendation was built before
the decision came back. Had the question gone over as a question, two hours of work would
have been ten minutes. **A card that names a decision as the owner's should block on it, not
proceed on the recommendation.**

## Sign-off — Vaibhav, 2026-09-02

| Question | Answer |
|---|---|
| Is the narrowed claim one you are willing to make? | External contact details removed; **external names kept** — an external speaker who never states their designation is a signal worth preserving. |
| Should internal stakeholder names still be kept? | **Keep internal names.** |
| Should customer company names still be kept? | **Keep company names.** |
| Does the stored document read the way you intended? | **"Yes — this is right."** |
| Is the cost stated strongly enough for the deck? | **"Wording is right."** |

**Both cards close.** `docs/assumptions.md` states the claim in the form he approved —
*redaction removes contact details, it does not remove names* — with the cost named in the
same breath: real external names reach the database the first time a real transcript
arrives. That sentence ships to the deck unedited.
