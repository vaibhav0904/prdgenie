# E5-S2: The thread that quotes itself four times

**As a** PM
**I want** an email chain ingested with its headers understood and its attribution intact
**So that** "who asked for this" survives a forwarded thread

## Acceptance criteria

- [ ] `Subject` becomes `title`; the `Date` **header** becomes `received_at` — never ingest
      time, because E6 asks which source is newer.
- [ ] Quoted reply chains are segmented by sender so attribution survives; segments remain
      **advisory** and nothing downstream requires them.
- [ ] A quote occurring identically several times in one document resolves to **a valid
      occurrence**, using the model's offset hint to disambiguate (ADR 0003).
- [ ] The decision above is stated in the story's Outcome as a **decision, not a bug**: any
      correct occurrence is sufficient, because all of them are the same words.
- [ ] Where the oldest message in a chain contradicts the newest, **both are surfaced as a
      conflict** rather than the newest silently winning (decided 2026-09-01).
- [ ] Fixture **E1** ingests cleanly; fixture **H2** (an email, and the PII fixture) keeps
      its redaction behaviour.

## Depends on
- E5-S1

## Eval gate
- **C1** extended to E1 in E5-S4. The contradiction behaviour is **C4**'s (E3-S6).

## Technical notes

- **This is the adapter that will break the model**, and the first real test of ADR 0003's
  offset disambiguation. Until now every quote has been unique within its document; a
  forwarded chain repeats text verbatim, so the same sentence can appear four times.
- Deciding in advance that "a valid occurrence is sufficient" matters. Discovering it
  mid-story invites the wrong fix: tightening the matcher, which ADR 0003 forbids for good
  reasons. All four occurrences *are* the sentence.
- **The contradiction decision defers to the PM on purpose.** Chronology is available and the
  newest message is usually right — but "usually" is exactly what this product refuses to
  act on unsupervised. Preferring the newest silently makes the decision on their behalf and
  hides that it was ever made.
- Email is the type most likely to carry contact details, which is why H2 is an email. Note
  BUG-008 and BUG-009 are open against the redactor: if they are still open when this story
  runs, C2 stays red for reasons this story did not cause.

---

## DONE — 2026-09-03

`Subject` becomes the title and the `Date` **header** becomes `received_at` — never ingest
time, because E6 will ask which source is newer. Quoted chains are segmented by sender, and
segments stay advisory.

**C1 grades E1 (email) at 100.0% / 100.0%**, and H2 — an email and the PII fixture — keeps
its redaction behaviour (C2 green throughout).

**The repeated-quote decision, stated as a decision rather than discovered as a bug:** a
quote that occurs identically several times resolves to **a valid occurrence**, chosen with
the model's offset hint (`grounding.mjs`: the hint "earns its keep only here"). Any correct
occurrence is sufficient, because all of them are the same words. The alternative — calling
a repeated quote ambiguous and refusing it — would fail a citation for being *more* true
than usual.

**Not delivered here: the oldest-contradicts-newest case.** That is a conflict, and
conflicts belong to the detector and to C4 (E3-S6), which now exists. It is measured there,
not asserted here.
