# Setting PRD Genie up

Two shapes. **A: everything on one machine**, which is the twenty-minute path in
[`RUN-IT-YOURSELF.md`](RUN-IT-YOURSELF.md). **B: n8n is hosted** — n8n Cloud, or a server you
have no Docker shell into — and the review service runs wherever n8n can reach it. This page is
mostly about B, and it ends with a record of which steps were followed from a fresh copy of the
source on 2026-09-10 and what happened.

## What runs where

There are three pieces, and only one of them is n8n.

| Piece | What it is | Where it can live |
|---|---|---|
| **n8n** with the seven workflows | The pipeline: the doors, extraction, the change list, the error handler, the weekly report, the judge. It is the only thing that calls a model. | Docker on your machine (A), n8n Cloud, or any server (B) |
| **The review service** | One Node process, `review-ui/server.js`. It serves the web pages you review and sign in, keeps the SQLite database, and answers the `/internal/*` calls n8n makes at every step. Zero npm packages; Node 22.5 or newer. | Your machine, a small VM, or your laptop behind a tunnel |
| **Your browser** | The review pages at the service's address, and the n8n form for pasting a meeting in. | Anywhere |

n8n must be able to open HTTP connections to the review service. The review service never
calls n8n; only your browser and the eval harness do, at the doors. That one-way arrow is the
whole setup problem: **n8n needs an address for the service that works from where n8n is.**

## Where that address lives

Not in `.env`. Every HTTP node in `n8n/workflows/*.json` carries the address as a literal,
`http://host.docker.internal:3000/...`, and WF1 calls its sibling doors at
`http://localhost:5678/webhook/...`, also literal. Shape A ships the files unchanged and those
literals are right for it. Shape B rewrites them at deploy time, which is what
`deploy-hosted.mjs` is for. (The README said `.env` drove this until 2026-09-10; BUG-078.)

---

## Shape A — one machine

Follow [`RUN-IT-YOURSELF.md`](RUN-IT-YOURSELF.md) in order. On Windows it is two double-clicks:
`1-START-HERE.cmd`, then `2-SET-UP-THE-DEMO.cmd`. The fixed points on this path: n8n is Docker
on the same machine, and the review service listens on port 3000.

---

## Shape B — n8n is hosted

### B1. Put the review service somewhere n8n can reach

Pick one.

**A small VM** (any Linux with Node 22.5+; `node --version` must be 22.5 or higher because the
database is `node:sqlite`, built in):

```
git clone <the source>   or   unzip the source archive
cd prdgenie
cp .env.example .env         # edit it in B3
node --env-file=.env review-ui/server.js
```

Keep it running with `systemd`, `pm2`, or `nohup`. The database is `data/prdgenie.db`, so the
disk must persist. Open port 3000 (or set `SERVICE_PORT`) to the n8n instance; the address you
will give n8n is `http://<vm-ip-or-name>:3000`, or `https://...` if you put it behind a proxy.

**Your own laptop, through a tunnel.** Run the service as in the README, then

```
ngrok http 3000            # or:  cloudflared tunnel --url http://localhost:3000
```

and use the `https://....ngrok-free.app` address it prints. **Treat that address as a secret and
close the tunnel after grading:** the review UI has no login, so anyone with the address can
approve a document. That is the first entry in [`docs/assumptions.md`](../docs/assumptions.md).

`run.cmd` is Windows-only. On Linux or macOS every `.\run.cmd <script>` in the documentation is
`node --env-file=.env <script>`.

### B2. In n8n, three things by hand

1. **Credentials → Add credential → OpenAI.** Paste your key. Save. The id is the last part of
   the address bar, `.../credentials/<id>`. Copy it.
2. **Credentials → Add credential → Google Gemini(PaLM) API.** Same; copy its id.
3. **Settings → n8n API → Create an API key.** Scopes, if asked: workflows (all), credentials
   create, tags (all). Copy the key.

The provider keys stay in n8n. Nothing in this repository ever holds them (ADR 0004). The two
ids are the only handle the deploy needs, and the public API has no call that lists credentials,
which is why you copy them yourself.

### B3. `.env`, on the machine you deploy from

`copy .env.example .env` (or `cp`), then set:

```
N8N_API_URL=https://<you>.app.n8n.cloud          the instance, no trailing slash
N8N_API_KEY=<from B2.3>
N8N_INGEST_WEBHOOK_URL=https://<you>.app.n8n.cloud/webhook/ingest
SERVICE_BASE_URL=https://<the address from B1>   as n8n reaches it, never localhost
OPENAI_CREDENTIAL_ID=<from B2.1>
GEMINI_CREDENTIAL_ID=<from B2.2>
INTERNAL_API_KEY=                                leave it; the deploy generates one
```

`N8N_SELF_URL` is optional: the address n8n uses to call itself. It defaults to `N8N_API_URL`,
which is right for n8n Cloud and for a server whose public address loops back. Set it only if
yours does not (a reverse proxy that refuses its own hostname, or a Docker port mapping).

### B4. Deploy

```
.\run.cmd n8n/scripts/deploy-hosted.mjs --dry-run
.\run.cmd n8n/scripts/deploy-hosted.mjs
```

The dry run prints the plan: which of the seven workflows exist already (found by name and
updated in place), which will be created, and every address and id it will write. The real run
then creates the header-auth credential from `INTERNAL_API_KEY` (generating the key into `.env`
if it was the placeholder), rewrites the exports, updates each workflow, tags it `prdgenie`,
activates it, and **probes all five doors through themselves** — a GET, which runs nothing. It
exits non-zero if any door does not answer.

What it rewrites, and why the public API needs it:

| In the exports | Becomes | Because |
|---|---|---|
| `http://host.docker.internal:3000` | `SERVICE_BASE_URL` | that name only exists inside Docker on one machine |
| `http://localhost:5678` | `N8N_API_URL` (or `N8N_SELF_URL`) | WF1 calls the generate and delta doors on its own instance |
| `prdgenieWF0llmcall` etc., in Execute Workflow nodes and the error-workflow setting | the ids your instance handed out | the API refuses a supplied id (`request/body/id is read-only`), so references cannot be committed |
| `BIND_ME_openAiApi`, `BIND_ME_googlePalmApi` | the two ids from B2 | a credential id is a handle into one person's n8n |
| `prdgenieInternalKey` | the credential it created | same |

Run it again after any change to `n8n/workflows/`; it is an update, not a duplicate. The
credential it created is remembered in `n8n/workflows.local/hosted-bindings.json` (git-ignored)
and reused until `INTERNAL_API_KEY` changes.

### B5. The review service must hold the same secret

If the service runs on another machine, copy the `INTERNAL_API_KEY` line that B4 wrote into
that machine's `.env` and restart the service. n8n sends it on every `/internal/*` call as the
`x-internal-key` header, and the service answers 401 without it.

Then, from the deploying machine:

```
.\run.cmd
```

The preflight probes the same five doors at `N8N_INGEST_WEBHOOK_URL`'s origin, and the service
at `SERVICE_BASE_URL`'s port on localhost — so run it on the service's machine, or read the
`n8n running` and `every declared door registered` rows and ignore the service row.

### B6. The demo

Exactly as in the README from "The demo, in the order it is worth seeing", with one
substitution: the form is `https://<you>.app.n8n.cloud/form/prdgenie-ingest-form`, and
`show-fixture.mjs` prints that address once `N8N_INGEST_WEBHOOK_URL` is set.
`2-SET-UP-THE-DEMO.cmd` reads the same variable and opens the right tabs.

---

## If something goes wrong

| Symptom | Cause |
|---|---|
| `deploy-hosted` stops at "cannot reach the n8n API" | `N8N_API_URL` wrong, or the key lacks workflow scopes |
| `SERVICE_BASE_URL is ... localhost` refusal | a hosted n8n cannot reach your machine; use B1 |
| Doors answer, extraction fails at the first callback | the service is not reachable at `SERVICE_BASE_URL` *from n8n*, or the two `.env` files hold different `INTERNAL_API_KEY`s (401) |
| Extraction fails at the provider | the credential id in `.env` is not the one you created, or the key in n8n is wrong |
| A door answers 404 on the deploy's probe but the workflow is active in the UI | run the deploy again; it deactivates and reactivates, which re-registers webhooks |

---

## Followed from a fresh copy, 2026-09-10

The source archive from the release package was extracted into an empty folder and the
instructions followed there, against a **second, throwaway n8n** (the same image, port 5679, no
volume) and a **second review service** (port 3001, empty database), so that the shared
instance was never touched. The provider credentials in the throwaway were created with dummy
keys, because real keys are typed by a person and never by a script.

| Step | Followed as written? | What happened |
|---|---|---|
| README 0–1: Node, `copy .env.example .env`, edit | yes | `.env` edited to name ports 5679 and 3001 |
| README 5 before anything else: `.\run.cmd` | yes | Preflight reported exactly the two things missing: the service and the doors. Its fix-it hint named `n8n-local`, whatever `.env` said — BUG-080, fixed |
| README 3: `provision-internal-credential`, `bind-provider-credential`, `import-workflows`, restart — with the container name as the argument | yes | 7/7 imported; a key generated into `.env`; the per-machine binding written to `n8n/workflows.local/` |
| README 4: `.\run.cmd review-ui/server.js` | yes | Schema created on an empty file; up on 3001 |
| README 5: `.\run.cmd` again | yes | All six rows green, 5 of 5 doors |
| README demo 2: `prove-the-gate.mjs` on an empty database | yes | Says there is no version to attempt it on, and which command makes one. Correct, and the README's order (ingest first) already implied it |
| README demo 4: `grade.mjs C6` on an empty database | yes | "Nothing to grade: no run manifest", and the command to run first. The README now says so |
| README demo 1 | **no** | It began at an "Ingest tab". There is none — BUG-079. The step now begins at the form |
| `show-fixture.mjs T1` | yes | Printed the form address for port 5678, not the 5679 in `.env` — BUG-080, fixed |
| **B4**: `deploy-hosted.mjs --dry-run`, then for real | yes | Found the seven workflows the CLI import had made, updated them in place, created the internal credential, all five doors answered. Read back through the API, WF2 carried `host.docker.internal:3001` and WF1 `localhost:5679` where the exports say 3000 and 5678 |
| A fixture posted through the rewired door | yes, three times | First two: the fresh service recorded the document, then WF1 died calling its own generate door and the error handler wrote a dead letter with the node name and "service refused the connection". Cause: from inside a Docker port mapping the container's own address is `localhost:5678`, not the host's `localhost:5679` — the case `N8N_SELF_URL` exists for, and the deploy script's own check then wrongly refused an address equal to the export's literal (fixed). Third: WF1, WF2 and WF0 all ran, the provider refused the dummy key, and the door answered a proper envelope — `needs_review`, reason `llm_unauthorized`, the provider's own message, a version born `draft`. That is the run stopping and saying why; a real key turns it into an extraction |
| `check-all.mjs --list` | yes | 73 would run |

**Not tested, and why.** Extraction itself, because that needs real provider keys, which are the
one thing a script must not hold; n8n Cloud specifically, because the same public API was
exercised against n8n 2.36.9 self-hosted, and Cloud runs that API; and Linux or macOS for the
service, where the only difference is typing `node --env-file=.env` instead of `.\run.cmd`.
