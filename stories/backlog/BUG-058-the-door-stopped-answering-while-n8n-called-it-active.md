# BUG-058: The door stopped answering while n8n called it active

**Severity:** major · it is the door a PM uses, and the failure is silent from the inside
**Found:** 2026-09-04, `verify-doors` and `verify-routing` red in a sweep, minutes after both were green
**Area:** n8n webhook registration · `n8n/scripts/import-workflows.mjs`'s restart advice

## What happens

```
FAIL  verify-doors    TC1  the webhook door accepts JSON and stores a canonical document
                           envelope: {"code":404,"message":"The requested webhook \"POST ingest\"
                           is not registered."}
FAIL  verify-routing  TC7  the routing decision is an event on the trace
```

And at the same moment, n8n's own account of itself:

```
$ docker exec n8n-local n8n list:workflow --active=true
prdgenieWF1ingest|PRDGenie WF1 - Ingest        <- active
$ docker ps
Up 4 hours                                      <- not restarted
```

**Active, up, and not answering.** A `docker restart n8n-local` fixed it immediately and the same
POST returned a normal envelope.

## Why this is worth a card rather than a shrug

BUG-005 and BUG-043 are the same family: *a door never opened is not a door*. BUG-043 in
particular was a form door shut for two days behind an HTTP 200. The lesson was supposed to be
that the doors are tested through themselves, and they are — `verify-doors` caught this within
minutes, which is the machinery working.

What is new is that **the door lapsed with no deployment in between**. The known cause of an
unregistered webhook is an import without a restart, and `import-workflows.mjs` says so in its
own output. Nothing imported here. So either something de-registered it, or n8n's registration
does not survive whatever else happened in those minutes.

## What is NOT established, and must not be guessed

The cause. Between the last green run and the red one: two `/internal/` routes gained a guard,
the review service was restarted twice, and several checks ran. **None of those touches n8n**,
and saying "probably the service restart" would be exactly the plausible-story-about-the-wrong-
thing this project has now been bitten by three times (BUG-054).

## What the fix has to produce

1. **A reproduction, or an honest "not reproduced".** Restart the review service ten times and
   see whether the webhook survives. If it does, this stays open with the evidence attached.
2. **A cheaper detector than a full sweep.** `verify-doors` finds it, but it costs a document
   through the real door. A GET on a POST-only webhook distinguishes *registered* from *not
   registered* by the body of the 404 — `negative-control-clause.mjs` already does exactly this
   in `waitForDoors()`. Lift it into `preflight.mjs`, which `run.cmd` runs before every bare
   invocation, and the answer is free and immediate.
3. **Then decide whether the sweep should refuse to start** when the doors are shut, the way it
   already skips `check-*` when n8n is not answering. A sweep that runs the door checks against a
   dead door produces two red rows with a true message and a misleading cause.

---

## 2026-09-05 — **NOT REPRODUCED**, and that is the result rather than a missing one

The card's first requirement, run exactly as written: restart the review service ten times, probe
every door between each.

```
before any restart       ingest=registered  generate=registered  delta=registered
after restart 1          ingest=registered  generate=registered  delta=registered
...
after restart 10         ingest=registered  generate=registered  delta=registered

NOT REPRODUCED: ten restarts of the review service, every door still registered.
```

**The cause remains unknown.** Ten restarts of the one thing that changed between the green run
and the red one did not unregister anything. Saying "probably the service restart" was already
the wrong answer before this ran; it is now the wrong answer with evidence against it.

What this does **not** rule out: something else in those minutes, n8n's own internal state, or a
condition that needs longer than ten cycles. The card stays open on the cause.

## What shipped instead: the detector the card asked for

`check-doors-registered.mjs`, and it costs nothing.

```
   ok   form    http://localhost:5678/form/prdgenie-ingest-form   WF1-ingest:Door: Form
   ok   webhook http://localhost:5678/webhook/ingest              WF1-ingest:Door: Webhook
   ok   webhook http://localhost:5678/webhook/generate            WF2-generate-prd:Entry
   ok   webhook http://localhost:5678/webhook/delta               WF3-delta:Entry
   ok   webhook http://localhost:5678/webhook/judge-sweep         WF6-judge-sweep:On demand

PASS  5 of 5 declared doors are registered (1 form, 4 webhook).
```

A GET is answered by n8n before any workflow starts, and the two 404s differ — `"not registered
for GET requests"` means the path is known, `"not registered"` means it is gone. The list is
derived from every `webhook` and `formTrigger` node in the exports, so **five** doors are checked
where the card asked about one, including the form door a person uses — the door BUG-043 found
shut for two days.

Three places now ask it:

- **`preflight.mjs`**, before every bare `.\run.cmd`. It used to **POST an empty body** at the
  ingest door, which reaches WF1 and starts an execution: a preflight with a side effect, on
  every invocation. It is a GET now, and it covers all five doors instead of one.
- **`check-all.mjs`**, which now **skips every check that dials a door** when a declared door is
  not registered — with the reason printed. The incident produced two red rows with a true
  message and a misleading cause, and that is the sweep reporting a symptom as a defect.
- **the sweep itself**, as a standing check with a control behind it (8/8).

### The sweep, proven against a real dead door

Run with the n8n origin pointed at a port nothing listens on:

```
FAIL  n8n\scripts\check-doors-registered.mjs        n8n did not answer at :5699 — unreachable
SKIP  n8n\scripts\negative-control-doors-registered.mjs   the doors are shut
SKIP  review-ui\scripts\verify-doors.mjs                  the doors are shut
SKIP  review-ui\scripts\verify-routing.mjs                the doors are shut
```

**`verify-doors` and `verify-routing` are exactly the two that went red in the incident.** One
check fails and names the cause; everything that merely depends on a door is skipped with a
reason. Which checks need one is derived from what they do — a script that fetches a `/webhook/`
path dials a door — with the door checker exempt by name, because it is the one whose job is to
say the doors are shut.

## THIS CARD STAYS OPEN, and the card said it would

> *"Restart the review service ten times and see whether the webhook survives. If it does, this
> stays open with the evidence attached."*

It did. All three deliverables shipped — the reproduction attempt, the free detector, the sweep's
refusal to blame a door check for a shut door — and **the cause is still unknown**. What remains
is one question, narrower than when the card was filed:

**What de-registered a webhook in a container that had been up for four hours, with the workflow
still reported active and nothing deployed?**

The next occurrence is now cheap to see: `.\run.cmd` says so before any command, and the sweep
says so instead of blaming two verifiers. Reopen this with whatever that shows.

**Severity now: minor.** It was major because a silent door is a silent product; it is no longer
silent. What is left is an explanation, not an exposure.
