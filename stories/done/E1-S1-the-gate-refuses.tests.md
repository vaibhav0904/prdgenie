# Test cases: E1-S1 The approval gate refuses everything except a human

Written before any build work, per gate G3. One row per acceptance criterion, plus rows
for the traps the story's technical notes name. Rows may be **added** mid-flight if review
or UAT exposes a gap; a row is never deleted to make a build pass.

| # | Case | Steps | Expected | Status | Evidence |
|---|---|---|---|---|---|
| TC1 | Schema is created by a command, and re-running it is safe | `npm run db:init`; then `npm run db:init` again on the existing file | First run creates `data/prdgenie.db`. Second run exits 0, prints that the schema is already current, and **does not** drop or empty any table (row counts unchanged) | **Pass** | Run 1: `created 20 tables`. Run 2: `schema already present (20 tables) — nothing dropped, nothing emptied`, exit 0 |
| TC2 | Every contract table exists, with `trace_id` where the contract says | `.\run.cmd review-ui/scripts/query.mjs schema-check` | Every table in `docs/contracts.md` is present; `trace_id` exists on `source_documents`, `requirements`, `prd_versions`, `events`, `llm_calls`, `judge_scores`, `dead_letters`. Any missing table or column is named in the output and the command exits non-zero | **Pass** | `21 tables, 4 triggers` / `schema-check OK — every contract table, trace_id column and trigger is present`, exit 0 |
| TC3 | Illegal transition `draft → approved` is refused | In `sqlite3` (or `query.mjs sql`), insert a version in `draft`, then `UPDATE prd_versions SET state='approved'` | Aborts with an error naming the reason. Row still reads `draft` afterwards | **Pass** | `npm run verify:gate` TC3 — refused: *"approval requires the review UI sign-off endpoint (ADR 0006)"*; row still `draft` |
| TC4 | Illegal transition `approved → draft` is refused | On an approved version, `UPDATE prd_versions SET state='draft'` | Aborts. Row still reads `approved` | **Pass** | TC4 — refused: *"illegal PRDVersion transition (docs/contracts.md §3)"* |
| TC5 | **The headline refusal** — a hand-run approval fails | Against a version in `in_review`, run `UPDATE prd_versions SET state='approved' WHERE id=…` by hand outside the endpoint | Aborts with a message naming the sign-off endpoint as the only path. This is the criterion the UAT and the demo video both rest on | **Pass** | TC5 — refused with the endpoint named; row still `in_review` |
| TC6 | The sign-off path itself succeeds | Write the version-scoped marker row and perform the transition as the endpoint will | Transition succeeds; version reads `approved` | **Pass** | TC6 — `signOff()` succeeded, version reads `approved` |
| TC7 | **Marker cannot authorize a different version** (the leak check) | Immediately after TC6, on the **same connection**, attempt `UPDATE … SET state='approved'` on a *different* version in `in_review` | Refused. This is the failure mode with no visible symptom, so it is checked here and again in E1-S6 against the real endpoint | **Pass** | TC7 — refused on the same connection immediately after a successful sign-off |
| TC8 | A stale marker cannot be exploited | Insert a marker row for a version that is already `approved`, then attempt to approve a different version | Refused — the marker names one version and authorizes only that one | **Pass** | TC8 — refused with a live stale marker present |
| TC9 | Legal transitions still work | `draft → in_review`, `in_review → draft`, `approved → superseded` | All three succeed. A gate that refuses everything is not a gate, it is a wall | **Pass** | TC9a/b/c all succeeded |
| TC10 | Service boots and reports schema version | `npm start`, then `GET /api/health` | 200 with the schema version and the resolved DB path | **Pass** | `{"status":"ok","schema_version":"1","db_path":"…\\data\\prdgenie.db","node":"v24.19.0"}` |
| TC11 | Zero npm dependencies (ADR 0009) | Inspect `package.json`; run `npm ls --prod` | No `dependencies` block, or an empty one. Nothing to install, so `npm install` cannot fail | **Pass** | `npm ls --prod` → `prd-genie@0.1.0` / `` `-- (empty) `` |
| TC12 | n8n in Docker can reach the service | From the n8n container on 5678: `wget -qO- http://host.docker.internal:3000/api/health` | 200 with the same body as TC10. Confirms the networking answer that `.env.example` documents | **Pass** | Verified against both a dedicated instance and the shared 5678 instance; identical JSON returned from inside the container |
| TC15 | Being a guest in a shared n8n is safe | Count workflows, executions and credentials in the 5678 instance; confirm n8n version supports tag filtering | Sharing costs nothing to protect against: our workflows are tag-isolated and the repo holds their source of truth | **Pass** | 0 workflows, 0 executions, 7 credentials (incl. `OpenAI account`, `Google Gemini(PaLM) Api account`), n8n 2.36.9 supports tags. *Row rewritten: it originally asserted the opposite property. See ADR 0010's amendment.* |
| TC16 | Every documented command works under Windows' **default** execution policy | Run the whole UAT in a shell launched with `-ExecutionPolicy Restricted` | Every step behaves identically to a permissive shell; no step needs a system-policy change | **Fail → Fixed** | First attempt: `npm run …` → `UnauthorizedAccess`, UAT unrunnable (BUG-002). After switching all documented commands to `node`: full UAT re-run under `Get-ExecutionPolicy` = `Restricted` — init, re-init, schema-check, gate 9/9, step 6 refusal (exit 1), step 9 negative control (exit 1), restore green. Also caught `verify-gate`'s error text naming `npm run db:init`, an unrunnable command; now names the `node` one |
| TC14 | The UAT script is runnable by its actual reader | Hand the UAT to Vaibhav and watch where it stalls | No step assumes context the reader does not have | **Fail → Fixed** | First contact stalled immediately: *"I don't see any workflows on n8n, so I'm not sure how I will run the test."* Correct observation — E1-S1 builds no workflows, and the script never said so. Added a "what you will and will not see" preamble, replaced step 1, and labeled step 8 as the only n8n step. Re-issued for a second run |
| TC13 | **Negative control** — the gate check is seen to fail | Drop `prd_versions_state_machine`, run `npm run verify:gate`, restore, re-run | With the trigger missing: non-zero exit, naming the missing trigger, before any case runs. Restored: 9/9, exit 0. *Row added mid-flight after BUG-001 — the first attempt at this control passed when it should have failed.* | **Pass** | Dropped: `GATE VERIFICATION FAILED before any case ran. MISSING TRIGGER: prd_versions_state_machine`, exit **1**. Restored: `9/9 passed`, exit 0 |

## Notes

- TC5 and TC7 are the two that matter. TC5 is what the UAT script and the demo video
  demonstrate; TC7 is the one whose failure would be invisible.
- TC9 exists because the obvious way to pass TC3–TC5 is a trigger that refuses too much.
- TC11 is a test of a *decision*, not of behaviour — it is here because ADR 0009's benefit
  is only real while the dependency list stays empty, and a test is how that stays true.
- **TC13 was added mid-flight, and it earned its place.** The first run of this negative
  control reported 9/9 PASS with the gate's trigger deleted, because `verify-gate.mjs`
  called `initSchema()` and silently recreated it. That is BUG-001. Every other row in
  this table was green at the time, and all of them would have stayed green with the
  guarantee gone.
- **TC14 and TC16 are the same mistake twice, and both were found by the reader, not by
  me.** TC14 was missing *knowledge* — I knew there were no n8n workflows, so the script
  never thought to say so. TC16 was missing *tooling* — my shell runs with
  `ExecutionPolicy: Bypass`, set invisibly by the harness, so every `npm` command I wrote
  inherited an assumption the reader's machine does not share. Dry-running the script
  myself proved the commands work **for me** and proved nothing about whether anyone else
  could run them.
- The standing fix is in CLAUDE.md: **documented commands must be the ones that work in
  the most restrictive plausible environment.** TC16 is now how that gets checked — run
  the script in a `-ExecutionPolicy Restricted` shell, not the comfortable one.
- **E9-S2's run-it-yourself README has both failure modes and a far worse blast radius.** A stranger
  hitting `UnauthorizedAccess` in minute two may never reach minute five. Its acceptance
  criterion — someone follows it verbatim without asking a question — is now backed by two
  real incidents rather than good intentions.
