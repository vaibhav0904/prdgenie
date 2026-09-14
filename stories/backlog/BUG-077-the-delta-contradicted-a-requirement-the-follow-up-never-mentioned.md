# BUG-077: The delta contradicted a requirement the follow-up never mentioned

**Severity:** major · a `contradicted` row is the delta's strongest claim, and this one was
about a topic absent from the meeting
**Found:** 2026-09-10, filming demo 3 for the generated video — the second of two delta runs
performed that morning
**Area:** WF3 delta · `n8n/prompts/` (the delta prompt) · C5, the case that is named and not
built (`evals/README.md`)

## What happened

T2 (the ForgeSight checkpoint) was sent against approved v1232 of PRD-forgesight, through the
form, exactly as the demo does. The result, v3100, carried:

```
modified      3100-REQ-001   render time → two seconds standard, four on Northwind's largest
contradicted  3100-REQ-002   "Single sign-on (SSO) must not be implemented during the pilot…"  → (empty)
modified      3100-REQ-008   the pilot runs only on Northwind and Meridian…
added         3100-REQ-009   a comment pinned to a specific chart…
```

**T2 does not contain the string "SSO" or "sign-on" anywhere.** The two `modified` rows and
the `added` row are right; each has a sentence in T2 that says so. The `contradicted` row has
nothing on the other side — its `new_text` is empty — because there is nothing in the meeting
to put there.

The run before it (v3097, against v1362, same T2) produced 2 modified + 2 added and no
contradiction at all — including none for the warehouse requirement, which v1362 *did* carry
and which T2 *does* stand up ("no second database, no new pipeline… we are standing up a
separate aggregation store"). So across two runs the delta missed the real contradiction once
and invented one once.

## Why nothing caught it

C5 is the case that would. It is named in the eval README as unbuilt, and slide 5 of the deck
says so out loud. The delta view renders exactly what the model returned, which is the correct
behaviour for the view: the page is not the place to second-guess the changelog. The place is
a case with labels.

## What a fix looks like

Not a prompt tweak the night before a release (BUG-068's rule). C5 with labels for T1→T2:
one expected `contradicted` (warehouse), the expected `modified` rows, and **zero contradictions
on requirements the follow-up does not mention** — the second half is the one that would have
gone red here. The rows above are the first two labelled observations.

## Still open

Yes. The video was filmed on a baseline that carries the warehouse requirement so that what is
narrated is what is on screen; that is a choice of take, not a fix. Tally for the day, all T2
against PRD-forgesight: v1362 (carries the requirement) — missed it; v1232 (does not) — invented
an SSO contradiction; v1188 — right; v1178 — right. Two of three baselines that carry the
requirement produced the row; the one that does not produced a row about something else.
