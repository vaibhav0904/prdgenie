# E4-S5: The review screen tells you what it is unsure of

**As a** PM
**I want** this version's own numbers and an honest caveat on the screen I approve from
**So that** I know how much of what I am signing was actually verified

## Acceptance criteria

- [ ] The screen shows, for this version: grounding rate with **counts beside it**, item
      counts by kind, and the override count.
- [ ] Every figure is **computed at render from the rows**, never a stored summary.
- [ ] A **caveat line is computed from state** — parked, degraded, below 100% grounded, any
      override used — and appears automatically. It is never hand-written, and it is absent
      on a clean version.
- [ ] The trend against the previous version renders **"no prior version"** until E6 makes
      one exist. It is not faked, hidden, or shown as zero (decided 2026-09-01).
- [ ] A rate is never shown without its denominator: "12 of 14", not "86%" alone
      (`docs/reporting.md`).

## Depends on
- E4-S4

## Eval gate
- none — figures are SQL over stored rows. Verified by **hand-recomputation once** during
  UAT, which is what catches a definition drift that an automated comparison would agree
  with (`evals/README.md` coverage matrix).

## Technical notes

- **The caveat line being computed is the point.** A hand-written caveat is a caveat someone
  forgets to write on the run that most needed it. The `degraded` and `park_reason` columns
  exist on `prd_versions` for exactly this (E1-S1).
- Denominators matter more than usual here: a version has a dozen or so requirements, so a
  percentage moves several points for one item. `docs/reporting.md` already requires counts
  beside rates; this is the screen where it is most tempting to drop them for tidiness.
- **E2-S2 supplies a cautionary example worth carrying into the copy.** T1's recall measured
  78.6% to 92.9% across four runs of the identical prompt. Any figure on this screen
  describes *this version*, not the system's capability, and the wording should not let a
  reader confuse the two.
- The trend is deferred rather than approximated. A trend line computed from one point is a
  decoration that implies evidence.

---

## DONE — 2026-09-03, after the screen tried to fake a number

Every figure is computed at render from the rows: grounding with its counts, items by kind,
the override count. **A rate never appears without its denominator** — "1 of 2", not "50%".

**The caveat line is computed from state and is absent on a clean version.** That it is
computed is the whole point: a hand-written caveat is one somebody has to remember to remove,
and the one that never gets removed is the one nobody believes.

**The trend was faked on the first attempt, by me.** It took "the previous version of this
`prd_id`" — and every fixture in this project ingests under one `prd_id`, so the screen would
have shown **"requirements 6 → 13"**: two unrelated documents rendered as growth. This story
says the trend must read *"no prior version"* until E6 makes one exist, and that it is *"not
faked, hidden, or shown as zero"*. It was faked, plausibly, and the plausibility is the
problem.

A version now has a predecessor only when it was **produced from one** — when `prd_changes`
rows exist, which WF3 writes and nothing does yet.
