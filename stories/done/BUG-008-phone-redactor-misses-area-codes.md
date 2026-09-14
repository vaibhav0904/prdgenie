# BUG-008: The phone redactor misses two-digit area codes

**Found while:** E2-S3, C2's first run
**Severity:** major — it is a PII leak, and the 100% floor exists because there is no
acceptable number of these

## Repro

Ingest fixture **H2** and inspect the stored `raw_text`.

## Expected / Actual

Five labelled phone numbers must not survive. **Three did:**

| Number | Redacted? |
|---|---|
| `+44 20 7946 0812` | **no** |
| `07700 900412` | **no** |
| `+39 02 8088 1140` | **no** |
| `+44 161 496 0033` | yes |
| `+39 335 774 2210` | yes |

## Root cause

The rule in `review-ui/normalize.mjs`:

```js
{ kind: 'phone', re: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3,4}[\s.-]\d{3,4}(?:[\s.-]\d{3,4})?/g }
```

It requires every unparenthesised group to be **3 or 4 digits**. The two survivors with a
country code have a **two-digit** area code — London's `20`, Milan's `02` — so the pattern
cannot start at the `+`, and what it can match further along (`7946 0812`, `8088 1140`) is
eight digits, which the ≥9-digit guard then correctly rejects. `07700 900412` fails for the
same reason from the other end: `7700 9004` is eight digits.

The two that *were* caught both happen to have three-digit groups. So the rule works on the
shapes it was written against and fails on two of the most common phone formats in Europe.

## Why the guard made it worse, and why the guard is still right

The `>= 9 digits` check exists so a date range or a version string is not redacted as a
phone number. It is correct. Here it turned a partial match into a total miss — the pattern
found *part* of a real number, the guard rejected the part, and the whole number survived.

That is the shape of the bug worth remembering: **a validity guard applied to a bad match
does not fail safe.** It converts "redact too little" into "redact nothing", silently.

## Fix (not applied here)

E2-S3's technical notes say a redaction defect is filed rather than patched inside the
grading story, because the bug is in E1-S2's code and fixing it inside the case that found
it makes the case its own repair.

The direction: allow two-digit groups, keep the ≥9-digit guard, and make the guard operate
on the **candidate region** rather than on a partial match. A fixture is not enough evidence
on its own — the fix ships with the negative control run once, and with a check that no
existing redaction regresses.

## Lesson

**A pattern tested only against the examples it was written from is an assumption.** H2's
five numbers were chosen adversarially by the fixture author and still only two shapes were
covered. The leak was invisible for two epics because nothing compared the labels to the
stored text until C2 existed — which is the argument for writing the answer key before the
code, and then actually running it against storage.

---

## Amendment, 2026-09-02: the bug was worse than filed, and the control found it

This card described an **under-matching** bug: real numbers surviving. Running the negative
control — putting the old pattern back and requiring the check to go red — showed the old
rule **over-matched as well**.

```
input   The figure is 9 780 141 036 137 and that is all.
old     The figure is 9 [PHONE-1] 137 and that is all.
```

An ISBN, with its middle replaced. The old pattern took the three 3-digit groups it liked
(`780 141 036`), the ≥9-digit guard was satisfied by exactly nine, and it redacted them —
leaving the first and last groups stranded in the text.

So the same rule leaked the things it existed for and corrupted a thing it did not. Both
failures have one cause: **it matched a shape of digit groups instead of the shape of a
phone number.** That is the argument for the fix being structural rather than a widened
character class, and it is now asserted in the control rather than left as an anecdote.

**Why this mattered and was not obvious.** Over-redaction does not break the grounding
check — the model reads the post-redaction text and quotes that, so the citation still
resolves. What it breaks is the document a PM reviews, and any requirement whose content
was the number. The original code carried a comment saying the pattern was *"deliberately
greedy about separators because a missed phone number is a leak and a false positive is
only noise"*. The first half was right. The second half was the reason the greedy pattern
was never questioned, and it was wrong.

## Fix, as applied

`review-ui/normalize.mjs`. A phone number is matched by **shape** — it announces itself as
one of three things:

| | Example |
|---|---|
| international | `+44 20 7946 0812`, `+39 02 8088 1140`, `+442079460812` |
| national trunk | `07700 900412`, `0207 946 0812` |
| parenthesised | `(0161) 496 0033`, `(415) 555-0123` |

Groups are 2–6 digits, so a two-digit area code is no longer excluded. Lookarounds stop a
match starting or ending inside a longer token — without the lookbehind,
`10.0.26200.9106` offers `26200.9106`, which is nine digits and would have passed the
guard. The guard itself now runs on the **whole candidate region** and bounds it at 9–15
digits (E.164), which is the half of the bug the pattern alone does not fix: applied to a
partial match, a validity guard fails open.

**Known and deliberate gap:** a bare national number with no trunk zero and no country code
— the US `415 555 0123` written without parentheses — is not matched. Catching it means
matching any three digit groups, which is the old rule and the reason this bug exists. No
such number is in the corpus. The limit is written in the code beside the decision.

## Evidence

- `.\run.cmd review-ui/scripts/verify-redaction.mjs` → **11/11**, including 12 non-phone
  samples that must survive and 6 phone shapes absent from the fixture that must not.
- `.\run.cmd review-ui/scripts/negative-control-redaction.mjs` → the pre-fix pattern makes
  the check fail, naming all three survivors and the ISBN it mangled; the file is restored
  byte-for-byte and the check goes green again.
- Through the real door: H2 ingested as `DOC-2026-0093`, read back from
  `source_documents.raw_text`. **All 5 phone values and all 8 email values gone; 13
  redactions recorded.** The 8 survivors are exactly the `customer_name` values — BUG-009.

## Lesson, revised

The card's original lesson stands: *a pattern tested only against the examples it was
written from is an assumption.* The control added a second one.

**A bug report is a hypothesis, and the control is what tests it.** This card was written
from a failing eval that showed three numbers surviving, so it described an under-matching
bug — accurately, and incompletely. Nobody would have found the over-matching half by
reading the code or by re-reading the fixture, because the fixture contains no ISBN. It
appeared the moment the old rule was made to run against text chosen to break the *new* one.

**Write the negative control against the fix, then run it against the bug.** That is a
different act from re-running the failing case, and it is the one that told us what the
defect actually was.

---

## Outcome — promoted 2026-09-02

**Signed off by Vaibhav's answers of 2026-09-02**, which settled every question this UAT
asked. Two confirmations remain on the review page — does the stored document read right to
a PM, and is the cost worded strongly enough for the deck — and neither gates this card;
both are recorded so they cannot be lost.

11 of 11 rows Pass. A phone number is matched by **shape**, not by digit-group size. C2's
contact-detail half is at 0 of 13 surviving and the case now fails on BUG-004 alone.

**The finding worth keeping:** this card described an under-matching bug, accurately and
incompletely. The negative control — the old rule run against text chosen to break the new
one — showed it *also over-matched*, turning `9 780 141 036 137` into `9 [PHONE-1] 137`.
Nobody would have found that by re-reading the fixture, which contains no ISBN.

**Write the control against the fix, then run it against the bug.** That is a different act
from re-running the failing case, and it is the one that told us what the defect actually was.
