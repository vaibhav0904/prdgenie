# BUG-051: Two internal endpoints serve without checking the key

**Severity:** **major** — one of them writes a file, and neither asks who is calling
**Found:** 2026-09-04, the first run of `check-internal-endpoints.mjs` (E6-S2)
**Area:** `review-ui/server.js` · `GET /internal/weekly-figures` · `POST /internal/weekly-report`

## What happens

Thirteen of the fifteen `/internal/` routes the workflows dial begin the same way:

```js
if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });
```

These two do not. Anything that can reach `localhost:3000` can read the week's figures and,
worse, **make the service write a weekly report** — with `commentary` it supplies:

```
POST /internal/weekly-report   {"week": "...", "commentary": "..."}
→ 200, reports/weekly-<week>.md written
```

The commentary is vetted (WF5 refuses a narrative carrying a figure, E8-S2), so this is not a
route to a fabricated number. It is a route to **an unauthenticated write to the filesystem**,
by a caller nobody identified, into a directory a human reads and quotes.

## How it was found, which is the more useful half

`check-internal-endpoints.mjs` was written after E6-S2's first real follow-up document died on
a 404: the review service process was older than the route WF3 called, and every check stayed
green because every check imports the module rather than knocking on the door.

Its first version POSTed `{}` to every path it found. Thirteen answered 401 and did nothing.
The fourteenth **wrote `reports/weekly-2026-08-31.md`** — the check performed the exact action
it existed to warn about. The file was restored from git; the lesson was not.

The check now reads the guard out of `server.js` and refuses to knock on any route that does
not consult `internalAuthorized`. That is why these two show as `OPEN  ---` with no status:
they are named, not probed.

## The fix

1. Add the guard to both, exactly as the other thirteen have it.
2. Confirm WF5's two nodes already send the credential — they carry
   `PRDGenie Internal Service Key` — so the fix is one line each and no workflow change. **Verify
   that from the shipped workflow, not from this sentence.**
3. Derive the rule rather than fixing two instances: `check-internal-endpoints.mjs` already
   asserts it for every route a workflow calls. Extend it to every `/internal/` route
   **declared** in `server.js`, called or not — an endpoint nothing calls yet is the one that
   gets wired without anybody re-reading it.
4. Delete the `CARDED` exemption in that check. It names this card; it should not outlive it.

## Not tested, and it should be

Whether anything has ever called these without the key. The service does not log unauthenticated
requests, so the honest answer today is **unknown**, and the fix should not pretend otherwise.

## Outcome — 2026-09-04

**Both endpoints refuse without the key**, and `weekly-report` refuses **before** `readJson` —
so the write that made this a major card cannot happen for an unauthenticated caller. With the
key: 200. With a wrong key: 401. `verify-weekly` 44/44, so the report path is untouched.

### Both halves of the handshake, not one

The card said to *confirm WF5's two nodes already send the credential, and verify that from the
shipped workflow rather than from this sentence*. They do — and the check now asserts it for
**every** node that dials **every** guarded route. Guarding a route whose caller sends nothing
turns a working workflow into a 401 at the next deploy rather than the next edit, and that is a
worse outcome than the hole this card closed.

### The check widened, and immediately failed its own control

**17 of 17 routes**, up from 15: `/internal/score` and `/internal/validate` are declared and
called by nothing, which is exactly the kind that gets wired next month without being re-read.

Then TC7 planted an unguarded route with no caller, and **the check called it fine.** It
computed a handler's extent as *from this route to the next internal route*, so a route sitting
beside `/api/` handlers borrowed a neighbour's `internalAuthorized`. The extent now ends at the
next route declaration of any kind.

**A guard check with a false negative is worse than no guard check** — it is a false negative
that reads as an audit. `negative-control-internal-endpoints` is 4/4 and keeps all three shapes.

### The exemption is gone

`CARDED` is deleted from `check-internal-endpoints.mjs`. An exemption that outlives its card is
an allow-list.

### Two things found on the way, both carded rather than folded in

**BUG-058 (major)** — the PM's webhook door stopped answering while n8n reported the workflow
active, in a container up four hours with nothing deployed. A restart fixed it. The card records
what is *not* established: nothing that ran in between touches n8n, and naming a cause without
one would be the mistake this session has already made three times.

**BUG-059** — `negative-control-strata` NC1 and NC6 are the same command, and it passes at the
top of the control and fails at the bottom, six invocations later. `verify-strata` **opens real
judge sweeps**; six of them leave state its later selves meet. A check tripping over itself,
inside the control written to prove it works.
