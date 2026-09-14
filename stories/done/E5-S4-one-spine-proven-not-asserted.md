# E5-S4: One spine, proven rather than asserted

**As a** builder
**I want** the "nothing downstream knows which door it came through" claim checked by a command
**So that** an architectural intention becomes a fact that stays true after I stop watching

## Acceptance criteria

- [ ] **C1 extended to T1, N1, E1 and F1**, with the threshold applied **per document type**
      and reported per type. No average across types — an average hides a type that fails
      badly (decided 2026-09-01: one threshold, reported separately).
- [ ] A committed check — `.\run.cmd n8n/scripts/check-spine.mjs` —
      greps the WF2/WF3 workflow exports and the `/internal/*` handlers for `doc_type`,
      `source_channel` and `authorship`, and **fails on a hit outside the door**.
- [ ] The check reports **what it examined**, not just what it found: files scanned vs files
      that exist, failing on a gap (BUG-003).
- [ ] **Negative control run once**: add a `doc_type` reference to WF2, confirm the check
      goes red naming the file and line, remove it.
- [ ] The Outcome states, as a walkthrough, exactly which files a hypothetical fifth
      `doc_type` would touch — it cannot be tested without building one, so it is argued in
      writing rather than claimed.

## Depends on
- E5-S3

## Eval gate
- **C1** — this story is where it stops being a transcript-only measurement. It must leave
  C1 passing per type, or leave a written description of which type it does not handle.

## Technical notes

- **Two halves of one claim, and neither is sufficient alone.** The grep is structural: it
  proves no code reads the door. C1 across types is behavioural: it proves the doors
  actually produce equivalent documents. E2-S1 found the case that only the behavioural half
  catches — both adapters were structurally identical and stored different bytes (BUG-006).
- `authorship` is included in the grep list from the start (E4-S6). It is a recorded fact for
  the UI and metrics, and the moment anything downstream routes on it, this project has a
  second spine and no eval coverage for it.
- **Expect the per-type report to be uneven, and say so rather than smoothing it.** A feature
  brief is prose written to be understood; a transcript is people interrupting each other.
  If briefs score better, the honest deck line is "it reads briefs better than it reads
  arguments", not a per-type threshold invented after seeing the results.
- If C1 fails for one type, PRD-E2's rule governs by analogy: at most three prompt
  iterations, then a BUG card naming the failure pattern.

---

## DONE — 2026-09-03. The claim is a command now

`.\\run.cmd n8n/scripts/check-spine.mjs` greps every spine file for `doc_type`,
`source_channel` and `authorship`, and **fails on a hit outside the door**.

**C1 is extended to four document types and reports per type, never averaged:**

- **transcript** — T1 86.7%/100.0% · T3 100.0%/100.0%
- **notes** — N1 100.0%/100.0%
- **email** — E1 100.0%/100.0%
- **feature_brief** — F1 85.7%/75.0%

Four fixtures at 0.95, 0.95, 0.95 and 0.35 average to 0.80 and read as "meets the floor"
while one whole door is broken. That is why the report lists and never averages.

### What the check found on its first run, which is the point of writing it

**Seven references, and one of them was mine from the day before.** `assemble.mjs` reads
`doc.authorship` to stamp `pm_authored` onto a requirement — written for E4-S6, whose own
criterion says *"nothing downstream of WF1 branches on `authorship`"*.

So the check forced the distinction into the open, and it is now written into the file:

- **branching** on one of these fields, so the pipeline behaves differently by door —
  forbidden, everywhere, no exceptions;
- **carrying** one forward as a recorded fact — a query returning it to the screen, a flag
  stamped on a row — which is what the fields are for.

A grep cannot tell those apart, so a line may carry `// spine-ok: <reason>` **and the reason
is required** — an exemption with none is refused, exactly like a review decision with none.
All five exemptions are printed on every run, so they are read rather than accumulated. An
allow-list that grows a file at a time and is never looked at again is how this claim would
have quietly stopped being true.

**Negative control:** a `doc_type` reference injected into WF2 turns the check red naming
the file and line; removed, it goes green; WF2 restored byte-for-byte.

### The fifth document type, argued in writing

The check cannot prove a fifth type is a one-file change — that needs a fifth type. So, as
the story asks, the walkthrough: adding `slack_thread` touches

1. `normalize.mjs` — the `doc_type` whitelist, and a title/date derivation branch beside the
   email one;
2. `schema.sql` — the `CHECK` constraint on `source_documents.doc_type`;
3. WF1's form dropdown — one option.

And nothing else. Not WF2, not the prompts, not grounding, not assembly, not C1 — which
reads the type from the stored document purely to group its report. **The check is what
keeps that list from growing behind our backs.**
