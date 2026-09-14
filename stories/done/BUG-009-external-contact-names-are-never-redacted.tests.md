# Test cases: BUG-009 External contact names are never redacted

The risk here is the opposite of BUG-008's. There, the danger was missing a leak. Here the
danger is **over-redaction**, because names cannot be matched by pattern: "Rachel Okonkwo"
and "Northwind Logistics" are the same shape, and a rule keyed on "capitalised word near a
redacted contact detail" takes the internal stakeholders and the customer companies with it.

So five of these eleven rows assert that something is **kept**. Three of those keep things
that are not in the answer key at all — internal names, organisations, job titles — which
means H2 alone can never fail on them. That is deliberate: a fixture whose labels only list
what must go cannot catch a redactor that takes too much.

| # | Case | Steps | Expected | Status | Evidence |
|---|---|---|---|---|---|
| TC12 | **All eight labelled name forms are redacted** | `redact()` on H2's `raw_text` | `Rachel Okonkwo`, `Rachel`, `Daniel Vetrov`, `Daniel`, `Sofia Marchetti`, `Sofia`, `Luca Bianchi`, `Luca` all absent | **Pass** | verify-redaction TC12 — 8/8 gone |
| TC13 | **NEGATIVE CONTROL: internal names are KEPT** | Same call | `Dana`, `Marcus`, `Priya`, `Tom` all still present. Their *addresses* are still redacted — the exemption is for names, not contact routes | **Pass** | all four present; 3 neuronforge.com addresses still redacted |
| TC14 | **NEGATIVE CONTROL: customer organisations are KEPT** | Same call | `Northwind`, `Meridian`, `Halcyon` and their long forms all present. "Northwind needs SSO" *is* a requirement (`docs/assumptions.md`) | **Pass** | 6 org forms intact |
| TC15 | **NEGATIVE CONTROL: roles and ordinary prose are KEPT** | Same call | `Head of Operations`, `IT Security`, `Programme Lead`, `Customer Success`, `Slack` intact. "Head of Operations" sits *between* a company and a person in H2 — exactly where a proximity rule grabs the wrong span | **Pass** | 5 phrases intact |
| TC16 | **Every occurrence, not the first** | Same call | `Rachel's team runs eleven depots`, `Daniel will not sign`, `Sofia's assistant` — the bare first names go too. A redactor catching only the full name leaves the person identifiable | **Pass** | 8 name parts recorded; no bare form left |
| TC17 | **Shapes the fixture does not contain** | `redact()` on seven synthetic cases | Full name in the local part; surname-only with the first name adjacent; an internal domain; an internal **subdomain**; a company beside an external address; the known gap; and a seeded token in lower case | **Pass** | 7 cases, all correct |
| TC18 | **NEGATIVE CONTROL: a seeded token is not redacted in lower case** | `redact('We will ship it. Contact Will Smith at will.smith@acme.example.')` | `Will` and `Smith` gone; **`We will ship it.` intact**. Case-insensitive matching would delete the verb from every sentence | **Pass** | part of TC17; the rule matches `Rachel`/`RACHEL`, never `rachel` |
| TC19 | **Through the real door** | POST H2 to `/webhook/ingest`, read `source_documents.raw_text` back from SQLite | **0 of 21** labelled values survive. 21 redactions recorded: 8 email, 5 phone, 8 `customer_name` | **Pass** | `DOC-2026-0103` — 0 surviving, internal names and orgs kept |
| TC20 | **H2's own label quotes still resolve** | Substring-search H2's 6 requirement and open-question quotes against the newly stored text | All 6 resolve. Name redaction rewrites more of the document than phone redaction did; a quote that stopped resolving would silently turn into an ungrounded requirement | **Pass** | 6 of 6 resolve, 0 lost |
| TC21 | **NEGATIVE CONTROL: the fix can fail** | Remove the name rule, re-run | TC12 and TC16 go red naming `Rachel Okonkwo` and `Luca Bianchi`; TC13/14/15 **still pass** — with no name rule nothing is over-redacted, so a control that broke those would mean they are not really testing over-redaction | **Pass** | negative-control-redaction.mjs, BUG-009 scenario; file restored byte-for-byte |
| TC22 | **Eval gate** | `/eval C2` | C2's PII rule reaches **0 of 21 surviving** — the 100% floor met. C2 still FAILS overall on BUG-004, and that is the correct outcome for this card | **Pass** | 2026-09-02-C2-run5: **0 of 21 survived** — the 100% floor met. C2 still FAIL, on BUG-004 alone. C1-run5 unchanged: T1 93.3/100, T3 100/77.8 |

## Out of scope, deliberately

- **BUG-004.** C2 cannot go green here and must not appear to. The requirement-free document
  still produces requirements, and that is a different card.
- **The known gap.** A named external individual with no contact detail anywhere in the
  document is not redacted. That is not a bug to be fixed later — it is the claim, narrowed
  and written into `docs/assumptions.md`, and TC17 asserts it so it stays a decision rather
  than becoming a surprise.

## Notes

- **The anchor is the address, not proximity.** The local part identifies the person
  (`rachel.okonkwo@…`), the domain says whether they are external, and adjacency is used
  only to *extend* a name already confirmed by an address — never to nominate one. That is
  what keeps "Northwind Logistics" and "Head of Operations" out while still catching
  "Daniel Vetrov" from `d.vetrov@…`.
- `INTERNAL_EMAIL_DOMAINS` is configuration, not a constant, and is documented in
  `.env.example`. A subdomain of a listed domain counts as internal (TC17).

## Evidence

```
.\run.cmd review-ui/scripts/verify-redaction.mjs           16/16 passed
.\run.cmd review-ui/scripts/negative-control-redaction.mjs  both scenarios red, tree unchanged
.\run.cmd evals/harness/produce.mjs                         9/9 fixtures
.\run.cmd evals/harness/grade.mjs                           C1 PASS, C2 FAIL (BUG-004 only)
```

**11 of 11 rows Pass.** C2's PII rule went from **11 of 21 surviving** before BUG-008, to
8 after it, to **0 now**. Two of C2's three auto-fail rules pass; the case is red on
BUG-004 alone.

The number worth not misreading is the 100%. It means **every value the answer key lists**
is gone — and the answer key lists people whose contact details are in the document. A
named external individual with no address and no number anywhere is still not redacted, by
design, and `docs/assumptions.md` now says so in those words. TC17 asserts that gap so it
stays a decision instead of becoming a discovery.
