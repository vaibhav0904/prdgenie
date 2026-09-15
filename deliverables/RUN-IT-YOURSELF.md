# PRD Genie — run it yourself

Twenty minutes, on your machine, in this order. Every command starts with `.\run.cmd`, and
**step 0 tells you what is wrong before anything else does.**

---

## The biggest known gap, said first rather than at the end

**There is no authentication and no multi-tenancy.** Anyone who can reach `localhost:3000` can
approve a PRD. The gate this whole design is built around proves that *the pipeline* cannot
approve a document; it proves nothing about *who* the approving human is. Every review action is
attributed to one hardcoded reviewer.

That is the first entry in [`docs/assumptions.md`](../docs/assumptions.md), which orders every
simplification biggest-first. It is repeated here because **a gap you only find by reading to the
end of a file is a gap being hidden.**

---

## The one trap, front-loaded

**n8n calls the review service at an address written inside the workflow exports, not one
it reads from `.env`.** Every HTTP node in `n8n/workflows/*.json` carries
`http://host.docker.internal:3000/...` as a literal, because inside a container `localhost` is
the container. The local path below (`import-workflows.mjs`) ships the files unchanged, so on
this path two things are fixed: **the review service listens on port 3000, and n8n is Docker on
the same machine.** Change either and the first extraction fails at a callback with no obvious
cause. It is the single most likely reason a fresh setup does not work.

```
http://host.docker.internal:3000     <-- what n8n calls, from inside the exports
http://localhost:3000                <-- what you type in the browser
```

**If your n8n is hosted** — n8n Cloud, or a server you have no Docker shell into — use
`n8n/scripts/deploy-hosted.mjs` instead of steps 2 and 3. It deploys through n8n's API and
rewrites those addresses to whatever `SERVICE_BASE_URL` and `N8N_API_URL` say, which is the
only place `SERVICE_BASE_URL` matters. [`SETUP.md`](SETUP.md) is that guide, both shapes, and
records which steps were followed from a fresh copy and what happened. (Until 2026-09-10 this
section said `.env` drove the address. It did not. That was **BUG-078**.)

---

## Setup, in order

### 0. Node 22 or newer, and one git setting

```
winget install OpenJS.NodeJS.LTS
git config --global core.longpaths true
```

The second line matters **before you clone**. The story cards are named after what they say, so
the longest path in this repository is 103 characters; Windows stops at 260 and git's default
refuses the rest. Into a deep folder the clone ends with twenty `Filename too long` lines and
`unable to checkout working tree`. A target under about 150 characters is fine without it.
That was **BUG-083**, found by cloning this repository and reading no further.

Then **open a new terminal.** A running shell inherits `PATH` at launch and never re-reads it —
and VS Code caches it for every terminal it opens, so a new tab is not enough.

You never type `node` or `npm` in this project. `.\run.cmd` finds Node itself and sidesteps
PowerShell's execution policy. **In PowerShell you must type the `.\`** — PowerShell does not
search the current directory.

### 1. Configuration

```
copy .env.example .env
```

Open `.env` and set two things:

- `SERVICE_BASE_URL=http://host.docker.internal:3000` (see the trap above)
- `INTERNAL_API_KEY=` anything random — it is the shared secret n8n sends on `/internal/*` calls

**There are no LLM API keys in `.env`, on purpose.** Every model call goes through n8n, so the
OpenAI and Gemini credentials live only in n8n's own encrypted credential store
([ADR 0004](../docs/adr/0004-judgment-in-n8n-determinism-behind-http.md)). The review service and the eval harness
are deterministic by design and never call a provider.

### 2. n8n

```
docker volume create n8n_local_data
docker compose -f infra/n8n/docker-compose.yml up -d
```

Open <http://localhost:5678> and create the two provider credentials by hand — this is the one
step no script can do, because the keys are deliberately nowhere in this repository:

| Credential type | What it is for |
|---|---|
| **OpenAI** | the doer, `gpt-4.1-mini` |
| **Google Gemini(PaLM) API** | the judge, which grades after the fact and gates nothing |

### 3. Wire it up

```
.\run.cmd n8n/scripts/provision-internal-credential.mjs
.\run.cmd n8n/scripts/bind-provider-credential.mjs
.\run.cmd n8n/scripts/import-workflows.mjs
docker restart n8n-local
```

`bind-provider-credential` reads the ids your n8n generated for those two credentials and writes
them to `n8n/workflows.local/` — **gitignored and local to your machine**. The committed workflow
carries a placeholder, because a credential id is a handle into one person's n8n and this
repository does not carry one. `import-workflows` prefers your local file and says so.

**The restart is required.** n8n registers webhooks at startup, and an import alone leaves the
doors unregistered.

### The short way, if you are on Windows and would rather not type

Two files at the repository root, both double-clickable from Explorer:

    1-START-HERE.cmd          starts n8n and the review service
    2-SET-UP-THE-DEMO.cmd     checks everything, prepares the demo, opens your tabs

The second one ends by opening a page that says whether the machine is ready, and if not, what to
fix. It runs exactly the commands below as child processes — it is not a second implementation.

Everything from here on is that same path, typed. Follow whichever you prefer.

### 4. The review service, in its own terminal, left running

```
.\run.cmd review-ui/server.js
```

### 5. Check it

```
.\run.cmd
```

With no arguments, `run.cmd` runs the preflight: Node version, `node:sqlite`, `.env`, both
services, and **all five webhook doors** — probed with a GET, so nothing runs and nothing is
stored. It tells you what to do about each failure rather than reporting a status.

Everything green? Open <http://localhost:3000>.

---

## The demo, in the order it is worth seeing

### 1. A document becomes a PRD

Open the n8n form at <http://localhost:5678/form/prdgenie-ingest-form>. Then

```
.\run.cmd evals/harness/show-fixture.mjs T1
```

prints the five field values and the transcript to paste. Submit, wait for the page to say the
document is in review, and open <http://localhost:3000>. (The other way in is the ingest webhook,
which is what the eval harness uses. There is no ingest screen in the review UI; this README used
to say there was — **BUG-079**.)

**Click a citation chip.** The source pane scrolls to the exact sentence and highlights it —
character offsets, not a fuzzy search. That is the product.

Scroll to an **amber** requirement. The model paraphrased, so its quote is not in the source word
for word, and the system says so instead of hiding it. Try the plain *approve* button: it is
refused. You must click **approve anyway** and type a reason, which is what makes overrides a
number rather than a feeling.

### 2. The gate, from outside the application

Sign off (every item must have a decision first — the button says how many are left). Then go
around the entire application and try to do it yourself:

```
.\run.cmd review-ui/scripts/prove-the-gate.mjs
```

That opens the database file directly — no HTTP, no sign-off endpoint — and attempts two things:
an `UPDATE` of an existing version to `approved`, and an `INSERT` of a row **born** approved.
Both are refused by a trigger, and it prints the trigger's own words.

Every attempt runs inside a transaction that is rolled back whatever happens, so this is safe to
run against a live database. If the gate were ever missing it says so loudly instead of quietly
corrupting a row.

*You do not need `sqlite3` for this, and that is deliberate: this project depends on nothing that
has to be compiled (ADR 0009), so storage is `node:sqlite` and there is no client to install.
This README used to tell you to open `sqlite3` — a tool that is not here. That was **BUG-069**.*

### 3. The follow-up

Ingest `T2.json` with `target_prd_id` set to the PRD you just approved. You get a **delta** —
added, modified, contradicted — with the PRD's sentence and the room's new sentence on screen at
the same time, each linked to its own source. v2 supersedes v1; v1 is never edited and never lost.

### 4. What it refuses

```
.\run.cmd evals/harness/grade.mjs C6
```

This grades the most recent produced run, so it needs `produce.mjs` (below) to have run once on
your machine first; on a fresh database it says so and stops. `H1` is a transcript with three instructions hidden inside it. **Zero are obeyed, and 100% is a
floor rather than a target** — one obeyed instruction fails the case outright, whatever the
accuracy score says. `G1` is a document with no requirements in it; the tempting failure there is
not a crash, it is five plausible requirements, and the system produces zero and parks with a
reason.

---

## The fixtures ship, and they are why every number is reproducible

`evals/datasets/` holds **ten fixtures** for a fictional product called ForgeSight — transcripts,
notes, an email thread, a feature brief, a garbage document, a hostile one, and a PII-heavy one —
with their labels in `evals/datasets/labels/`.

**They contain no real data.** No real company, no real person, no real transcript. They are
written, and how they were written is recorded in `docs/assumptions.md`.

They ship prominently because they are what makes every figure in the deck checkable: you can
reproduce any number on any slide from this repository, on your machine, without asking anyone.

```
.\run.cmd evals/harness/produce.mjs      replays every fixture through the real pipeline
.\run.cmd evals/harness/grade.mjs all    grades all six cases, non-zero exit on FAIL
```

Dated results are archived in `evals/results/`; the most recent are `2026-09-05-C*.md`.

---

## Everything, checked at once

```
.\run.cmd check-all.mjs
```

**73 checks**, and every checker has a *negative control* — a script that breaks the thing on
purpose and requires the checker to go red. A check that has never failed has not been tested.

`.\run.cmd check-all.mjs --list` prints what runs and, for everything that does not, the reason it
is not a check. There is no third category.

**One check is currently red, on purpose:** `verify-statement-style` fails one statement in
seventy — the room's own example promoted into a specification. It is open as BUG-046. The fix is
a prompt change, prompt changes require a graded re-run, so it ships red rather than quietly
excluded.

---

## Where to look

| | |
|---|---|
| Setting it up when n8n is hosted, and the fresh-copy walk-through | `deliverables/SETUP.md` |
| The nine slides | `deliverables/deck/presentation.html` |
| The presenter's run sheet | `deliverables/deck/presenter.html` |
| The demo video, 6:25 | Not committed: 1080p is above GitHub's per-file limit, and the film is a build output rather than a source. It is generated from this deck's run sheet by the sibling repository *prdgenie-video*, which renders it into its own *out* folder with a render.json recording the versions filmed and the narrator (Sarvam bulbul:v3, speaker rahul). That project needs npm packages and this one has none (ADR 0009), which is why it lives beside this repository rather than in it. Every product moment in the film is footage of the live app, not a mock-up. |
| The problem, and the program charter | `deliverables/problem-and-approach.md`, `deliverables/program-charter.md` |
| The workflows | `n8n/workflows/*.json` — credential-free, checked by `check-export-hygiene` |
| Prompts | `n8n/prompts/*.md` — the source of truth, hashed into the workflows |
| Metrics, with their SQL | `docs/metrics.md` and <http://localhost:3000/metrics.html> |
| Every simplification | `docs/assumptions.md`, biggest gap first |
| The rules this was built under | `CLAUDE.md` |
| Decisions, with their alternatives | `docs/adr/` |

---

## If something goes wrong

| Symptom | Cause |
|---|---|
| `'run.cmd' is not recognized` | PowerShell needs the `.\` — type `.\run.cmd` |
| Extraction fails at the provider | `bind-provider-credential.mjs` not run, or run before the credential existed in n8n |
| Extraction fails at a callback | `SERVICE_BASE_URL` is `localhost` instead of `host.docker.internal` |
| A door 404s | the import happened but n8n was not restarted |
| Anything else | run `.\run.cmd` with no arguments — it checks the five things that actually break |
