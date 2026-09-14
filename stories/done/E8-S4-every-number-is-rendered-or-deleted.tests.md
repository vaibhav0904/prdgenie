# Test cases: E8-S4 — every number is rendered or deleted

```
.\run.cmd review-ui\scripts\audit-render.mjs          the audit, derived and repeatable
.\run.cmd review-ui\scripts\drill-telemetry.mjs       the observability drill, twice inside itself
```

**The audit is a script, not a table typed into this file.** A hand-written checklist of
columns is a hand-counted denominator — it cannot grow when a query does (BUG-003/019/032).
The script derives the field list from the LIVE `allMetrics()` payload and from `sessions()`,
then finds each field a home in the three renderers, and **fails on a field with none**.
Re-running it IS repeating the audit, which is what PRD decision 4 wants: the next person
runs a command rather than re-deriving a table.

**The drill's fault goes in mid-run, on the real path.** WF0's telemetry node dials a tiny
forwarding proxy instead of the service directly — an address change, the same single move
`drill-provider-failures.mjs` is allowed — and the proxy is killed **after the run's first
model call has logged and before its last**. Real n8n, real provider, real fixture. The run
must finish as if nothing happened, and the trace's `llm_calls` rows must show the amputation:
some calls logged, then none.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | The audit enumerates its fields from the **live payload**, not from a list typed in the script | derived | **Pass** | the field list comes from `allMetrics()` and `sessions()` at run time — 74 fields today |
| TC2 | Every field has a named home: the page, the CLI printer, or the weekly report — or a **stated derivation** (consumed to compute a rendered value) | all homed | **Pass** | every field homed on the page, the CLI or the report — or declared consumed with its reason printed |
| TC3 | **CONTROL: a homeless field fails the audit** — forced by injecting a fake field into the payload copy the audit walks | fails, names it | **Pass** | `negative-control-render.mjs`: a planted field turns the audit red and it NAMES it |
| TC4 | Any homeless field the first honest run finds is **deleted or given a home**, and the audit records which | resolved | **Pass** | `sessions().signed_off_at` had no rendering; declared consumed — it is the far end of the Seconds column, and the declaration says so |
| TC5 | The audit prints the checklist (field → home) so the result is readable as well as exit-coded | printed | **Pass** | the checklist prints on every run; re-running the script IS repeating the audit |
| TC6 | **DRILL: telemetry dies mid-run and the run does not notice.** Fixture reaches `in_review`, requirements grounded, no park, no dead letter | run 1 | **Pass** | both rounds reached `in_review`, zero parks, zero dead letters |
| TC7 | The amputation is visible in the data: the trace logged **fewer calls than it made** — at least one row, and then silence | partial rows | **Pass** | **1 call logged, then silence** — against 5 in the control; the kill landed after the first logged call |
| TC8 | The product outcome is **indistinguishable** from an undrilled run of the same fixture: same state, same grounded count | identical shape | **Pass** | 5/5 grounded in both rounds and the control — indistinguishable |
| TC9 | WF0 restored **byte-for-byte**, asserted by hash, in a `finally` | restored | **Pass** | restored byte-for-byte in a `finally`, asserted by hash |
| TC10 | **Run twice, same answer** (BUG-021) | 2 of 2 | **Pass** | in_review/1-logged, both rounds |
| TC11 | **CONTROL: with the proxy healthy, the same run logs every call** | full rows | **Pass** | the healthy proxy carried all 5 calls — the drill proves the fault, not the proxy |
| TC12 | The drill is **dated in `docs/traceability.md`** with the figures | dated | **Pass** | dated section in `docs/traceability.md` with the table |
| TC13 | The existing verifiers still pass: `verify-metrics`, `verify-weekly` | green | **Pass** | `verify-metrics` and `verify-weekly` both green after the audit's changes |


## Outcome: the audit is a command, and the drill is a table

```
.\run.cmd review-ui\scripts\audit-render.mjs               74 fields homed, 0 without
.\run.cmd review-ui\scripts\negative-control-render.mjs    the audit can go red, and names at what
.\run.cmd review-ui\scripts\drill-telemetry.mjs            9/9 — 1 call logged then silence, run unharmed
```

**The checklist the card asks for is the audit's own printed output** — field by field, each
with the renderer that homes it or the stated reason it is consumed instead. It is not
transcribed here, deliberately: a copy in this file would be the hand-counted denominator the
audit exists to replace, stale from the first field anyone adds. The next person repeats the
audit by running the command.

**One field had no home on the first honest run, exactly as suspected:** `signed_off_at`
came back from `sessions()` and nothing displayed it. It was neither silently dropped nor
pointlessly rendered — it is the far end of the Seconds computation, so it was declared
CONSUMED with that reason, and the declaration prints on every run. A stale declaration —
one naming a field that stops existing — also fails the audit.

**The drill's one number:** a run that logs its first call and then loses telemetry entirely
finishes `in_review` with 5/5 grounded, indistinguishable from the control, twice. The four
missing rows are gone forever, and that is stated in `traceability.md` rather than smoothed
over — it is the accepted price of "telemetry may never stop a run".
