# ADR 0010 — PRD Genie owns every piece of its own stack

**Status:** accepted, **amended 2026-09-01 — the n8n half was reversed on evidence** ·
**Date:** 2026-09-01

## Context

Setup for E1-S1 borrowed the n8n already running on this machine, because it was there and
the plan assumed n8n was self-hosted and available. Inspection during E1-S1 showed what that
actually meant: the container is `salesgenie-n8n`, belonging to a different project, and it
is configured with `DB_TYPE=postgresdb` pointing at a sibling `salesgenie-postgres`.

So every workflow PRD Genie built would have been stored inside another project's database.
Three consequences, none of them acceptable:

- **Export hygiene becomes a filtering problem.** E9-S1 must produce a credential-free
  workflow export for release. Pulling from a shared instance means separating our
  workflows from someone else's on every export, forever, and getting it wrong once means
  shipping another project's work.
- **The reset a UAT needs does not exist.** "Reset to clean dummy data" cannot mean
  clearing an instance that holds work belonging to something else.
- **Lifecycle is not ours.** Stopping, upgrading or wiping that container is someone
  else's decision, and their `docker compose down -v` is our data loss.

Alternatives:

- **Keep sharing and filter on export** — disqualified: it manages the entanglement
  forever instead of removing it once, and the failure mode is silent and embarrassing.
- **A dedicated n8n plus a dedicated Postgres** — disqualified as over-provisioning.
  n8n's default SQLite is more than adequate at pilot scale and needs nothing provisioned.
  Postgres would genuinely be the production answer, which is recorded in
  `docs/assumptions.md` rather than built.
- **Reuse the container but point it at a different database** — disqualified: it mutates
  another project's container, which is exactly the boundary being drawn.

## Decision

PRD Genie runs **its own n8n**, defined by a `docker-compose.yml` in this repo:
container `prdgenie-n8n`, image `n8nio/n8n:latest`, **port 5679**, SQLite storage in a
named volume `prdgenie_n8n_data`, on its own network. `docker compose up -d` starts it;
`docker compose down -v` is the honest reset.

More generally: **nothing this project depends on is borrowed.** Its database is a SQLite
file inside the repo, its runtime has zero npm dependencies (ADR 0009), and now its
orchestrator is its own container. Anything shared is a coupling nobody wrote down.

Verified on creation: `DB_TYPE=sqlite`, its own `/home/node/.n8n/database.sqlite`, cannot
resolve the other project's Postgres host at all, and reaches the review service at
`http://host.docker.internal:3000`.

## Consequences

- E9-S1 gets simpler and safer: the export pulls everything from an instance that contains
  only our work, so "filter our workflows out of theirs" stops being a step that can be
  forgotten.
- A UAT can legitimately reset the orchestrator, which the demo rehearsal in E9 needs.
- The compose file documents the setup instead of it living in someone's memory — it is
  the n8n half of the run-it-yourself README.
- **Accepted cost:** port 5679, not the conventional 5678, for as long as the other
  instance exists. Both run side by side; `.env` and the compose file say so in comments,
  because a wrong port is a confusing failure rather than a loud one.
- **Accepted cost:** a second n8n running locally uses memory that a shared one would not.
  Irrelevant at this scale, and the isolation is worth more.
- **Accepted cost:** workflows built before this change would need re-importing. None had
  been built — the entanglement was caught before it cost anything, which is the argument
  for looking at the boring perimeter early.

## Amendment — 2026-09-01: PRD Genie is a guest in a shared n8n after all

Vaibhav asked the obvious question the decision above never answered: *why not one
project-agnostic n8n on the conventional port?* Checking properly, rather than defending
the decision, the reasoning above turns out to be two-thirds wrong.

**What the evidence showed.** The instance on 5678 holds **0 workflows and 0 executions** —
and **7 credentials**, including `OpenAI account` and `Google Gemini(PaLM) Api account`,
with the rest named for an earlier project of mine. It is not that project's working
instance; it is this project's own n8n, provisioned this morning by a compose file that
happened to name it after the earlier one. There was never anything to be entangled with.

**Which of the original arguments survive contact.**

- *"Export hygiene becomes a filtering problem forever"* — **wrong, and the weakest of the
  three.** n8n's API filters by tag in one query parameter. Tagging our workflows
  `prdgenie` is a line of config, not a standing burden.
- *"The reset a UAT needs does not exist"* — **wrong, and confused about what a reset is.**
  A UAT resets application data (`data/prdgenie.db`). Workflow definitions are code-like
  artifacts we would never wipe as test data. This argument solved a problem nobody has.
- *"Lifecycle is not ours"* — **partly stands, and is fully mitigated.** A
  `docker compose down -v` on the other stack would take our workflows with it. But the
  repo is the source of truth: `n8n/workflows/*.json` is committed, and an instance is
  rebuildable from it. Treating n8n as a runtime rather than a store is better practice
  than isolating it, and it is what the export step was already going to produce.

Set against that, sharing has a real benefit the original decision missed entirely: the
credentials PRD Genie needs — OpenAI for the doer, Gemini for the judge (ADR 0001) —
**already exist there**, and duplicating them would mean two copies of the same secrets on
one machine, which is worse for security, not better.

**Decision, revised.** PRD Genie uses the existing n8n on **port 5678** as a guest. Every
workflow it creates carries the tag `prdgenie`; the export filters on that tag and touches
nothing else. `docker-compose.yml` stays in the repo, unused day to day, as the one-command
path for anyone without an n8n — a stranger, or a clean machine — on port 5679.

- The container's name is historical and means nothing; the instance is general-purpose.
- Two documented setups instead of one, which is more README surface but matches reality:
  the author has an n8n and a stranger does not.
- **The unamended half stands:** the application database is still exclusively ours, and
  the runtime still has zero borrowed dependencies (ADR 0009). What reversed is n8n
  specifically, not the principle that this project should be reproducible on its own.
- **The lesson worth keeping is about the reasoning, not the port.** Two of the three
  arguments above were asserted rather than checked, and both collapsed on ten minutes of
  inspection. A decision defended by three reasons where two are untested is a decision
  with one reason.

---

## Amendment 3 — 2026-09-02: the instance we were a guest in no longer exists

Docker Desktop was factory-reset. `docker ps -a`, `docker images`, `docker volume ls` and
`docker system df` all came back empty: **0 containers, 0 images, 0 volumes, 0 build cache**.
The shared n8n on 5678 and its Postgres are gone, along with n8n's credential store.

**What changes.** Nothing about the reasoning in Amendment 2 — it was correct at the time
and would be correct again if a shared instance existed. What changed is its *premise*: the
argument for guesting rested on "an n8n is already running on 5678 and it already holds the
OpenAI and Gemini credentials". Neither half is true any more.

**Decision.** `docker-compose.yml` in this repo becomes the primary path rather than the
stranger fallback, and moves from port 5679 to **5678** — now unclaimed, and the port every
`.env`, doc and UAT card already names. One documented setup instead of two. The container
is `n8n-local`; the old name is swept from scripts and cards, and left intact in dated
records and in this ADR, which is history.

**What the reset proved, at no cost.** Amendment 2 accepted guesting on one mitigation:
*committing `n8n/workflows/*.json`, so n8n is a runtime and the repo is the store.* That
had never been tested. Today all three workflows were rebuilt into a brand-new instance
with one command, on a machine where the n8n they were authored in does not exist. The
mitigation held exactly as claimed.

**What it cost, also exactly as designed.** The OpenAI credential could not be restored,
because ADR 0004 puts no LLM key in `.env` or the repo. It has to be re-entered by hand,
once, in the n8n UI. That is the bill for the security decision made in the first hour of
this project, and it is the right bill: the alternative was a key in a file that survives
a `docker volume rm` — and survives a `git push`.

**The lesson.** *A dependency you do not control is a dependency whose disappearance you
should have already rehearsed.* We had rehearsed it — in writing, in Amendment 2 — and the
rehearsal turned out to be the reason today cost twenty minutes instead of a day. The part
that was not rehearsed, the credential, is the part that still needs a human.

---

## Amendment 4 — 2026-09-02: the instance belongs to no project, including this one

Amendment 3 moved this repo's `docker-compose.yml` from fallback to primary. Vaibhav's
objection, immediately and correctly: *"the n8n on docker should be project agnostic and can
run independent of the project."*

He is right, and the amendment had missed the point of its own lesson. Owning the instance
instead of borrowing it does not remove the coupling — it reverses its direction. A compose
file at a repo root is *owned by that repo*: Docker names the project after the directory
(the network was literally `prdgenie_default`), and a `docker compose down -v` run while
tidying the application would take the workflows of every other project with it. That is
precisely the failure this project suffered from the other side on 2026-09-02, when a
different project's teardown removed our runtime.

**Decision.** The n8n instance belongs to the machine, not to any application.

- The compose file moves to **`infra/n8n/docker-compose.yml`**, out of the application tree.
  The directory name says what it is: infrastructure, not code this project ships.
- It declares **`name: n8n-local`**, so the compose project is fixed regardless of the
  directory it is invoked from, and is never namespaced under an application.
- The volume is **`external: true`**, created once by hand (`docker volume create
  n8n_local_data`). An external volume cannot be removed by any compose project's `down -v`.
- What PRD Genie may do to the instance is written at the top of the file: import and update
  workflows tagged `prdgenie`, and restart after an import. What it may not do: destroy
  anything. No script does. "Reset to clean data" in a UAT means `data/prdgenie.db`, never
  this volume — workflow definitions are code, not test data.

**Verified rather than asserted**, before the OpenAI key was re-entered so the blast radius
was two minutes: `docker compose -f infra/n8n/docker-compose.yml down -v` was run
deliberately. The volume survived, and after `up -d` all three workflows and the internal
service credential were still present. The guarantee in the comment is a tested claim.

**The lesson, which is the same one this ADR keeps re-learning in new clothes.** Twice now
the coupling was invisible because it lived in a *default* nobody chose: first the borrowed
instance's Postgres, now Compose naming a project after its directory. Both times the
arrangement looked deliberate and was merely inherited. **Ask what named this, and whether
anyone decided it.**

## Amendment, 2026-09-03 (E7-S3) — an inactive error workflow is not an error workflow

The import script honours each workflow's own `active` field, and WF4 was written
`active: false` on the reasoning that n8n runs an error workflow on demand rather than from a
trigger of its own. **That was true in n8n 1.x and is false in 2.x**, which builds its
workflow dependency index from *published* workflows only:

```
Finished building workflow dependency index. Processed 0 draft workflows, 3 published workflows.
```

WF4 was in neither column. WF2 failed correctly, `settings.errorWorkflow` was correct, and
**nothing happened** — no execution, no row, no log line. It was found by the E7-S3 drill and
by nothing else; every check that read the wiring said it was right, because it was.

Two consequences, both now in the repo:

- WF4 ships `active: true`, and its sticky note records what the old claim cost.
- `check-error-routing.mjs` reads the wiring **out of the running instance** as well as out of
  the files — through `docker exec … n8n export:workflow` when no API key is configured, which
  is this project's normal state. A check whose strongest assertion is switched off by a
  missing optional key is a check that will be green for the wrong reason.

**Same lesson as the two above, third set of clothes**: the arrangement looked deliberate and
was inherited — this time from a previous major version of the tool, through a comment that
was accurate when it was written.
