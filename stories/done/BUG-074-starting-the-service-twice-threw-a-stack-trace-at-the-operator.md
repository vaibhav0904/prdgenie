# BUG-074: Starting the service twice threw a stack trace at the operator

**Severity:** major · it happened to Vaibhav, at step 2 of the setup for a recording
**Found:** 2026-09-07, by him, doing exactly what the run sheet says
**Area:** `review-ui/server.js` · `deliverables/deck/slides.mjs` (RUNBOOK step 2)

## What happened

Step 2 of the run sheet says *"Start the review service, and leave it running."* He had already
done that earlier. Running it again produced this:

```
node:events:487
      throw er; // Unhandled 'error' event
Error: listen EADDRINUSE: address already in use :::3000
    at Server.setupListenHandle [as _listen2] (node:net:2167:16)
    ... eleven more frames ...
  code: 'EADDRINUSE', errno: -4091, syscall: 'listen', address: '::', port: 3000
```

**Nothing was wrong.** The service was up, answering `/api/health`, pointed at the right database.
The correct action was to close the window and go to step 3.

## Why it matters more than an ordinary unhandled error

The run sheet had just been rewritten for someone who does not live in a terminal, on the premise
that instructions written by the person who already knows are not instructions (BUG-071's lesson,
one level up). Then the very first command in that rewrite answered a **correct state** with a
stack trace, an `errno` of `-4091` and the words *Unhandled 'error' event*.

**Already running is the most likely reason this port is taken, and it is not an error.** The run
sheet tells the operator to leave the service running all day; the same run sheet then tells them
to run the same command again before the second take. The two instructions guarantee this.

## Fixed

`server.on('error')` now handles `EADDRINUSE` by **asking the port what is there** before saying
anything, because "port taken" and "already running" are different facts and only one of them is a
problem:

- `/api/health` answers `ok` — it is this service. Print that it is already running, print the
  schema version and database path so the operator can see it is the right one, say in words that
  this is not an error, and **exit 0**. Zero deliberately: "the service is up" is the state the
  caller wanted, and a non-zero exit would make `demo-readiness` and every wrapper report a
  failure that is not one.
- Anything else — print that the port is held by something that is **not** this service, and the
  two PowerShell commands that name it, and how to move to another port including the
  `SERVICE_BASE_URL` consequence.

Neither answer is a stack trace, and any other error code still throws.

## Both branches were run, not reasoned about

```
$ .\run.cmd review-ui/server.js
The review service is ALREADY RUNNING on http://localhost:3000. Nothing to do.
  schema version 1 | ...\data\prdgenie.db
  This is not an error. You started it earlier and left it running, which is
  what you are supposed to do. ...                                    exit=0
```

The second branch needed a fault to exist at all, so one was injected: a plain HTTP server that
answers 200 with the wrong body, on a spare port.

```
$ SERVICE_PORT=3009 .\run.cmd review-ui/server.js
Port 3009 is taken by something that is NOT this service.
  It did not answer /api/health, so starting here would fight it for the port.
  ...                                                                 exit=1
```

**A handler with one reachable branch is a handler that has been read, not tested.** The squatter
is what makes the second branch a fact.

## Still open

There is no permanent control for this. The squatter above was written, run and deleted; nothing
in `check-all` starts the service twice and requires a friendly answer, and nothing holds the port
with a stranger and requires the unfriendly one. It joins the **19 of 51 checkers with no control**
on slide 8. The two branches are verified as of today and not defended against tomorrow.

## The run sheet, too

Step 2 now says what "ALREADY RUNNING" means and that it is a success, and the recovery table has
a row for it — because the fix that matters most here is the operator not needing the fix.
