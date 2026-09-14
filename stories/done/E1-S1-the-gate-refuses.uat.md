# UAT: E1-S1 The approval gate refuses everything except a human

Roughly five minutes. The point of this script is that **you** watch the database refuse
an approval, rather than reading that it does. Step 6 is the one that matters — it is also
what the demo video will show.

## Before you start — what you will and will not see

**There are no n8n workflows yet, and this test does not use any.** If you opened n8n and
found it empty of our workflows, that is correct: E1-S1 built the database, the approval
gate, and the local review service. The first workflow arrives in E1-S2 (the ingest door),
and the first model call in E1-S4.

**PRD Genie is a guest in a general-purpose n8n on port 5678** — our workflows are tagged
`prdgenie` and the export filters on that tag, so nothing else in the instance is touched
(ADR 0010). Since 2026-09-02 that instance is `n8n-local`, started from
`infra/n8n/docker-compose.yml` in its own compose project, on a machine-owned volume. It
belongs to no project, including this one, and nothing PRD Genie runs can destroy it.

**Every command below is `.\run.cmd ...`** — see BUG-002 and BUG-010. The historical note
below is why, and is left as written because it is what this card said at the time:

> **Every command below is `node`, not `npm`.** A default Windows PowerShell blocks npm's
`.ps1` shim (`UnauthorizedAccess`), which is what stopped your first attempt — BUG-002.
Running `node` directly sidesteps it entirely and needs **no change to your system
settings**. If you prefer the npm shorthand, `npm.cmd run db:init` also works; plain
`npm run db:init` will not, unless you have relaxed your execution policy.

**Everything is typed into PowerShell**, from the project folder. There is no UI to click.
The only step that touches n8n is step 8, and it is one `docker exec` line.

If any command prints something you did not expect, stop and paste it back rather than
working around it. A UAT that gets "made to work" has not tested anything.

---

1. **Open a fresh PowerShell window** (Node was installed during this story and older
   terminals will not have it on PATH), then:

   ```powershell
   cd "C:\path\to\prdGenie"
   node --version
   ```

   *Expect:* `v24.19.0` — anything v22 or higher is fine.

2. **Reset to clean data.** Delete the database and rebuild it from the schema:

   ```powershell
   Remove-Item data\prdgenie.db* -Force -ErrorAction SilentlyContinue
   .\run.cmd review-ui/scripts/init-db.mjs
   ```

   *Expect:* `schema version 1 at …\data\prdgenie.db` and `created 20 tables`.

3. **Re-run it and confirm nothing is destroyed** — this is the "safe to re-run" claim:

   ```powershell
   .\run.cmd review-ui/scripts/init-db.mjs
   ```

   *Expect:* `schema already present (20 tables) — nothing dropped, nothing emptied`.

4. **Check the schema matches the contract:**

   ```powershell
   .\run.cmd review-ui/scripts/query.mjs schema-check
   ```

   *Expect:* `schema-check OK — every contract table, trace_id column and trigger is present`.

5. **Run the gate verification:**

   ```powershell
   .\run.cmd review-ui/scripts/verify-gate.mjs
   ```

   *Expect:* nine PASS lines and `Gate verified: no path to approved except the sign-off
   endpoint.` Read the four refusal messages — they name ADR 0006 and the contract.

6. **Refuse an approval with your own hands.** This is the acceptance criterion the whole
   product rests on. Create a version sitting in review, then try to approve it directly:

   ```powershell
   .\run.cmd review-ui/scripts/query.mjs sql "INSERT INTO products (product_id,name) VALUES ('uat','UAT')"
   .\run.cmd review-ui/scripts/query.mjs sql "INSERT INTO prds (prd_id,product_id) VALUES ('PRD-uat','uat')"
   .\run.cmd review-ui/scripts/query.mjs sql "INSERT INTO prd_versions (prd_id,version_no,trace_id,state,content) VALUES ('PRD-uat',1,'uat-trace','in_review','{}')"
   .\run.cmd review-ui/scripts/query.mjs sql "UPDATE prd_versions SET state='approved' WHERE prd_id='PRD-uat'"
   ```

   *Expect:* the last command prints
   `REFUSED: approval requires the review UI sign-off endpoint (ADR 0006): no other path
   may set state=approved` and exits non-zero.

   **Subjective check, and the one a machine cannot make for you:** does that message tell
   a stranger *why* they were stopped and where the legitimate path is? If it reads like a
   database error rather than a rule, say so — it is the message a future you will meet at
   an inconvenient moment.

7. **Confirm the version did not move:**

   ```powershell
   .\run.cmd review-ui/scripts/query.mjs sql "SELECT prd_version_id,state FROM prd_versions WHERE prd_id='PRD-uat'"
   ```

   *Expect:* still `in_review`.

8. **Confirm n8n can reach the service.** *The only n8n step, and it needs no workflow — it
   asks the already-running container to fetch a URL.* In this terminal:

   ```powershell
   .\run.cmd review-ui/server.js
   ```

   *Expect:* three lines, including `n8n in Docker reaches this at
   http://host.docker.internal:3000`. Leave it running.

   In a **second** PowerShell window:

   ```powershell
   docker exec n8n-local sh -c "wget -q -O - http://host.docker.internal:3000/api/health"
   ```

   *Expect:* the same JSON you get in a browser at <http://localhost:3000/api/health>. This
   is the setup trap that would otherwise bite in E1-S2.

   Then stop the server with `Ctrl+C` in the first window.

9. **Watch the check fail** — because a check you have never seen fail is an assumption:

   ```powershell
   .\run.cmd review-ui/scripts/query.mjs sql "DROP TRIGGER prd_versions_state_machine"
   .\run.cmd review-ui/scripts/verify-gate.mjs
   .\run.cmd review-ui/scripts/init-db.mjs
   .\run.cmd review-ui/scripts/verify-gate.mjs
   ```

   *Expect:* the first `verify-gate` prints `GATE VERIFICATION FAILED before any case ran.`
   and `MISSING TRIGGER: prd_versions_state_machine`. After `init-db`, nine PASS again.

   *This step exists because the first version of that script passed this test when it
   should have failed — see BUG-001.*

10. **Tidy up:**

    ```powershell
    Remove-Item data\prdgenie.db* -Force
    .\run.cmd review-ui/scripts/init-db.mjs
    ```

11. **Sign-off:** reply "UAT passed" (or file what's wrong) before this promotes.

---

## What this card cannot claim

Worth reading before you sign. This story proves the gate refuses **the pipeline and the
command line**. It does not prove anything about *who* the approving human is — there is
no authentication, and every review action is attributed to one hardcoded reviewer. That
is the biggest known gap in `docs/assumptions.md`, and it is unchanged by this story.
