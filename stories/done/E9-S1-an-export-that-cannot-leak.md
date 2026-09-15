# E9-S1: An export that cannot leak

**As** the person publishing this
**I want** the workflow export to fail loudly rather than ship a credential
**So that** the one irreversible mistake in this release is impossible rather than unlikely

## Acceptance criteria

- [ ] `npm run export:n8n` pulls the workflows via the n8n API and writes them to
      `n8n/workflows/`.
- [ ] It **strips credential ids and pinned data**, then greps the result for `sk-`, `AIza`,
      and **every value in `.env`**.
- [ ] **Non-zero exit on any hit.** A warning is not a gate.
- [ ] **NEGATIVE CONTROL: plant a fake key** in a workflow and confirm the check goes red and
      names the file and the line; then confirm it goes green again. Both directions — an
      export check that has never rejected anything has not been tested.
- [ ] The committed exports are byte-identical to what a fresh import produces, so the repo
      stays the source of truth for the workflows (ADR 0010).
- [ ] **Run it twice** (BUG-021).

## Depends on
- None.

## Eval gate
- None. A deterministic check with its own control.

## Technical notes

- *Simplified by ADR 0010*: the export reads `prdgenie-n8n`, which contains only our work,
  so "filter our workflows out of another project's" is no longer a step that can be
  forgotten.
- **A leaked key in a published JSON file is not recoverable by apologising.** This is the
  one story in the project where the check matters more than the feature.

---

## Closed 2026-09-05

`export-workflows.mjs` pulls every workflow through the n8n CLI in the container (no
`N8N_API_KEY`, so one fewer secret exists), normalises it, and **runs the gate on the bytes it is
about to write** — a hit means nothing is written at all. A tool that reports a problem after
writing the file has prevented nothing.

`check-export-hygiene.mjs` is the standing gate and runs every sweep. Two halves:

- **7 key shapes** — `sk-`, `AIza`, `ghp_`, `xox`, a JWT, a PEM block, a literal auth header.
- **Every value in `.env`** — the expensive half, and the one that protects *this* repository:
  a secret nobody has a regex for is still in `.env`. Trivial values are excluded **with the
  reason printed** (`3000` appears in every URL in the file; matching it would make this a check
  people disable).

Plus `pinData`, which is the leak nobody looks for: pinning a node in the n8n editor embeds
**that run's data** — real document text — inside a file that reads as configuration. Zero found.

### What the first run found

The gate went red immediately on the committed exports: **20 credential references**, carrying
instance ids and account names. No keys — the keys were always only in n8n's encrypted store
(ADR 0004) — but `Xk7QpL2mNb9RtVwZ` is a handle into one person's n8n, and a name is an account
label a release has no reason to carry.

**"Strip every credential reference" would have broken the product.** n8n binds a node to a
credential through that block, and `provision-internal-credential.mjs` deliberately uses a
*fixed* id (`prdgenieInternalKey`) so a stranger's import binds. Removing it protects a string
this repository publishes on purpose and breaks the run-it-yourself flow.

So the rule is **normalise, not delete**, and the allow-list is **derived**: scraped from the
provisioning scripts' own `CRED_ID` and `CRED_TYPES`, so a provider added tomorrow is handled
tomorrow with nobody editing the checker.

### And the second thing it found

`bind-provider-credential.mjs` wrote the local id **into the committed WF0** — so the check would
have gone red on any machine that had ever been set up, and *a check that fails once the product
works is a check people turn off*. It now writes `n8n/workflows.local/` (gitignored, per-machine)
and `import-workflows.mjs` prefers it, reporting which file n8n actually got.

**Proven end to end, not asserted:** placeholder committed → import used the override → n8n
restarted → all 5 doors registered → `verify-pm-document` 6/6 with live provider calls.

### Both directions

```
negative-control-export-hygiene   10/10
  NC2  an OpenAI-shaped key                 -> red, file and line named
  NC3  a Google-shaped key                  -> red (a different vendor prefix)
  NC4  A VALUE FROM .env OF NO SHAPE AT ALL -> red   <- the case that matters
  NC5  pinData                              -> red
  NC6  an instance-generated credential id  -> red
  NC7  CONTROL: the project's own fixed id is SHIPPED, not flagged
  NC8  .env absent -> red, in a DIFFERENT sentence from a hit
  NC9  an empty export directory -> red
```

**Not done, and said rather than skipped:** the "byte-identical round trip" criterion. Running the
real export reformats the hand-maintained JSON (n8n's serialiser, not ours), which would bury
every future one-field diff in a whole-file reflow. ADR 0010 already makes the **repo** the source
of truth and import the direction of travel, so the export ships as a **verification tool**, dry
run proven, and the round-trip criterion is withdrawn rather than quietly marked done.
