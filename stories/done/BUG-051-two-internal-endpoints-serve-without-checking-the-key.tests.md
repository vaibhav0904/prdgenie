# Test cases: BUG-051 — two internal endpoints serve without checking the key

```
.\run.cmd n8n\scripts\check-internal-endpoints.mjs   every declared route, guarded
.\run.cmd review-ui\scripts\verify-weekly.mjs        WF5 still works with the guard on
.\run.cmd check-all.mjs                              every standing check, one verdict
```

**Adding the guard is one line each.** The rows that matter are the ones proving the endpoints
still *serve* to the caller that is supposed to reach them — a 401 for everybody is not a fix,
it is an outage — and the one that stops the next unguarded route being written.

## The rows

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | **`GET /internal/weekly-figures` refuses without the key** | 401 | **Pass** | `GET /internal/weekly-figures` unauthenticated: **401** |
| TC2 | **`POST /internal/weekly-report` refuses without the key** — and refuses *before* writing anything | 401, no file | **Pass** | `POST /internal/weekly-report` unauthenticated: **401**, and `git status reports/` empty — the guard sits before `readJson` |
| TC3 | **CONTROL: both still serve WITH the key.** A guard that refuses everybody would pass TC1 and TC2 and silently stop the weekly report | 200 both | **Pass** | with the key **200** (`week=2026-08-31`, 6 fields); with a wrong key **401** |
| TC4 | **WF5 already sends the credential** — asserted from the shipped workflow, not from the card's say-so | 2 of 2 nodes | **Pass** | both WF5 nodes carry `httpHeaderAuth` — and the check now asserts **both halves of the handshake**, so a caller that loses its credential is caught here rather than at the next deploy |
| TC5 | **The report is unchanged**: same figures, same caveats, same vetting | `verify-weekly` green | **Pass** | `verify-weekly` 44/44 |
| TC6 | **The check widens from *called* routes to *declared* ones.** An endpoint nothing calls yet is the one that gets wired without anybody re-reading it | all declared | **Pass** | **17 of 17** routes, up from 15: `/internal/score` and `/internal/validate` are declared and called by nothing, and are now checked |
| TC7 | **CONTROL: an unguarded declared route is caught** even when no workflow dials it | fails, names it | **Pass** | `negative-control-internal-endpoints` 4/4 — and TC2 of it **failed first**, see below |
| TC8 | **The `CARDED` exemption is deleted.** An exemption that outlives its card is an allow-list | gone | **Pass** | the `CARDED` set is gone from the file |
| TC9 | **Run twice, same answer** (BUG-021) | 2 of 2 | **Pass** | check and control both run twice, identical |
| TC10 | **Every standing check green**, open cards named (BUG-038) | `check-all` | **Pass, two named** | **57 of 59 in 114s** — BUG-046, and BUG-059 (filed today) |

## The thing that must not happen

`POST /internal/weekly-report` **writes a file**. TC2 has to prove the refusal happens before
the write, not that the response was a 401 — the first version of `check-internal-endpoints`
learned this the hard way by probing the endpoint and writing a weekly report.

## Not tested here, and named

- **Whether anything ever called these without the key.** The service does not log
  unauthenticated requests, so the honest answer is *unknown* and the card says so. Adding that
  logging is a different piece of work.
- **The internal key's strength or rotation.** It is a shared secret in n8n's credential store;
  this card is about routes that never look at it.

## Outcome

*(written when the card closes)*

## The control failed first, and that is the point

TC7 planted an unguarded route with no caller. **The check said it was fine.**

It worked out each handler's extent as *"from this route to the next `/internal/` route"*. The
planted route sat immediately before `/api/health`, so its span ran on through several other
handlers until it met somebody else's `internalAuthorized` — and the route was pronounced
guarded.

**A guard check with a false negative is worse than no guard check: it is a false negative that
reads as an audit.** The extent now ends at the next route declaration of any kind, and the
control keeps all three shapes — a guard removed from a called route, an unguarded route with no
caller, and the span itself.

## What the sweep also found, and what was NOT concluded from it

Two checks went red in the first sweep after this fix:

```
verify-doors    TC1  envelope: {"code":404,"message":"The requested webhook \"POST ingest\"
                     is not registered."}
verify-routing  TC7  the routing decision is an event on the trace
```

The PM's door had stopped answering, while n8n reported WF1 **active** in a container **up four
hours with nothing deployed**. A restart fixed it; both are green again (8/8, 15/15).

**BUG-058** carries it, and carries what is *not* known: between the last green run and the red
one, two routes gained a guard and the review service restarted twice — **none of which touches
n8n**. Writing "probably the service restart" would be the plausible-story-about-the-wrong-thing
this project has now been bitten by three times. The card asks for a reproduction or an honest
"not reproduced", and for a cheap detector in `preflight.mjs` instead of a document through the
real door.
