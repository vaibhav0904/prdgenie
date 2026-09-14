# E9-S2: A README someone else can follow

**As a** stranger with twenty minutes
**I want** setup instructions that work on my machine in the order they are written
**So that** the first thing I see is the product and not a stack trace

## Acceptance criteria

- [ ] `deliverables/RUN-IT-YOURSELF.md`: setup in order, the **Docker networking trap
      front-loaded**, the demo script, where the eval results live, and the biggest known gap
      repeated rather than buried.
- [ ] **Tested by following it verbatim** on a clean database and a fresh n8n import, in a
      shell where `node` is not on the PATH. **Transcribed, not written** (BUG-010).
- [ ] **The fixtures ship, prominently** (PRD decision 3) — with a line saying they contain no
      real data and that they are what makes every number reproducible.
- [ ] Every command in it is `.\run.cmd`, and step 0 is preflight.
- [ ] Followed **from a fresh clone of the remote**, not from the working copy (BUG-013/14/15).

## Depends on
- E9-S1

## Eval gate
- None.

## Technical notes

- Twice now every documented command has been unrunnable by the person it was written for
  (BUG-002, BUG-010). **A UAT is transcribed, not written**, and this README is the largest
  UAT in the project.
- The honest-limitations line is not a footnote. `docs/assumptions.md` orders the gaps
  biggest-first; the README repeats the first one.

---

## Closed 2026-09-05 — written and checked; the verbatim run is Vaibhav's, and deferred

`deliverables/RUN-IT-YOURSELF.md`. Twenty minutes, in order, every command `.\run.cmd`, step 0 is
the preflight.

**The trap is front-loaded**, above the setup steps: n8n is in Docker, so `SERVICE_BASE_URL` must
be `host.docker.internal` and not `localhost`, even though `localhost` is what you type in your
own browser. Get it wrong and nothing looks broken until the first extraction fails at a callback
with no obvious cause.

**The biggest known gap is the first section of the document**, not a footnote — no
authentication, no multi-tenancy, one hardcoded reviewer — repeated from `docs/assumptions.md`
because *a gap you only find by reading to the end of a file is a gap being hidden*.

**The fixtures ship prominently**, with the line that they contain no real data and are what
makes every figure on every slide reproducible on someone else's machine.

### Checked, by `check-readme-links.mjs` (7/7, every sweep)

| | |
|---|---|
| TC1 | every repo-relative path it names exists — 17 |
| TC2 | every `.\run.cmd` it gives points at a real script — 9 |
| TC3 | assumptions.md's biggest gap is repeated, and in the first fifth of the document |
| TC4 | no command starts with a bare `node` or `npm` (BUG-002/010) |
| TC5 | the Docker trap appears **before** the setup steps — 11% vs 17% |
| TC6 | the fixture count matches the directory, and "no real data" is stated |
| TC7 | **the check count quoted to a stranger is the count that runs** |

TC7 went red on its first execution: the README said 71 and adding this very checker made it 72.
A number quoted at a stranger that nothing recomputes is a number that was true once.

### What is NOT done, said rather than marked green

The acceptance criteria require the README to be **followed verbatim, from a fresh clone, on a
clean database, in a shell where `node` is not on the PATH** — and transcribed. **Vaibhav deferred
that on 2026-09-05**, explicitly.

So this story ships with its own gate open, and the checker says so in its closing line: *this
asserts the README points at real things; it does not assert the steps work.* A path that exists
is not a step that succeeds, and only a person on a clean machine settles the difference. The
remaining risk is carried on E9-S5.
