# BUG-080: Two hints named the default n8n, whatever `.env` said

**Severity:** minor · wrong advice printed to an operator whose n8n is not the default one
**Found:** 2026-09-10, the fresh-clone walk-through, with `.env` pointing at a second n8n on
port 5679 and a container named `n8n-fresh`
**Area:** `evals/harness/show-fixture.mjs` · `review-ui/scripts/preflight.mjs`

## What shipped

- `show-fixture.mjs T1` printed *"Into the n8n form at http://localhost:5678/form/…"* while
  `.env` said 5679. Every other script derives the origin from `N8N_INGEST_WEBHOOK_URL`; this one
  had the address as a string.
- The preflight's fix-it lines said `docker start n8n-local` and `docker restart n8n-local`
  while every n8n script accepts `N8N_CONTAINER` (and a container-name argument).

Neither breaks anything. Both are the project telling the operator to do the wrong thing, and
CLAUDE.md's rule is that an instruction the reader cannot follow is a defect (BUG-002/010).

## Fixed

`show-fixture.mjs` derives the origin the way the others do. The preflight's two hints read
`N8N_CONTAINER` and fall back to `n8n-local`. Verified by re-running both from the fresh clone
whose `.env` names port 5679.
