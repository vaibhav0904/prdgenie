# ADR 0009 — Depend on nothing that has to be compiled, and preferably on nothing at all

**Status:** accepted · **Date:** 2026-09-01

## Context

Discovered while setting up E1-S1: **Node was not installed on this machine at all**, and
the only running n8n belonged to a different project (see ADR 0010, which gives PRD Genie
its own). Two facts follow. The stranger's machine is unlikely to be better provisioned than
the author's, and `docs/assumptions.md` already names the two-process local setup as the
most likely way a first run fails.

The original stack line said Express plus `better-sqlite3`. `better-sqlite3` is a native
module: on a machine without prebuilt binaries for the installed Node version it needs
node-gyp and Visual Studio Build Tools, which is a multi-gigabyte download standing
between a stranger and minute five of a twenty-minute review. Node 24 ships a built-in
`node:sqlite`, which removes that risk entirely.

Alternatives:

- **`better-sqlite3` + Express** — the conventional choice, and better documented; more
  people can read it without looking anything up. Disqualified on the native-compilation
  risk alone: the failure is environmental, silent until it happens, and lands on the one
  person whose time we cannot recover.
- **`node:sqlite` + Express** — keeps the familiar routing, drops the compiled dependency.
  Rejected only because once the compiled dependency is gone, the remaining argument for
  any dependency is convenience, and `npm install` can still fail on a locked-down network.
- **Docker for the review service too** — genuinely tempting, since Docker is already
  present and it would put the service on n8n's network. Disqualified because it puts the
  SQLite file inside a container, which fights ADR 0002's whole inspectability argument,
  and because it adds a build step to every code change.

## Decision

The review service and the eval harness have **zero runtime npm dependencies**. Storage is
`node:sqlite`; HTTP is `node:http` with a small explicit router; configuration is loaded
with Node's own `--env-file=.env`. `package.json` exists for scripts, not for packages.

Minimum Node is **22** (`node:sqlite` and `--env-file`); developed on 24.19.0 LTS.

## Consequences

- `npm install` cannot fail, because there is nothing to install. For a project whose
  run-it-yourself README is the first thing anyone reads, this removes the single most likely first-run
  failure after the Docker networking trap.
- No supply chain, no lockfile drift, no transitive-dependency audit — on a project that
  ingests untrusted text, a smaller dependency surface is a security property, not just
  tidiness.
- **Accepted cost:** roughly sixty lines of routing and static-file serving that Express
  would have provided. Written once, in one file, and it is code a reviewer can read
  end to end — which is worth something on a project whose claim is that everything is
  checkable.
- **Accepted cost:** `node:sqlite` is newer and less documented than `better-sqlite3`, and
  its API may still shift. The surface used is small and synchronous and would port back
  in an afternoon.
- **Accepted cost:** Node 22+ is a hard floor. Stated in the run-it-yourself README rather than
  discovered.
- Forces the E1-S1 spike's finding to be usable: the gate mechanism was verified on
  `node:sqlite` specifically, not on a driver we then swapped out.
