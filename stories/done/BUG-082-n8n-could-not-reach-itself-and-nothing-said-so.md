# BUG-082: n8n could not reach itself, and nothing told the reader how to find that out

**Severity:** major · a correct setup, followed exactly, dies on the first document with an
opaque `500 Error in workflow`, and neither the deploy nor the troubleshooting table names the
cause
**Found:** 2026-09-14, following SETUP.md shape B end to end from a fresh clone
**Area:** `n8n/scripts/deploy-hosted.mjs` · `deliverables/SETUP.md`

## What happened

Everything green: seven workflows deployed, five doors probed and answering, the preflight
showing six of six. Then the first fixture through the ingest door:

```
door: 500 after 0.3s
{"message":"Error in workflow"}
```

WF1 does not only answer the door; it **calls its own sibling doors** to dispatch the generate
and delta roads. That call goes to `N8N_SELF_URL`, which defaults to `N8N_API_URL`. On n8n Cloud
that is right, because the public address loops back. Behind a Docker port mapping it is not: the
host's `:5680` is the container's `:5678`, so n8n dials a port that, from inside itself, is
nothing.

The system's own behaviour here was **correct and is worth saying**: the run stopped rather than
logging a success it did not have, and the error workflow wrote a dead letter naming the exact
node —

```
reason   service_unreachable
workflow PRDGenie WF1 - Ingest
node     Dispatch: WF2 generate
message  The service refused the connection - perhaps it is offline
```

The defect is that a reader has to already know that `/api/dead-letters` exists to see any of
that. The door said `Error in workflow` and the troubleshooting table's nearest row blamed
`SERVICE_BASE_URL` or a mismatched `INTERNAL_API_KEY`, which would have sent them the wrong way.

`N8N_SELF_URL` was documented — one sentence in B3, describing when to set it. Nothing connected
that sentence to the symptom, and the walk-through table at the bottom of SETUP.md recorded the
same failure happening on 2026-09-10 **without turning it into guidance.** A recorded incident
that does not become a troubleshooting row is a note to oneself.

## Fixed

1. `deploy-hosted.mjs` warns before deploying when `N8N_API_URL` is a localhost address and
   `N8N_SELF_URL` is unset — the exact shape that fails — and names the node that will die.
2. SETUP.md's troubleshooting table gains a row keyed on what the reader actually sees: the 500,
   the dead letter, and `Dispatch: WF2 generate`.

Verified: with `N8N_SELF_URL` set as the new row instructs, the same fixture ran WF1 → WF2 → WF0
and came back `needs_review` / `llm_unauthorized` — the provider refusing the dummy key, which is
the only step a real key changes.
