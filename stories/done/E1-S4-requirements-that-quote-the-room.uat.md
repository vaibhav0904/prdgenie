# UAT: E1-S4 Requirements that quote the room

**Mechanical half promoted on evidence.** But this is the first story that produces
*generated output*, and under the G6 scoping "is this any good?" is a question only
Vaibhav can answer. Part 2 is worth ten minutes.

All commands are `node`, never `npm` (BUG-002).

---

## Part 1 — the mechanical half

1. Clean start and install the workflows:

   ```powershell
   Remove-Item data\prdgenie.db* -Force -ErrorAction SilentlyContinue
   .\run.cmd review-ui/scripts/init-db.mjs
   .\run.cmd n8n/scripts/import-workflows.mjs
   docker restart n8n-local
   ```

   Wait ~25s. *Expect:* `3/3 imported`, WF0/WF1/WF2 all `active=true`.

2. Verify the grounding logic:

   ```powershell
   .\run.cmd review-ui/scripts/verify-grounding.mjs
   ```

   *Expect:* `14/14 passed`.

3. Run a real extraction. In one window `.\run.cmd review-ui/server.js`,
   then in another:

   ```powershell
   .\run.cmd evals/harness/produce.mjs T1
   .\run.cmd review-ui/scripts/query.mjs sql "SELECT doc_id FROM source_documents"
   Invoke-RestMethod -Uri "http://localhost:5678/webhook/generate" -Method Post -ContentType "application/json" -Body '{"doc_id":"DOC-2026-0001"}' | ConvertTo-Json -Depth 8
   ```

   *Expect:* `status: ok`, ~14 requirements, `grounded` equal to `total`, and `match_kinds`
   dominated by `exact`.

4. Confirm the call was costed:

   ```powershell
   .\run.cmd review-ui/scripts/query.mjs sql "SELECT component, prompt_version, prompt_tokens, completion_tokens, ROUND(cost_usd,6) FROM llm_calls"
   ```

   *Expect:* one row, `component: extractor`, a few tenths of a cent.

## Part 2 — the half only you can do

Open `evals/datasets/docs/T1.json` beside the extraction output.

1. **Pick any three requirements and click through their quotes.** Is the quote really
   what supports that requirement, or merely nearby text that happens to contain the
   words? A citation that is verbatim but irrelevant passes every check this system has.
2. **Is the wording something you would put in a PRD?** Not "is it true" — is it phrased
   as a requirement an engineer could build from.
3. **Then look at the failure.** Run fixture G1, which is an all-hands about parking and
   the coffee machine:

   ```powershell
   .\run.cmd evals/harness/produce.mjs G1
   # then POST /webhook/generate with G1's doc_id
   ```

   It returns **14 requirements, all grounded**, about permits and descaling. That is
   BUG-004, filed and deliberately unfixed until E2 can measure whether a fix helps. Worth
   seeing with your own eyes, because it is the sharpest illustration in the project of
   what grounding does and does not buy: every one of those is genuinely quoted.

**Sign-off:** reply "UAT passed", or tell me what reads wrong.

---

## What this card cannot claim

Extraction is unmeasured. 14 requirements from T1 is not "correct" — C1 in E2 decides that
against the labels, and BUG-004 shows the system will over-extract when a document is
requirement-shaped but not about a product. Nothing is clustered, prioritised or assembled
yet, and no PRD exists. The park path is proven to exist but no real timeout has been
induced; that is E7-S4.
