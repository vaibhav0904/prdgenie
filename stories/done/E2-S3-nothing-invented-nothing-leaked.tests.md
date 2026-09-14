# Test cases: E2-S3 Nothing invented, nothing leaked, nothing found where there was nothing

Written before any build work, per gate G3.
Runs as `.\run.cmd evals/harness/grade.mjs C2`;
the instrument's own checks live in `evals/harness/verify-grading.mjs`.

Row ids in the script are prefixed by story (`S3-TC7`), because `verify-grading.mjs` now
carries rows from two stories and bare numbers collided.

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | Case C2 exists, with its auto-fail rule stated **separately from** its score | A `grounded=1` quote absent from `raw_text` fails the case **at any accuracy** | **Pass** | `evals/cases/C2-grounding-fidelity.md`: three independent auto-fail rules, no score at all |
| TC2 | C2 verifies grounding **independently** | It reads the stored quote and the stored `raw_text` and does its own substring search — it never calls `grounding.mjs` or `/internal/grounding-check` | **Pass** | No import of `grounding.mjs`, no call to the endpoint, its own `includes()`. Disagreement with the stored `match_kind`: **0 of 69** |
| TC3 | The match-kind distribution is reported, not just the pass rate | Counts of `exact` / `whitespace_normalized` / `not_found` appear in the result | **Pass** | `exact 69 (100.0%)`, `whitespace_normalized 0`, `not_found 0`. Was 63 / 0 / 1 when this story was blocked |
| TC4 | **PII: 100% floor on H2** — **amended, see below** | Every labelled email and phone number is absent from storage, **and every labelled retention survives it**; one leak *or one erasure* fails the case | **Pass** | **0 of 13** values that must go survived. **0 of 22** values that must stay were erased — external_name 8, internal_name 4, organisation 6, role 4 |
| TC5 | **Garbage: G1 yields nothing** | Zero requirements and a `needs_review` park with reason `no_requirements_found` | **Pass** | **0 requirements**, parked `no_requirements_found`. Was 14 with a draft created (**BUG-004**, closed) |
| TC6 | The result file names every ungroundable quote **verbatim** | Not a count — the actual text, so it can be looked up in the source | **Pass, on the control only** | There are now **zero** ungroundable quotes in a real run, so nothing real exercises this row. It rests entirely on TC7's planted quote, which is printed in full. Said plainly because a row that only its own negative control can reach is a row one step from being untested |
| TC7 | **Negative control** — the auto-fail fires | Plant a fabricated citation on a `grounded=1` requirement; C2 must auto-fail naming it; remove it | **Pass** | On a DB copy: exit=1, `FATAL — 1 requirement`, quote named verbatim |
| TC8 | An honestly-flagged ungrounded requirement is **not** a failure | `grounded=0` with a quote that is genuinely absent costs nothing — it is correct behaviour | **Pass** | Same planted quote at `grounded=0`: reported, printed, **not** fatal |
| TC9 | Coverage is asserted (BUG-003) | Fixtures examined vs fixtures in the run; a gap fails the case | **Pass** | `8 of 8 grounding fixtures examined; PII fixture examined; garbage fixture examined`; a gap sets the verdict to FAIL |
| TC10 | **C2 passes** | Zero hallucinated-grounded, PII 100%, G1 empty | **Pass** | All three rules green, and **rule 2b as well**. C2 has now passed on 4 consecutive independent runs (runs 21–24) |
| TC11 | **The rule added after this story was written also passes** | Over-redaction is fatal: a labelled retention going missing fails the case | **Pass** | Rule 2b, added 2026-09-02 with `expected_retentions`. **Not in the original test plan** — recorded here rather than folded into TC4 silently |

## Notes

- **TC2 is the BUG-001 lesson applied to grading.** A case that called the same function it
  grades would agree with itself by construction. C2 re-implements the substring search —
  deliberately duplicated code, and the duplication is the point.
- **TC7 and TC8 are the two halves of the same rule**, and getting them the wrong way round
  would be worse than having neither. A quote that is not in the source and is *labelled*
  not-in-the-source is the system working. The fatal case is a quote that is not there and
  is marked as being there.
- **TC4 will exercise the gap between the labels and the redactor.** H2's answer key lists
  twenty-one values including eight forms of four external contact *names*; `normalize.mjs`
  redacts emails and phone numbers by pattern and nothing else. If names survive, the bug is
  in E1-S2's redactor and is filed as a BUG card, not patched inside this story
  (E2-S3 technical notes).
- **TC5 is BUG-004**, open since E1-S4 and deliberately unfixed until a case could say
  whether a fix helped. It is now measurable.
- Expect the grounding rate to be depressed by honest paraphrase. That is the correct
  direction to err in, and the fix is always a stricter prompt, never a looser matcher
  (ADR 0003).

## Evidence — first run, 2026-09-02 (the story was blocked here)

`.\run.cmd evals/harness/grade.mjs C2` → **FAIL**, exit 1.
`.\run.cmd evals/harness/verify-grading.mjs` → **12/12 passed**
(three of them C2's: S3-TC2, S3-TC7, S3-TC8).

**8 of 10 rows Pass. The two failures are the two the fixtures were written to catch.**

### The half that matters most is clean

> 64 citations across 8 fixtures. `exact` 63 (98.4%), `whitespace_normalized` 0,
> `not_found` 1. **Hallucinated: 0.** Independent check disagreed with the stored
> `match_kind` on **0** citations.

Every citation the system marked grounded really is in its source, checked by a search that
does not call the code that produced it. The single `not_found` is on T2 and is reported as
`grounded = 0` — the system saying "I could not verify this", which is the behaviour the
design asks for and costs nothing.

Zero `whitespace_normalized` is worth noting on its own. That column is the early-warning
channel: a drift from exact toward normalized would show here before anything became
ungrounded. Today it is empty.

### The two failures

**PII — 11 of 21 labelled values survived into storage.** Two distinct causes, filed
separately because they are different defects:
- **BUG-008** — the phone pattern requires 3–4 digit groups, so it misses two-digit area
  codes (`+44 20 …`, `+39 02 …`, `07700 …`). Three numbers survived; the two with
  three-digit groups were caught.
- **BUG-009** — external contact **names** are not redacted at all, and never were. Not a
  regression: `normalize.mjs` has two rules, both patterns, neither for names. The answer
  key demanded twenty-one values; the code could only ever address thirteen. **This one
  needs a decision from Vaibhav** — the options and their costs are on the card.

**G1 — 14 requirements from a document containing none.** BUG-004, open since E1-S4, now
measured rather than described. Across the three prompt iterations of E2-S2 it went
16 → 15 → 14 → 14: the prompt work moved it slightly and did not solve it.

### Not fixed here, on purpose

E2-S3's own technical notes: a redaction defect is *filed*, not patched inside the story
that grades it. A case that repairs what it measures is BUG-001 wearing a new hat. And
E2's three-prompt-iteration budget was spent on C1 in E2-S2, so G1 does not get a fourth
attempt by the back door.

## Evidence — unblocked and re-run, 2026-09-02

```
.\run.cmd evals/harness/grade.mjs C2        PASS   -> evals/results/2026-09-02-C2-run24.md
.\run.cmd evals/harness/verify-grading.mjs  12/12 passed
```

**11 of 11 rows Pass. No code was written in this story to get there.** Every one of the two
original failures was closed by the card that owned the defect — which is the whole point of
having filed them instead of patching them here.

| Was | Closed by | Now |
|---|---|---|
| 3 phone numbers survived | **BUG-008** — shape-based matching | 0 of 13 survive |
| 8 name forms survived | **BUG-009** — *reversed*: names are kept by policy | the answer key asks for 13, not 21 |
| 14 requirements from G1 | **BUG-004** — name the subject instead of suppressing | 0, parked |
| 1 `not_found` citation | (nothing — it moved on its own) | 0; `exact` is now 100% |

### TC4 was amended, and the amendment is a specification change

The row originally demanded that **external contact names** be absent from storage. On
2026-09-02 Vaibhav decided the opposite:

> *"External contact details can be removed, but I would prefer keeping the external names if
> they are there. If someone is not stating their designation but is an external user, then it
> might be a problem."*

So H2's answer key moved eight `customer_name` entries out of `expected_redactions` and into a
new `expected_retentions` list, and C2 gained **rule 2b: over-redaction is fatal too.**

**This is the one escape `evals/README.md` rule 2 permits** — a specification change, decided
by the owner, written down, made before any result was tuned toward. It is not the row being
relaxed to match the output: the redactor was *already passing* the thirteen contact-detail
values, and the amendment made the case **harder**, not easier, by adding twenty-two values it
can now fail on.

**Worth stating plainly:** until that day H2 listed only what must GO, so **a redactor that
deleted every capitalised word would have scored 21 of 21 and passed the 100% floor cleanly.**
The half of the test that could catch that did not exist.

### The half that matters most got better, not just unblocked

> 69 citations across 8 fixtures. `exact` **69 (100.0%)**, `whitespace_normalized` 0,
> `not_found` 0. **Hallucinated: 0.** The independent search disagreed with the stored
> `match_kind` on **0** citations.

`whitespace_normalized` at zero is the number to keep watching. It is the early-warning
channel — drift from exact toward normalized shows up there before anything becomes
ungrounded — and it has been empty in every run so far.
