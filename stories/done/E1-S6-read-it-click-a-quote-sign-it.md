# E1-S6: Read the draft, click a quote, sign it

**As a** PM
**I want** to read the generated PRD, click any requirement and see the exact sentence it came from, and then approve it
**So that** checking the system costs me a click instead of a re-read — and my approval is the only thing that publishes it

## Acceptance criteria

- [ ] An inbox lists PRDVersions in `in_review`, and opening one shows its requirements
      with kind, stakeholder and confidence.
- [ ] Every requirement shows its citation as a chip. Clicking a chip scrolls the source
      pane to that span and highlights it — using the offsets the grounding check rewrote,
      never the model's originals.
- [ ] Ungrounded requirements carry a visible amber badge reading that they could not be
      verified against the source.
- [ ] Sign-off calls `POST /api/prd-versions/:id/sign-off`, which is the **only** code path
      to `approved`, and the version's state changes to `approved`.
- [ ] Immediately after a successful sign-off, a hand-run
      `UPDATE prd_versions SET state='approved'` on a different version in `sqlite3`
      **still fails** — the marker did not leak.
- [ ] Source text is rendered as text, never as markup. A fixture containing `<script>` or
      HTML displays it literally.

## Depends on
- E1-S5

## Eval gate
- none — the gate's behaviour is a deterministic property verified by criteria 4–5 and by
  the UAT (`evals/README.md`, "NONE — chosen").

## Technical notes

- **This is the largest story in E1** (PRD-E1, decided 2026-09-01: build the source pane,
  not a tooltip). If it does not fit one sitting, split it into "read the version" and
  "citations and the source pane" — **do not drop the pane**. The plumbing gets built once,
  and the click-to-highlight is the most persuasive fifteen seconds of the demo video.
- Criterion 5 re-proves E1-S1's spike *after* the endpoint is real. The connection-reuse
  failure mode has no visible symptom, so it gets checked twice on purpose.
- Approve-only in this epic. Per-item reject and edit-with-reason are E4 — the daily
  friction fix deserves building properly rather than being half-added here.
- Source documents are attacker-controlled text (H1 exists). Escaping is mandatory, not a
  nicety; criterion 6 is a real security check, not tidiness.
- The sign-off endpoint recomputes readiness server-side. In E1 that is trivially true
  (nothing to decide yet); the **recomputation must still be there**, because E4 tightens
  it and a missing recomputation would be discovered as an open gate rather than as a gap.
- No authentication (`docs/assumptions.md`, biggest gap). Every ReviewAction is attributed
  to one hardcoded reviewer. Do not simulate identity — an unattributed signature that
  looks attributed is worse than an obviously missing one.

## Outcome (2026-09-01)

**Verified by running.** 14 test rows Pass, including `verify-signoff` 9/9 against the
live service. A transcript now becomes a reviewable PRD in a browser, every requirement
carries a clickable citation, and signing it is the only way it reaches `approved`.

**The two rows that matter both concern things that are hard to see.**

*TC4* is evidenced by a round trip rather than a screenshot: slicing the stored `raw_text`
with the stored offsets reproduces the quote character for character. That works only
because the grounding check rewrote the model's offsets (ADR 0003) — the model's originals
would have highlighted the wrong sentence while looking perfectly convincing.

*TC7 and TC8* re-prove E1-S1's gate against the endpoint that ships. Immediately after a
real sign-off succeeded through the UI, a hand-run `UPDATE … SET state='approved'` was
still refused, and the marker had not leaked to a second version. Proving that against a
test harness was never the same as proving it here, which is why the card asked for it
twice.

**What was surprising.** TC13 failed on its first run — and failed *correctly*. It looked
for a parked version to try signing off, found none, and reported "no parked version
available to test" instead of passing over an empty set. There was none because BUG-004
means even the garbage fixture produces requirements. The row now seeds its own subject.
That is BUG-003's lesson working on its own: a check that cannot find its subject must say
so, not go green.

**What this card cannot claim.** Approve-only — no reject, no edit-with-reason — so a PM
who disagrees with one line of thirty can only decline to sign. That is the exact daily
friction the churn test in `docs/roadmap.md` names as a week-three quitting reason, and it
is E4's job. No authentication: every sign-off is `local-operator`, hardcoded. The PRD is a
flat requirement list until E3. And the highlight proves *where text came from*, never that
the requirement should exist — BUG-004 stands.
