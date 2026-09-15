# BUG-078: The README said `.env` drives the callback address, and nothing reads it

**Severity:** major · the run-it-yourself README's "one trap, front-loaded" section tells the reader
to set `SERVICE_BASE_URL` in `.env` so that n8n can reach the review service. n8n never reads
`.env`. The address n8n calls is inside the workflow exports, as a literal
**Found:** 2026-09-10, preparing the release package. Vaibhav asked for setup instructions
that work when n8n is hosted rather than local, and for the instructions to be evaluated by
following them. The first question a hosted setup asks is "where does n8n get the service
address from?", and the answer was: from nowhere the README mentions
**Area:** `deliverables/RUN-IT-YOURSELF.md` · `n8n/workflows/*.json` · `.env.example`

## What shipped

Every HTTP node in the seven exports carries `http://host.docker.internal:3000/...` as a
literal, and WF1 calls its sibling doors at `http://localhost:5678/webhook/...`, also literal.
`import-workflows.mjs` copies the files into the container unchanged. `SERVICE_BASE_URL` in
`.env` is read by exactly one script, `verify-refusal.mjs`, and by the review service only to
print a hint.

So the README's trap paragraph was true by coincidence: the default it told the reader to type
is the literal the exports already carry. A reader who put the review service on another port,
or ran n8n anywhere but Docker on the same machine, would change `.env`, see nothing change, and
have no way to find out why. And a hosted n8n — n8n Cloud, or a server — cannot be set up from
the README at all: `host.docker.internal` means nothing there, and neither does `localhost:5678`.

## Why nothing caught it

`check-readme-links` proves the README points at things that exist. It does not prove that a
sentence about a setting is true. The E9-S2 walk-through from a fresh clone, which would have
found this, was deferred (the release checklist of the day said so).

## Fixed

1. The README's trap section now says where the address lives (inside the exports), what that
   means locally (the review service must be on port 3000 and n8n must be Docker on the same
   machine, for `import-workflows.mjs`), and what to do otherwise.
2. **`n8n/scripts/deploy-hosted.mjs`**, the path for an n8n you have no Docker shell into. It
   deploys through n8n's public API, and because that API refuses a supplied workflow id
   (`request/body/id is read-only`), it rewrites every sub-workflow reference and the
   error-workflow setting to the ids the instance hands out, rewrites both literal addresses to
   `SERVICE_BASE_URL` and `N8N_API_URL`, creates the header-auth credential from
   `INTERNAL_API_KEY`, binds the two provider credentials by the ids the operator copied from the
   n8n UI, tags, activates, and probes every door through itself. Idempotent by workflow name.
3. `.env.example` gained `OPENAI_CREDENTIAL_ID` and `GEMINI_CREDENTIAL_ID` for that path, and
   `deliverables/SETUP.md` is the guide for both shapes.

## Verified

From a fresh extraction of the source archive, against a throwaway n8n on port 5679 and a
fresh review service on port 3001, with dummy provider keys: `deploy-hosted.mjs` found the seven
workflows the CLI import had created, updated them in place, and every door answered. Reading
WF2 back from the API showed `host.docker.internal:3001` and `localhost:5679` where the exports
say 3000 and 5678. A real fixture posted through the rewired door ran WF1, WF2 and WF0 on the
throwaway, reached the fresh service at every callback, and came back as `needs_review` with
reason `llm_unauthorized` and the provider's own message — the dummy key refused, which is the
one step a real key changes. Along the way the walk-through found that a Docker port mapping
needs the self-address override (`N8N_SELF_URL`), and that the script's leftover check refused
an address equal to the export's literal; both fixed before the third post. The cards for the
other things that walk-through found: BUG-079, BUG-080.
