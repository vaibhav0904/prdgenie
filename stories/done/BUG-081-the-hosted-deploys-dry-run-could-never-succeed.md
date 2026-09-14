# BUG-081: The hosted deploy's dry run could never succeed on a fresh instance

**Severity:** major · `--dry-run` is the first command SETUP.md's shape B tells you to type, and
it crashed with a stack trace on exactly the instance it exists for
**Found:** 2026-09-14, following SETUP.md from a fresh clone of the public repository against an
n8n reached only through its REST API — the first time the hosted path was walked on an instance
that did not already hold the workflows
**Area:** `n8n/scripts/deploy-hosted.mjs`

## What shipped

The public API refuses a supplied workflow id, so the deploy rewrites every committed id to the
one the instance hands out. In a dry run no instance ids exist yet, so the map was filled with a
placeholder:

```js
idMap[wf.id] = `<new id for ${wf.id}>`;
```

The rewrite then replaces `"prdgenieWF0llmcall"` with `"<new id for prdgenieWF0llmcall>"` — and
the safety check that follows asks whether the committed id is still present in the text. It is,
as a substring of the placeholder that replaced it. So:

```
Error: PRDGenie WF0 - LLM Call: still carries prdgenieWF0llmcall, prdgenieWF4error after rewriting
```

A dry run against an instance that already holds the workflows passes, because there every id
maps to itself and the check skips it. **That is the only case the earlier walk-through
exercised** (2026-09-10, against an instance seeded by the container CLI), which is why a command
that can never work shipped as the documented first step.

## Why nothing caught it

No check runs `deploy-hosted.mjs`; it is declared not-a-check in `check-all.mjs`, correctly, since
running it would deploy mid-sweep. Its only test was a person following the instructions, and the
one time that happened the precondition was wrong.

**The lesson is the one this project keeps relearning: a door never opened is not a door.** The
dry run had been "verified" against a state no first-time reader can have.

## Fixed

The placeholder is now opaque (`__NEW_ID_1__`) and cannot contain the id it stands in for.
Verified by running `--dry-run` against a genuinely empty instance: it prints the plan for all
seven workflows and exits 0.

While in there: the dry-run branch called `process.exit(0)` while fetch's keep-alive sockets were
still closing, so Windows printed a libuv assertion *after* a successful run — which reads as a
crash to the person who just followed the instructions. It ends by falling off the end of the
script instead.
