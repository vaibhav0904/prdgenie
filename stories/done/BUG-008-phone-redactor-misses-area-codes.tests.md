# Test cases: BUG-008 The phone redactor misses two-digit area codes

The bug is a **leak**, so the cases are written to make a leak impossible to pass rather
than to make the fix look right. Three properties matter, in this order:

1. All five of H2's labelled numbers are gone from storage.
2. Nothing that was already redacted stops being redacted.
3. **Nothing that is not a phone number starts being redacted** — this is the one the fix
   is most likely to break, because widening a pattern is how over-redaction begins, and
   over-redaction destroys the source text a citation has to match against (ADR 0003).

| # | Case | Steps | Expected | Status | Evidence |
|---|---|---|---|---|---|
| TC1 | **The three missed numbers are redacted** | `redact()` on H2's `raw_text` | `+44 20 7946 0812`, `07700 900412` and `+39 02 8088 1140` all absent from the output | **Pass** | verify-redaction TC1 — all three gone |
| TC2 | **The two that already worked still work** | Same call | `+44 161 496 0033` and `+39 335 774 2210` absent | **Pass** | verify-redaction TC2 — both still gone |
| TC3 | **All five, through the real door** | POST H2 to `/webhook/ingest`, read `source_documents.raw_text` back from SQLite | Zero of the five labelled phone values appear in stored text. Storage, not the function's return value — the leak is only real if it reaches the database | **Pass** | H2 → DOC-2026-0093 via /webhook/ingest; 0 of 5 phone values in stored raw_text |
| TC4 | **Emails are untouched by the change** | Same stored row | All 8 labelled email values absent, as before | **Pass** | 8/8 email values gone, same stored row; 13 redactions recorded |
| TC5 | **Negative control: the guard still refuses non-numbers** | `redact()` over a corpus of near-misses: `2024-2026`, `v1.2.3`, `10.0.26200.9106`, `41 000 000`, `9 780 141 036 137` (ISBN), `2026-09-02`, `1 2 3 4 5 6 7 8 9`, a bare `40459fc` | **None** redacted. A digit run is not a phone number | **Pass** | 12 non-phone samples survive intact. **The old rule failed this** — it turned 9 780 141 036 137 into 9 [PHONE-1] 137 |
| TC6 | **Negative control: the fix can fail** | Revert the pattern to the old one, run TC1, confirm it fails naming the survivors, restore | TC1 goes red with the old pattern and green with the new. A check never seen to fail is an assumption (BUG-001) | **Pass** | negative-control-redaction.mjs — old pattern exits 1, TC1 red naming all three; file restored byte-for-byte (9523 bytes); green again |
| TC7 | **No other fixture's redactions change** | Run `redact()` over all nine fixtures before and after the fix, diff the redaction lists | Only H2 differs, and only by gaining the three numbers. A change to T1/T3's stored bytes would invalidate every citation offset in the corpus (ADR 0003, BUG-006) | **Pass** | 8 other fixtures unchanged byte-for-byte |
| TC8 | **The guard operates on the candidate region, not on a partial match** | A number whose leading group is 2 digits and whose total is ≥9 | Redacted whole, not partially. The old failure mode was: match part → guard rejects the part → whole number survives. Assert the *whole* labelled value is gone, not merely that something was replaced | **Pass** | no 6-digit tail of any labelled number survives in the redacted digit stream |
| TC9 | **Redaction count and kind are recorded** | Inspect `pii_redactions` on the stored row | Five `phone` entries for H2, each with a `count` ≥ 1 and a `[PHONE-n]` replacement | **Pass** | 5 phone records, [PHONE-1..5], each count ≥ 1 |
| TC10 | **Coverage is asserted** (BUG-003) | The check compares labelled phone values *examined* against labelled phone values that *exist* in H2's label file | 5 of 5 examined. A test that checks three of five and reports "0 leaks" is the BUG-003 failure | **Pass** | 21 labelled = 5 phone + 8 email + 8 name; all examined |
| TC11 | **Eval gate** | `/eval C2` | C2's PII rule improves from **11 of 21 surviving** to **8 of 21** — the eight `customer_name` values, which are BUG-009 and out of scope here. C2 still FAILS overall, and that is the correct outcome for this card | **Pass** | 2026-09-02-C2-run4: **8 of 21 survived** (was 11). The 8 are exactly the customer_name values. C2 still FAIL on those plus BUG-004. C1-run4 unchanged: T1 93.3/93.3, T3 100/77.8 |

## Out of scope, deliberately

- **The eight names** are BUG-009, a separate card with a scope decision already taken
  (adjacency redaction plus a narrowed claim). Folding them in here would make one card
  answer for two root causes — one a bad pattern, one a missing implementation.
- **C2 going green.** It cannot, and must not appear to. BUG-004 and BUG-009 both remain.
  TC11 asserts the *specific* improvement rather than the case's verdict, so this card
  cannot be credited with someone else's fix.

## Notes

- **The fixture is not enough evidence.** H2's five numbers were chosen adversarially by
  their author and still only covered two shapes — that is the whole lesson of this bug. TC5
  and TC7 exist because the fix has to be judged on what it does to text nobody labelled.
- `redact()` runs **after** `canonicaliseText()` and before storage (BUG-006), so every case
  that reads storage is also, incidentally, asserting that ordering has not moved.

## Evidence

```
.\run.cmd review-ui/scripts/verify-redaction.mjs           11/11 passed
.\run.cmd review-ui/scripts/negative-control-redaction.mjs  9/9  passed
.\run.cmd evals/harness/produce.mjs                         9/9 fixtures
.\run.cmd evals/harness/grade.mjs                           C1 PASS, C2 FAIL (expected)
```

**11 of 11 rows Pass.** Two things are worth reading rather than skipping:

**TC5 caught something this card did not describe.** Under the pre-fix pattern the
over-redaction control *also* goes red — `9 780 141 036 137` became `9 [PHONE-1] 137`. The
bug was filed as under-matching, from a failing eval that showed three numbers surviving.
It over-matched too, and nothing in the fixture could have shown that, because the fixture
contains no ISBN. It surfaced only when the old rule was run against text chosen to break
the new one. The card is amended.

**TC11 is deliberately not "C2 passes".** C2 still FAILs, correctly: 8 of 21 values survive
and all eight are the `customer_name` values that BUG-009 owns, plus the requirement-free
document still producing requirements (BUG-004). Writing this row as the case's verdict
would have credited this card with two fixes it did not make, or blocked it on two bugs it
does not own.
