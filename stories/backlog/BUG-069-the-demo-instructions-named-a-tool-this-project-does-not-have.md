# BUG-069: The demo instructions named a tool this project deliberately does not have

**Severity:** major · the best moment in the deck would have failed on camera, at a command prompt
**Found:** 2026-09-07, by Vaibhav asking *&ldquo;do you have step-by-step instructions on how to
run the workflow?&rdquo;*
**Area:** `deliverables/deck/slides.mjs` (the run sheet) · `deliverables/RUN-IT-YOURSELF.md`

## What happens

The run sheet's cue for slide 4 — the approval gate, which is the strongest thing this project
has to show — read:

> *Switch to a terminal with sqlite3 already open on `data/prdgenie.db`.*

```
$ which sqlite3
NOT on PATH
$ docker exec n8n-local which sqlite3
(not in the container either)
```

**There is no `sqlite3` on this machine and none in the n8n container**, and there never was.
The README said the same thing in different words: *&ldquo;in any sqlite client&rdquo;*.

## Why it was always going to be absent

**ADR 0009: depend on nothing that has to be compiled.** Storage is `node:sqlite`, built into
Node 22, precisely so that this project installs nothing. The instruction asked for a client whose
absence is a *design decision the project is proud of* — and it appeared in the two documents
whose whole job is to be followed literally by someone else.

## The second half, which is the part worth keeping

The cue was not just unrunnable, it was **not a runbook at all.** It had the choreography —
*click a citation chip*, *type the UPDATE by hand*, *paste T2 into the ingest form* — and nothing
about how to reach a state where any of that is possible:

- no instruction to start either service, or to check them
- no URL for the review screen, and **no version to open** — the database holds 2,300 documents
- the &ldquo;ingest form&rdquo; is n8n's, not the review UI's, and the run sheet did not say so
- no way to get T2's text out of its JSON file without hand-unescaping it on camera
- nothing to do when a door 404s, which is the failure this project has filed four cards about

**A run sheet that assumes the system is already running is a run sheet for someone who does not
need it.**

## Fixed the same day

- **`review-ui/scripts/prove-the-gate.mjs`** — the demonstration, on `.\run.cmd`, with nothing
  installed. It opens the database file directly, attempts the `UPDATE` *and* the `INSERT` that
  BUG-049 was about, and prints the trigger's own refusals. **Every attempt is inside a
  transaction that is always rolled back**, so it is safe live — and if the trigger were ever
  missing it says so loudly rather than corrupting a row. Strictly better than the sqlite3
  version: one command instead of a REPL, and it proves the half nobody was going to type.
- **`evals/harness/show-fixture.mjs`** — prints a fixture's raw text between two rules, with
  exactly what to put in each form field.
- **A runbook at the top of the run sheet** — five setup steps with their exact commands and what
  each should print, the five windows to have open with their URLs, and a recovery table.
- Every demo cue now carries its exact command or URL, including **`?version=1431`**: T1 kickoff,
  14 requirements, one amber, in review. Named, not searched for.
- The README's gate instruction now runs.

## The rule this earns

**An instruction is not verified by being written, and a command in a document is a claim.**
`check-readme-links` already tests that every `.\run.cmd` in the README points at a script that
exists — it passed throughout, because `sqlite3` is not a `.\run.cmd`. The gap is commands that
are *not ours*: `docker`, `curl`, a client someone might not have.

The general fix belongs on **E9-S2's remaining gate** — following the document verbatim on a
clean machine — which is the only thing that catches this class, and is still open.
