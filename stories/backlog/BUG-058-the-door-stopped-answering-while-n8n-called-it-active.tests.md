# Test cases: BUG-058 — the door stopped answering while n8n called it active

```
.\run.cmd                                                    preflight: every door, for free
.\run.cmd n8n\scripts\check-doors-registered.mjs             the same question as a standing check
.\run.cmd n8n\scripts\negative-control-doors-registered.mjs  and it can still go red
.\run.cmd check-all.mjs                                      and the sweep refuses to lie about a dead door
```

**This card does not close green, and that is the result.** Its first requirement is *a
reproduction, or an honest "not reproduced"* — and the reproduction came back empty. What must
not happen is a plausible story standing in for a cause, and none is offered.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **The reproduction is attempted and its result recorded either way** | stated | **Pass — NOT REPRODUCED** | ten review-service restarts, every door probed between each: `ingest / generate / delta` **registered every time**, 11 probes of 3 doors |
| TC2 | **The cause is not guessed.** The card stays open with the evidence attached | no story | **Pass** | *"Saying 'probably the service restart' was already the wrong answer before this ran; it is now the wrong answer with evidence against it."* The card names what ten restarts do **not** rule out |
| TC3 | **A GET distinguishes registered from unregistered**, and starts nothing | two bodies | **Pass** | `"not registered for GET requests"` vs `"not registered"`; the form door is 200 vs 404 |
| TC4 | **The preflight probe stops POSTing** | GET only | **Pass** | it used to POST an empty body at the ingest door on **every bare `.\run.cmd`** — reaching WF1 and starting an execution. A preflight with a side effect |
| TC5 | **All the doors are probed, not just `ingest`** | all | **Pass** | **five**, not the three the card assumed: `ingest`, `generate`, `delta`, `judge-sweep`, and the **form** door a person uses |
| TC6 | **The door list is derived from the shipped workflows** | derived | **Pass** | every `webhook` and `formTrigger` node in every export. NC5 removes WF1's two and the listing loses exactly those |
| TC7 | **A standing check asks it every sweep** | in `check-all` | **Pass** | `check-doors-registered.mjs`, picked up by the `check-` prefix without editing the runner |
| TC8 | **The sweep does not run door checks against a dead door** | skipped, named | **Pass** | proven by running the whole sweep against an unreachable n8n origin — see below |
| TC9 | **CONTROL: an unregistered door is caught**, and named | red, names it | **Pass** | NC2 (webhook) and NC3 (form) — two different probes, so a checker that knew only one shape would pass one and fail the other |
| TC10 | **CONTROL: a registered door is NOT reported missing** | green | **Pass** | NC4: `5 door(s) reported ok, 0 GONE`. NC1 alone would pass on a check that printed GONE for everything and still exited 0 |
| TC11 | **Run twice, same answer** (BUG-021) | 2 of 2 | **Pass** | check and control both run twice, identical |
| TC12 | **Every standing check green**, open cards named (BUG-038) | `check-all` | **Pass, two named** | **65 of 67 in 269s** — BUG-046, and BUG-059 |

Two rows the plan did not have:

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC13 | **CONTROL: zero doors FAILS** — an empty list must never read as a clean bill of health (BUG-003/019) | red | **Pass** | NC5b: `no doors found in the workflow exports — the extractor is broken, not the doors` |
| TC14 | **CONTROL: "n8n unreachable" and "door not registered" are different messages** — they have different fixes | distinct | **Pass** | NC6: `n8n did not answer at http://localhost:5699`, and no "NOT registered" line |

## TC8, proven against a real dead door

The sweep was run with the n8n origin pointed at a port nothing listens on:

```
FAIL  n8n\scripts\check-doors-registered.mjs        n8n did not answer at :5699 — unreachable
SKIP  n8n\scripts\negative-control-doors-registered.mjs   the doors are shut
SKIP  review-ui\scripts\verify-doors.mjs                  the doors are shut
SKIP  review-ui\scripts\verify-routing.mjs                the doors are shut
```

**`verify-doors` and `verify-routing` are exactly the two checks that went red in the incident.**
One check now fails and names the cause; everything that merely depends on a door is skipped with
a reason. A skip is not a pass, and the sweep prints it as such.

Which checks need a live door is **derived from what they do** — a script that fetches a
`/webhook/` path dials one — with `check-doors-registered` exempt by name, because it is the
script whose whole job is to say the doors are shut.

## The thing that must not happen

**"Probably the service restart."** Between the last green run and the red one, two `/internal/`
routes gained a guard and the review service restarted twice, and **none of that touches n8n**.
Ten restarts changed nothing. This project has been bitten three times by a plausible story about
the wrong thing (BUG-054 most recently), and the card now carries the negative result instead.

The second is a detector that costs what the thing it replaces costs. `verify-doors` already
finds this, at the price of a document through the real door. The new one is a GET: nothing runs,
nothing is stored, and it is cheap enough to sit in front of every command.

## Not tested here, and named

- **Why n8n de-registered a webhook.** Unknown, and the card stays open on it. A detector makes
  the next occurrence cheap to see; it does not explain the last one.
- **Whether ten restarts is enough.** It is what the card asked for. A condition that needs
  longer, or something else in those minutes, is not excluded — said on the card rather than
  implied by a green row here.
- **Whether n8n's `list:workflow --active=true` can be trusted.** It said *active* while the door
  was shut. Recorded as a fact about the incident; not fixable from outside n8n.
- **That a door WORKS.** This check says a path is registered. `verify-doors` says a document
  goes through it, and still costs what it costs.
