# BUG-075: The setup was unusable by the only person who had to use it

**Severity:** blocker · the demo could not be recorded, and nothing wrong was in the product
**Found:** 2026-09-08, by Vaibhav, on his third attempt to follow his own run sheet
**Area:** `deliverables/deck/slides.mjs` (RUNBOOK) · new launchers at the repo root

## The finding

> *"The steps through terminal are difficult, I am not understanding what's happening."*

Three rewrites of the setup section had already happened, each fixing the previous one's idea of
what "clear" means:

1. It had choreography and no commands. **BUG-069.**
2. It had commands and never said **where** to type them.
3. It said where — using two labels, "Window A" and "Window B", that its only reader read twice
   and could not use. A key with no lock.

Each rewrite made the instructions better and left the thing being instructed alone. The fourth
stopped improving the instructions.

**Every failure of the last three days came from the setup, and none of it came from the
product:** a stack trace at step 2 (BUG-074), a run sheet that never said which window, an
abstraction nobody could hold. The riskiest part of this release was the part that is not the
project.

## What the terminal was actually costing

Not the typing. The typing is eight lines. What it cost was **a model of the machine** — that a
window can be busy, that one command never returns, that a second window is therefore needed, that
`cd` does not carry between them, that `.\` is not decoration. None of that is knowledge about
PRD Genie. All of it had to be acquired before the first command, by someone whose job today is
to talk about a product for five minutes.

## Fixed: two double-clicks

- **`1-START-HERE.cmd`** — starts Docker's n8n and the app. The window that stays open **is** the
  app, and now says so in its first line. Safe to double-click twice (BUG-074).
- **`2-SET-UP-THE-DEMO.cmd`** — runs `deliverables/demo-setup.mjs`, which runs the four steps that
  already worked, **puts the follow-up transcript on the clipboard** via the `--raw` flag that
  `show-fixture` already had "for a pipe", opens the five demo tabs, and opens a **results page**
  that says *Ready to record* with the version numbers, or says what is wrong and opens nothing.

Nothing is typed. Not in setup, and not on camera.

### Three things it deliberately does not do

**It does not reimplement any step.** Each is the existing script, run as a child process with the
same arguments `run.cmd` uses. So the manual path is not merely still documented — it is the same
code, and if this orchestrator is wrong, nothing it wraps is.

**It does not parse their output.** Each step writes what it decided into `.demo-state.json`
(`deliverables/demo-state.mjs`); the launcher reads that. *A summary scraped out of printed text is
a contract nobody declared* — it breaks when a sentence is reworded, silently, which is the only
kind of breakage that reaches a recording.

**It does not stop being honest when it is convenient.** A cheap run is titled *"Ready — but not
proven"*, never *"Ready to record"*, and the results page carries a **Proven end to end?** row that
says which mode ran. The old script had the same rule in its last line; it is now the headline.

## Why not an n8n workflow, which is what was asked for

`infra/n8n/docker-compose.yml` mounts exactly one volume, n8n's own. **The repo and
`data/prdgenie.db` are not mounted into the container** (ADR 0002 — applications run on the host).
A workflow cannot read the database, run a script, or open a fixture. It could only call HTTP
endpoints on the review service, and those do not exist. Building them is the whole job; a form, a
sixth door, error routing to WF4, and rows in `check-spine` and `check-export-hygiene` would be
added on top, along with a demo-only workflow sitting in the export a stranger reads.

Worth recording, because it was unexplored and the answer is not what this project assumed: **an
n8n form *can* show computed results**, through the `n8n Form` node with `operation: "completion"`.
n8n 2.36.9 names it in the very error message BUG-005 hit
(`Form/utils/utils.js:325`: *"To configure your response, add an 'n8n Form' node and set the
'Page Type' to 'Form Ending'"*). BUG-005 only ever ruled out `Respond to Webhook`. That is a real
option for a future story — it is simply not why this one went the other way.

## Both branches were run — and the launchers themselves were not

**This card claimed a verification it had not done, and the claim shipped.**

What was run was `demo-setup.mjs`, directly, with forward slashes typed by hand:

- **GO:** four steps, 42s live readiness, T2 on the clipboard, five tabs, exit 0.
- **NO-GO, injected** with `docker stop n8n-local`: stopped after step 1, opened nothing, changed
  nothing, exit 1, and listed both failures with their fixes.

What was **never** run was either `.cmd` file. Both shipped broken. `1-START-HERE.cmd` held
`review-uiserver.js` and `2-SET-UP-THE-DEMO.cmd` held `deliverablesdemo-setup.mjs` — the backslash
eaten by the JavaScript string literal that generated them, since `\s` and `\d` are
escapes. **BUG-071 for the third time this week**, and this time inside the fix for a card about
instructions the operator could not follow.

Vaibhav double-clicked the first file and got `Cannot find module`.

The lesson is not "escape it better". It is that **the artefact that ships is the one that has to
be run** (BUG-041), and a wrapper is an artefact. Testing what a launcher calls is not testing the
launcher: the two differ by exactly the thing that was wrong.

### Fixed, and then actually executed

The launchers now use **forward slashes**, which node accepts on Windows and `cmd.exe` passes
through `%*` untouched. The character that keeps disappearing is simply not used any more —
escaping it harder only moves the next occurrence.

Both files were then run, as files:

```
> .\1-START-HERE.cmd
  THIS WINDOW IS THE APP. Leave it open. Do not type in it.
  Starting the workflow engine...   n8n-local
  Starting the app...
  The review service is ALREADY RUNNING on http://localhost:3000. Nothing to do.

> .\2-SET-UP-THE-DEMO.cmd
  1/4 checking the machine end to end ... ok
  2/4 leaving v1362 three clicks from sign-off ... ok
  3/4 building the hostile-transcript tab ... ok
  4/4 putting the follow-up transcript on your clipboard ... ok
  GO.
```

### A second defect, found only by running it

`1-START-HERE.cmd` ended with **"The app has stopped"** — false in the most likely case. The app
had not stopped; it was already running in an earlier window, which is exactly what the run sheet
tells the operator to arrange. Reaching that line means one of three things, so it now reads the
exit code and says which: already running elsewhere, shut down and restartable, or genuinely
broken. None of that was reachable by testing the script it calls.

## The run sheet

Setup is now two steps. The eight commands are **kept whole** in a new appendix, visibly quieter
than the main path, for a stranger or for the day a launcher misbehaves. The two-windows explanation
is gone entirely — with one double-click there is one window, and you never type in it.

## Still open

No control fails on this. Nothing in `check-all` double-clicks a launcher, and nothing holds a
dependency down and requires the results page to say so. `demo-setup.mjs` is **declared** as a tool
rather than run, because a sweep that ran it would spend money three times over on every pass. The
two branches are verified as of today and not defended against tomorrow. It joins the **19 of 51
checkers with no control** on slide 8.
