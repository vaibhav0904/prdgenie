# ADR 0004 — Keep judgment in n8n and determinism behind HTTP endpoints

**Status:** accepted · **Date:** 2026-09-01

## Context

The orchestration layer is meant to carry real weight here — flow correctness, node and
routing clarity, error handling, modularity — rather than be a thin shim in front of a
script. That is a real constraint and it pulls toward putting everything in n8n. Pulling the other way: anything living only inside an
n8n Code node cannot be unit-tested, cannot be diffed usefully in review, and cannot be
called by the eval harness — so the arithmetic that the whole "the model never writes a
number" claim rests on would be untestable.

Alternatives:

- **Everything in n8n Code nodes** — disqualified: the RICE recomputation check (C3) would
  have to reimplement the scoring logic to test it, which tests a copy, not the code.
- **Everything in code, n8n as a thin webhook wrapper** — disqualified against the point of building it
  this way. It is the better engineering answer for a production
  system and that is worth conceding openly; here the workflow *is* part of the product.
- **A shared JS file imported by both** — disqualified: n8n Code nodes cannot import
  project files without mounting and a restart, which makes the shared file a deployment
  problem instead of a boundary.

## Decision

n8n owns **orchestration and judgment**: the doors, routing, retries, error paths, and
every model call. The review service owns **everything deterministic**, exposed as
`/internal/grounding-check`, `/internal/score`, `/internal/validate` and the storage
endpoints. n8n calls them over HTTP with the shared `INTERNAL_API_KEY`.

The test for which side a piece of logic belongs on: *would the eval harness need to
reimplement it to check it?* If yes, it is an endpoint.

## Consequences

- The eval harness exercises **the same code the workflow runs**, so C3's recomputation
  is a real check rather than a parallel implementation agreeing with itself.
- The workflow stays legible: a node called "Score (deterministic)" pointing at an
  endpoint reads better in review than forty lines of JavaScript in a Code node.
- **Accepted cost:** a network hop for arithmetic. At demo scale this is microseconds and
  buys testability.
- **Accepted cost:** the service must be running for the workflow to complete. Failure is
  loud and correct — WF4 dead-letters with `service_unreachable` rather than skipping the
  check — but it is one more thing a stranger must start, which the README must front-load.
- Forces the `/internal/*` surface to be a designed API with its own contract, not a
  grab-bag. New deterministic logic gets an endpoint and a test, or it does not exist.
