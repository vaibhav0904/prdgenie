# Test cases: E2-S1 Replay every fixture through the real door, on one command

Written before any build work, per gate G3.
Re-runnable as `.\run.cmd review-ui/scripts/verify-doors.mjs`
(door parity, TC1–TC2, TC6, TC9–TC10) and by running `produce.mjs` itself (TC3–TC5, TC7–TC8).

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | The webhook door accepts a JSON body with the same fields as the form door | `status: ok`, a `source_documents` row, one `trace_id` | **Pass** | `DOC-2026-0001`, `trace=2162c1f7…` |
| TC2 | **Door parity** — the same fixture through both doors stores the identical canonical document | Every canonical field equal; only `doc_id`, `trace_id`, `created_at` and `source_channel` differ | **Pass** | 7 canonical fields equal. Failed twice first: BUG-005, then BUG-006 |
| TC2b | Parity holds through redaction | Same `pii_redactions`; neither door stores the address | **Pass** | `[{"kind":"email","replacement":"[EMAIL-1]","count":1}]`, identical both sides |
| TC3 | One command replays all nine fixtures in order | Nine lines, each with `doc_id` and `trace_id`; manifest written | **Pass** | 9/9, `E1 F1 G1 H1 H2 N1 T1 T2 T3` → `DOC-2026-0001..0009` |
| TC4 | A named fixture replays alone | `produce.mjs T1` ingests exactly one | **Pass** | `Replaying 1 of 9 fixture(s)`, one line out |
| TC5 | A fixture that fails stops nothing else | The rest still run; the command exits non-zero naming which failed | **Pass** | exit=1, 9 still ingested, `failed=["ZZ"]` |
| TC6 | `produce.mjs` contains no grading logic and no quality assertion | No reference to labels, thresholds, recall, precision or expected output | **Pass** | No label/threshold/verdict reference in code (comments excluded) |
| TC7 | Re-running does not silently duplicate or overwrite | Fresh `trace_id`s; the previous run's rows still queryable by their old `trace_id` | **Pass** | T1 re-run → `DOC-2026-0010`; old `trace 085e222e…` still returns its doc, v7 and all 3 events. 10 docs / 10 distinct traces |
| TC8 | A "run" is the whole pipeline, not just the door | Generation is triggered per fixture; the manifest records `prd_version_id` **or** a park reason for every fixture | **Pass** | All nine reached `in_review`, v1–v9, each with its grounded count |
| TC9 | **Negative control** — the producer can fail | Point it at a dead door: every fixture reports FAIL and the exit code is non-zero | **Pass** | Door at `127.0.0.1:59999` → exit=1, 9 of 9 failed |
| TC10 | Coverage is asserted (BUG-003) | The run reports fixtures attempted vs fixtures that exist, and a gap is a failure, not a footnote | **Pass** | Manifest carries `fixtures_attempted`/`fixtures_available`; a partial run prints `<-- PARTIAL RUN` |

## Notes

- **TC8 is the row that makes C1 and C2 possible.** As built in E1, `produce.mjs` only
  opened the door: it ingested nine documents and produced no requirements at all. Grading
  that would have measured an empty database. A "run" has to mean the pipeline a PM
  triggers, end to end, or the grader is describing something nobody uses.
- **TC2 is the property, not the mechanism.** Nothing downstream of WF1 may be able to tell
  the doors apart. The structural half — a `grep` proving no code after WF1 reads
  `doc_type` or `source_channel` — is E5-S4; this row is the behavioural half.
- **On `npm run produce`.** The acceptance criteria are written as `npm run` commands. They
  are satisfied here by `.\run.cmd evals/harness/produce.mjs`, because
  BUG-002 established that npm's PowerShell shim is blocked under Windows' default
  execution policy. The package.json script exists for shells that allow it; the documented
  command is the `node` one. Same command, one fewer way to fail.
- TC5 and TC9 are different failures on purpose: TC5 is one fixture failing among nine
  (partial), TC9 is the door being gone (total). A producer that swallows either is worse
  than no producer, because grading would then run against a stale database and look fine.

## Evidence

`.\run.cmd review-ui/scripts/verify-doors.mjs` → **7/7 passed**
(TC1, TC2, TC2b, TC5, TC6, TC9, TC10).
`.\run.cmd evals/harness/produce.mjs` → **9/9**, coverage 9 of 9
(TC3, TC4, TC7, TC8).

The graded run, produced against a freshly initialised database:

```
ok  E1  DOC-2026-0001  v1 in_review   5/5 grounded
ok  F1  DOC-2026-0002  v2 in_review   7/7 grounded
ok  G1  DOC-2026-0003  v3 in_review  16/16 grounded   <-- BUG-004, and worse than E1's 14
ok  H1  DOC-2026-0004  v4 in_review   6/6 grounded
ok  H2  DOC-2026-0005  v5 in_review   5/5 grounded
ok  N1  DOC-2026-0006  v6 in_review   6/6 grounded
ok  T1  DOC-2026-0007  v7 in_review  15/15 grounded
ok  T2  DOC-2026-0008  v8 in_review  16/16 grounded
ok  T3  DOC-2026-0009  v9 in_review   7/7 grounded
```

**Two defects found, both in TC2, both filed and fixed:**

- **BUG-005** — the form door had never worked. n8n refuses to start a form-initiated
  workflow containing a `Respond to Webhook` node, so `/form/…` returned 500 and stored
  nothing. It had been "verified" by reading the workflow JSON.
- **BUG-006** — with the form finally open, the two doors stored *different bytes*: the
  browser submits CRLF, the JSON caller sends LF. Since `raw_text` is immutable and every
  citation offset refers to it forever, that would have made a quote spanning a line break
  match through one door and not the other. Fixed by canonicalising line endings at the
  door, before redaction.

**Run-to-run variance, noticed in passing and not yet measured.** T1 produced 14, then 15,
then 15 requirements on three runs of the identical input; G1 produced 14 in E1 and 16 here.
Nothing has been tuned in between. This is the reason E2-S4 exists and why no figure from a
single run may be published — recorded here so the C1 result is read with it in mind.
