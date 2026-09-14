# UAT: E1-S2 Drop a transcript in and have the system hold on to it

**Promoted on evidence, not owner sign-off** — every criterion here has an exactly-stated
expected result and contains no check a machine cannot make (`stories/README.md`, G6 as
scoped 2026-09-01). This script exists so the steps are reproducible by anyone, and it is
what the E9 dress rehearsal replays.

All commands are `node`, never `npm` (BUG-002), from the project root.

---

1. **Start clean:**

   ```powershell
   Remove-Item data\prdgenie.db* -Force -ErrorAction SilentlyContinue
   .\run.cmd review-ui/scripts/init-db.mjs
   ```

2. **Install the workflow from the repo** — the repo is the source of truth, n8n is only
   the runtime:

   ```powershell
   .\run.cmd n8n/scripts/import-workflows.mjs
   docker restart n8n-local
   ```

   *Expect:* `OK    WF1-ingest.json  (prdgenieWF1ingest, active=true)` and `1/1 imported`.
   Wait ~25s after the restart for n8n to register the webhook.

3. **Verify the door by running it:**

   ```powershell
   .\run.cmd review-ui/scripts/verify-ingest.mjs
   ```

   *Expect:* `15/15 passed` and
   `Ingest verified: canonical shape, one trace_id, PII redacted before storage.`

4. **Round trip through the live workflow.** In one window:

   ```powershell
   .\run.cmd review-ui/server.js
   ```

   In a second window:

   ```powershell
   $body = '{"product_id":"forgesight","doc_type":"transcript","raw_text":"Priya (Eng Lead): We need PNG export on every chart.\nMarcus (Head of Product): Mail me at marcus.hale@neuronforge.example or call +1 415 555 0199."}'
   Invoke-RestMethod -Uri "http://localhost:5678/webhook/ingest" -Method Post -Body $body -ContentType "application/json" | ConvertTo-Json -Depth 6
   ```

   *Expect:* `"status": "ok"`, a `doc_id`, a `trace_id`, and `pii_redactions` listing one
   email and one phone.

5. **Confirm nothing sensitive was stored** — the claim, checked rather than asserted:

   ```powershell
   .\run.cmd review-ui/scripts/query.mjs sql "SELECT substr(raw_text,1,160) FROM source_documents ORDER BY doc_id DESC LIMIT 1"
   ```

   *Expect:* `[EMAIL-1]` and `[PHONE-1]` in place of the address and number, and
   `Priya (Eng Lead)` still present — internal attribution is deliberately kept.

6. **Follow one document end to end on its `trace_id`:**

   ```powershell
   .\run.cmd review-ui/scripts/query.mjs sql "SELECT trace_id FROM source_documents ORDER BY doc_id DESC LIMIT 1"
   .\run.cmd review-ui/scripts/query.mjs trace <paste the trace_id>
   ```

   *Expect:* the document and its `ingested` event, joined by that one id.

7. **Tidy up:**

   ```powershell
   Remove-Item data\prdgenie.db* -Force
   .\run.cmd review-ui/scripts/init-db.mjs
   ```

---

## What this card cannot claim

The door normalizes, redacts and stores. **Nothing has been extracted or generated yet** —
there is no requirement, no citation, no PRD. Redaction covers emails and phone numbers by
pattern; named external customers are handled in E7 and graded by C2 against fixture H2.
The `has_approved_version` branch is proven to route but both destinations are still
placeholders.
