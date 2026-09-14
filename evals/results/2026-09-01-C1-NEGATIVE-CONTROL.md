# C1 — extraction quality — 2026-09-01

**Graded run:** produced 2026-09-01T14:49:02.527Z, 2 of 9 fixtures.
**Graded version:** prompt `extract-requirements` @ 6db5c9b6b561 (content hash `6db5c9b6b561`), model gpt-4.1-mini.
**Threshold:** recall >= 0.80 AND precision >= 0.75, **per fixture**, not averaged.

**Coverage:** 2 of 2 fixtures this case names

| Fixture | Labelled | Extracted | Matched | Missed | Over-split | Wrong kind | False positive | Recall | Precision | |
|---|---|---|---|---|---|---|---|---|---|---|
| T1 | 14 | 2 | 2 | 12 | 0 | 0 | 0 | 14.3% | 100.0% | **FAIL** |
| T3 | 6 | 2 | 1 | 5 | 0 | 0 | 1 | 16.7% | 50.0% | **FAIL** |

## T1 — per-item diff (DOC-2026-0001, PRDVersion 1)

| Extracted | Verdict | Label | Statement |
|---|---|---|---|
| `1-REQ-001` | match | T1-R06 | A user can schedule a dashboard to be emailed to them as a PDF on a recurring schedule. |
| `1-REQ-002` | match | T1-R08 | A user can set a threshold on a metric and be notified by email when the metric crosses it. |

**Missed — in the answer key, not in the output (12):**

- `T1-R01` (nonfunctional) The first chart on a dashboard renders in under two seconds on the largest customer account (Northwind).
- `T1-R02` (nonfunctional) Dashboards are viewable, read-only, on a tablet in landscape orientation.
- `T1-R03` (functional) A customer admin can assemble a dashboard from a library of widgets by drag and drop, then save and name it.
- `T1-R04` (nonfunctional) Dashboard data refreshes hourly, flat - not streaming, and not stated as a minimum interval.
- `T1-R05` (constraint) The pilot must be in front of Northwind by 30 November 2026 (end of Q4); the date is fixed.
- `T1-R07` (functional) Every chart lets the user export the rows underlying it as CSV.
- `T1-R09` (constraint) ForgeSight authenticates users through the customer's own SAML identity provider and stores no passwords itsel
- `T1-R10` (nonfunctional) Data access is scoped by role so a regional manager sees only rows for their own region, enforced in the query
- `T1-R11` (nonfunctional) Every dashboard view and every export is written to an audit log that can be handed to a customer's security r
- `T1-R12` (constraint) The dashboard shell is white-labelled: it carries the customer's own logo and colour palette (the charts are n
- `T1-R13` (constraint) ForgeSight reads from the existing warehouse only: no second database and no new pipeline for the pilot.
- `T1-R14` (functional) A user can share a link to a dashboard that preserves the filters currently applied to it.

## T3 — per-item diff (DOC-2026-0002, PRDVersion 2)

| Extracted | Verdict | Label | Statement |
|---|---|---|---|
| `2-REQ-001` | **false_positive** | — | a prospect to be able to create a login with an email address and be inside ForgeSight in two minutes |
| `2-REQ-002` | match | T3-R03 | An alert email has to arrive within five minutes of the threshold being crossed |

**Missed — in the answer key, not in the output (5):**

- `T3-R01` (functional) ForgeSight ships prebuilt dashboard templates per industry so a new customer sees their own data on day one in
- `T3-R02` (functional) A user can duplicate an existing dashboard and edit the copy.
- `T3-R04` (constraint) No third-party analytics or tracking scripts may run in the customer-facing app.
- `T3-R05` (functional) An admin can see which dashboards have not been opened in the last thirty days.
- `T3-R06` (constraint) The pilot runs with three customer accounts only: Northwind, Meridian and Halcyon.

## Verdict: FAIL

Per PRD-E2: at most three prompt iterations, then a BUG card naming the failure
*pattern*. The threshold does not move and the labels are not edited.
