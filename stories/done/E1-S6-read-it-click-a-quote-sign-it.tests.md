# Test cases: E1-S6 Read the draft, click a quote, sign it

Written before any build work, per gate G3.
Server-side: `.\run.cmd review-ui/scripts/verify-signoff.mjs` (service must be running).

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| TC1 | The inbox lists versions in `in_review` | PRD, version, requirement count and grounding per row | **Pass** | `GET /api/prd-versions` returns id, prd_id, version_no, state, requirements, grounded; the picker renders one option per version |
| TC2 | Opening a version shows requirements with kind, stakeholder, confidence | Rendered from stored rows | **Pass** | `GET /api/prd-versions/1` → `state=in_review`, 13 requirements each with kind/stakeholder/confidence/citations |
| TC3 | Every requirement shows its citation as a chip | One chip per citation, showing the quote | **Pass** | Chips built per `citations[]`; an unresolvable citation renders disabled and struck through rather than clickable |
| TC4 | **Clicking a chip highlights the exact span, using rewritten offsets** | The pane marks the right text | **Pass** | Round-trip proof: `raw_text.substring(start_char, end_char)` **equals the stored quote exactly** — `"The first chart on a dashboard must render in under two seconds on our largest customer account."` (match_kind `exact`, 715–811) |
| TC5 | Ungrounded requirements carry a visible amber badge | Badge states the citation is unverified | **Pass** | `.card.ungrounded` + `UNGROUNDED — verify manually` badge, driven by the stored `grounded` flag |
| TC6 | Sign-off transitions the version to `approved` | Endpoint succeeds, state changes | **Pass** | `verify-signoff` TC6/TC6b — HTTP 200, stored state `approved` |
| TC7 | **Sign-off is the only path to `approved`** | A hand-run `UPDATE` still fails afterwards | **Pass** | TC7 — refused, *after* a real sign-off had just succeeded |
| TC8 | **The marker does not leak after a real sign-off** | Version B untouched | **Pass** | TC8 — B still `in_review`. E1-S1's leak check, now re-proven against the shipping endpoint |
| TC9 | Sign-off refuses a version that is not `in_review` | Error, no state change | **Pass** | TC9 — `409 not_in_review` on re-signing; TC9b — `404` for a nonexistent version, not a throw |
| TC10 | The endpoint recomputes readiness server-side | Checks for itself | **Pass** | State and requirement checks run in the handler before `signOff()`; the disabled button is a courtesy only |
| TC11 | An `approved` event is written with the version's `trace_id` | Event present | **Pass** | TC11 — one `approved` event on the version's trace |
| TC12 | **Source text is rendered as text, never markup** | `<script>` displays literally | **Pass** | Ingested `<script>alert('xss')</script>` and `<img src=x onerror=...>`: stored verbatim, served as `application/json`, and the SPA builds every node with `textContent`/`createTextNode` — **0 `innerHTML` assignments** |
| TC13 | **Negative control** — the sign-off check can fail | Illegal sign-off → red | **Pass** | TC13 — the test **seeds its own parked version** and confirms `409`. *First run failed honestly with "no parked version available to test" rather than passing vacuously* |
| TC14 | Coverage is asserted | Assertions run vs planned | **Pass** | TC14 — 8/8 |

## Notes

- **TC4's evidence is the round trip, not a screenshot.** Slicing the stored `raw_text` by
  the stored offsets reproduces the quote character for character, which is what makes the
  highlight trustworthy — and it works precisely because the grounding check rewrote the
  model's offsets (ADR 0003).
- **TC13 failed on its first run for the right reason.** No parked version existed to test
  against — because BUG-004 means even the garbage fixture yields requirements. It reported
  that rather than passing vacuously (the BUG-003 lesson), and now seeds its own subject.
- Approve-only, per PRD-E1's non-goals. Per-item reject and edit-with-reason are E4.
- No authentication: every sign-off is attributed to `local-operator`, hardcoded and
  visible in the schema. The UI does not simulate identity.
