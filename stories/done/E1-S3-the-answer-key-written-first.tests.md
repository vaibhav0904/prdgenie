# Test cases: E1-S3 The answer key, written before anything can be tuned to it

Written before any build work, per gate G3.

This story's output is *data*, so most rows check the labels themselves rather than
behaviour. That is the point: everything C1–C6 will ever report inherits these files, and
a broken label is indistinguishable from a broken system until someone checks.

Re-runnable as `.\run.cmd evals/harness/verify-labels.mjs [--stored]`.

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | Nine fixtures exist with the right types | T1/T2/T3 transcript, N1 notes, E1 email, F1 feature_brief, G1 notes, H1 transcript, H2 email | **Pass** | 9 fixtures, every `doc_type` as specified |
| TC2 | Nine label files, each carrying the rule verbatim | `"rule": "Labels written BEFORE any tuning…"` | **Pass** | 9 files, rule string exact in all |
| TC3 | **Every labelled quote is a verbatim substring of its fixture** | 100% — an unresolvable quote would later look like an extraction failure | **Pass** | **107 regions resolved, 0 unresolved** |
| TC4 | Quotes resolve to regions; multi-occurrence labels keep all of them | Every occurrence recorded (ADR 0008) | **Pass** | 30 labels resolve to more than one region |
| TC5 | T1 carries a substantial requirement set | 12–14 across functional / nonfunctional / constraint | **Pass** | 14 requirements, all three kinds |
| TC6 | T2's delta is exactly as specified | 2 modified, 1 contradicted, 1 added, ≥3 restated-but-unchanged | **Pass** | mod=2 contra=1 add=1 unchanged=4 |
| TC7 | Every T2 delta item points at a real T1 label | All `of_label` values resolve | **Pass** | 7 references, all resolve |
| TC8 | T3 carries three conflicts, one of them polite | 3 of kind `conflict` | **Pass** | 3 conflicts; the polite one is labelled and noted |
| TC9 | G1 is genuinely empty | `expected_requirements: []` | **Pass** | 0 requirements. Notes record that G1 deliberately contains requirement-*shaped* facilities language ("permits must be displayed") that is not a product need |
| TC10 | H1 carries three injection payloads of three kinds | override / fake requirement / exfiltration, plus real requirements | **Pass** | 3 payloads of 3 distinct kinds, 4 legitimate requirements |
| TC11 | H2 names every string that must not survive storage | Emails, phones, external individuals; no internal stakeholders | **Pass** | 21 redactions, 0 internal names wrongly listed |
| TC12 | **No prompt exists yet** | `n8n/prompts/` empty | **Pass** | Empty. *Can only ever pass once — strike this row after E1-S4 rather than keeping it green* |
| TC13 | **Every fixture** checked against stored, post-redaction text | 9/9 checked, every quote still resolves | **Pass** | 9/9 after the BUG-003 fix. *First run reported PASS at 8/9, silently skipping H2 — the one fixture the row exists for* |
| TC14 | **Negative control** — the label checker can fail | Corrupt a quote → non-zero, naming fixture and quote | **Pass** | `FAIL TC3 … T1/T1-R01: "ZZZ-THIS-IS-NOT-IN-THE-FIXTURE…"`, exit 1; restored → 12/12, exit 0 |
| TC15 | **Negative control** — TC13 fails when a fixture is not ingested | Delete one stored document → red, naming it | **Pass** | *Row added after BUG-003.* `8/9 checked; NOT CHECKED: T3`, exit 1 |

## Notes

- **TC13 is the dependency this story has on E1-S2**, and the reason the card sits fourth
  in the backlog rather than first: labels must hold against the post-redaction text the
  door actually stores. H2 is where this bites — and it is exactly where the first version
  of the check silently gave up (BUG-003).
- TC3 and TC13 together are what make ADR 0008's span matching trustworthy. If a quote does
  not resolve, C1 would report an extraction failure that is really a data bug.
- **TC14 was itself wrong on the first attempt.** A `-replace` that did not match left the
  file untouched, so the control "passed" without corrupting anything. Re-done by editing
  the parsed JSON. A negative control that does not actually break the thing is a third
  instance of the same disease as BUG-001 and BUG-003.

---

## TC12 struck, 2026-09-01 (during E1-S4)

TC12 asserted `n8n/prompts/` was empty. It passed here, then E1-S4 wrote the extraction
prompt and it became permanently false — exactly as this plan predicted ("can only ever
pass once; strike it after E1-S4 rather than keeping it green").

It has been **removed from `verify-labels.mjs`**, with the reasoning left in the file where
the row used to be. The ordering claim is now a historical fact evidenced by this story's
archived run, not something the checker can re-verify. Leaving a permanently-red row would
have trained everyone to ignore a failing check; relaxing it to "≤1 prompt" would have been
worse.
