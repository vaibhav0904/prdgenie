# UAT: E1-S6 Read the draft, click a quote, sign it

**This one is worth your five minutes** — it is the first screen a PM would actually use,
and "does this read right?" is a judgment only you can make.

All commands are `node`, never `npm` (BUG-002).

---

1. **Clean start, then generate a PRD from a real transcript:**

   ```powershell
   Remove-Item data\prdgenie.db* -Force -ErrorAction SilentlyContinue
   .\run.cmd review-ui/scripts/init-db.mjs
   .\run.cmd n8n/scripts/import-workflows.mjs
   docker restart n8n-local
   ```

   Wait ~25s, then in one window start the service and leave it running:

   ```powershell
   .\run.cmd review-ui/server.js
   ```

   In a second window:

   ```powershell
   .\run.cmd evals/harness/produce.mjs T1
   Invoke-RestMethod -Uri "http://localhost:5678/webhook/generate" -Method Post -ContentType "application/json" -Body '{"doc_id":"DOC-2026-0001"}'
   ```

2. **Open <http://localhost:3000/>.**

   *Expect:* a picker showing `PRD-forgesight v1 — in_review`, a requirements list on the
   left with kind/stakeholder/confidence, and the source document on the right.

3. **Click a citation chip.** *Expect:* the right pane scrolls and highlights the exact
   sentence. **The judgment only you can make:** is that quote really what supports the
   requirement, or just nearby text containing the same words? A verbatim but irrelevant
   citation passes every automated check this system has.

4. **Read the requirement wording.** Would you put these lines in a PRD as written?

5. **Sign off.** *Expect:* the state becomes `approved`, the button greys out, and a green
   caveat line appears saying the version is now a record.

6. **Prove the gate, with your own hands** — the fifteen seconds the demo video will show:

   ```powershell
   .\run.cmd review-ui/scripts/query.mjs sql "SELECT prd_version_id,state FROM prd_versions"
   .\run.cmd review-ui/scripts/query.mjs sql "UPDATE prd_versions SET state='approved' WHERE prd_version_id=1"
   ```

   *Expect:* `REFUSED: approval requires the review UI sign-off endpoint (ADR 0006)…`
   — even though you just approved that very version through the UI.

7. **Optional, and instructive.** Generate fixture G1 (an all-hands about parking) and look
   at what comes back: 14 confidently-cited requirements about permits and coffee machines,
   every one grounded. That is BUG-004, filed and unfixed until E2 can measure a fix.

**Sign-off:** reply "UAT passed", or tell me what reads wrong.

---

## What this card cannot claim

Approve-only: there is no reject and no edit-with-reason, so a PM who disagrees with one
line has no move except declining to sign. That is the daily friction the churn test names,
and it is E4. There is **no authentication** — every sign-off is recorded as
`local-operator`. And the PRD is a flat requirement list: no epics, features, stories or
priority until E3.
