# BUG-045: A check that passes alone and fails in company

**Severity:** minor (the delta code is fine) · the finding is about check isolation
**Found:** 2026-09-04, first run of `check-all.mjs`
**Area:** `review-ui/scripts/verify-delta.mjs`

## What happens

Run on its own: **13/13**. Run inside `check-all.mjs`, after the other verifiers: **red**.

```
FAIL  TC0a  the delta is computed against the APPROVED version, not the newest draft
            approved=1433, newer draft=146x
```

Nothing about the delta changed between the two runs. What changed is that **other verifiers
created PRD versions on the same database first**, so by the time `verify-delta` ran, the
newest draft was one of theirs.

## Why this is a real defect and not a scheduling annoyance

TC0a's whole point is that a delta reads the **approved** version rather than the newest draft.
It proves that by arranging for a newer draft to exist. But it takes the ambient database as it
finds it, so its fixture is *whatever the rest of the suite happened to leave behind* — and
when a story runs it alone, it passes for a reason that has nothing to do with the code.

**A check whose verdict depends on what ran before it is a check that measures the order of the
suite.** It is the sibling of the lesson already on the record — *a verification that shares a
database with a producing run measures the race, not the system* — arriving without a race, by
sequence instead.

`verify-judge.mjs`, `verify-strata.mjs` and `verify-detail-budget.mjs` already run on a **copy**
of the database for exactly this reason. `verify-delta.mjs` does not.

## The fix, when this is taken

1. Give `verify-delta.mjs` the copy treatment the judge verifiers use: copy `.db` and `-wal`
   (**never `-shm`**, BUG-015), point `DB_PATH` at the copy, and build its own newer draft
   rather than hoping one exists.
2. Then **audit the rest** for the same shape. The question is derived, not guessed: which
   verifiers write to `data/prdgenie.db` directly? Those are the candidates, and any that
   should run on a copy and do not is the same bug wearing a different file name.
3. `check-all.mjs` should not be made to order checks so they stop interfering. **Ordering
   around a fragile check hides it.**

## Not fixed here

Found by BUG-038's runner on its first run — the third card it produced, and the one that says
something about the runner as much as about the check.

## Confirmed intermittent, 2026-09-04 (second sweep)

The second full `check-all.mjs` run — same suite, same machine, nothing changed in `verify-delta`
or in `delta.mjs` — reported it **green**. It was red on the first sweep and green on the
second.

**That is not a reason to downgrade this card; it is the card.** A check that passes or fails
according to what the run before it left in the database is worse than one that fails reliably,
because its green carries no information. Whichever way it lands, it is reporting the state of
the suite rather than the state of the delta.

The fix does not change: give it a copy of the database and let it build its own newer draft.

## Seen again, 2026-09-04, and it is worse than "inside `check-all`"

While closing BUG-049 I ran five verifiers by hand in a different order — `verify-signoff`
before `verify-delta` — and got the same red outside the sweep entirely:

```
FAIL  TC0a  the delta is computed against the APPROVED version, not the newest draft
            approved=1742, newer draft=1761, chosen=1743
```

`verify-signoff` had approved `1743` on the **real** database. `verify-delta` copies that
database, signs off its own candidate `1742`, and then asks for the newest approved version —
which is somebody else's, carried into the copy.

So the dependence is not on `check-all`'s ordering. It is on **whatever approved a version most
recently, anywhere**, and `check-all` merely happens to run these two in an order that hides it.
The fix stands: the fixture must be built, not found.

**And a second thing this exposes.** `verify-signoff` approves a version of the *real*
`forgesight` PRD, on the live database, every time it runs. Whether that is acceptable is worth
deciding on purpose rather than by habit — the sign-off endpoint is the one gate this project
claims is human-only, and a check walks through it unattended.

## Decided 2026-09-04: the checks may sign off, but never on the live database

The question this card raised — *should a check walk through the one gate the project calls
human-only?* — resolves **yes, and it must**. `signOff()` is the only authorised path to
`approved`, and a path nothing exercises is a path nobody has tested; that is the same lesson as
*a door never opened is not a door*. A verifier that refused to use it would be proving the wall
and not the doorway.

What is wrong is **where** it does it. `verify-signoff` and `verify-review-gate` approve real
`forgesight` versions on the live database, which:

1. mints approved versions nobody reviewed, into the corpus M1/M2/M5 are computed over,
2. breaks `verify-delta`'s fixture, which is how this card was reopened,
3. and, since E6-S2, **changes how WF1 routes real documents** — an approved version is what
   sends the next document down the delta road.

So the fix is the one this card already names, applied wider: **the fixture must be built, not
found, and built somewhere that is thrown away.** `verify-apply-delta`, `verify-delta` and
`verify-routing` already work on a copy with a `-wal` sidecar; `verify-signoff` and
`verify-review-gate` should join them. The gate being tested is identical either way — it is a
trigger on a schema, and the copy has the same schema.

**Not chosen:** leaving them on the live database and cleaning up afterwards. A cleanup that
must run is a cleanup that will one day not run, and the rows it would delete are approvals.

### Correction to the decision above, once the code was read

"Never on the live database" was the wrong shape for the fix, and the evidence is that
**`verify-review-gate` already does the right thing**: it builds its own product
(`verify-review-<timestamp>`), its own document, its own version, and signs *that* off. It never
touches a graded run, and it is not the source of anything.

**`verify-signoff` is.** It reads `/api/prd-versions`, takes the first two `in_review` versions
it finds — whichever they happen to be, `forgesight` included — and signs one off. That is what
approved v1743 and left `verify-delta`'s TC0a permanently red.

So the fix is not "move to a copy". It is the same sentence this card opened with, applied to
both files: **build the fixture, never find it.**

1. `verify-signoff` builds its own product and its own two `in_review` versions, the way
   `verify-review-gate` already does.
2. `verify-delta` builds its approved-plus-newer-draft pair in its copy, instead of signing off
   whatever `in_review` version happened to be newest and hoping nothing outranks it.

A copy is still right for `verify-delta` — it already uses one — but the copy was never the
problem. Inheriting somebody else's approval was.

## Outcome — 2026-09-04

**Fixed, and proven by an ordering rather than a run.** `verify-delta` 14/14, `verify-signoff`
9/9, in both orders, and `check-all` **54 of 56** with `verify-delta` green inside the sweep for
the first time since the card was filed.

### What was actually wrong

Not the delta. `verify-signoff` read `/api/prd-versions`, took the first two `in_review`
versions it found — **`forgesight` included** — and signed one off, on the live database, every
run. `verify-delta` then copied that database, approved its own candidate, and asked for the
newest approved version of the same product. It got somebody else's.

`verify-review-gate` has built its own product since E4 and was never a source of any of this.
The pattern existed; two files had not adopted it.

### The three consequences, and the third is the one that matters

1. approvals nobody reviewed, landing in the corpus M1/M2/M5 are computed over;
2. `verify-delta`'s fixture going stale, which is how this card was reopened;
3. **since E6-S2, an approved version decides which road the next document takes.** A check
   could change how a real product routes. That moved this from tidiness to correctness.

### The control, which is the part I nearly skipped

TC0a now passes **by construction** — the product is created microseconds before it is used, so
nothing can outrank it. That is exactly the shape of assertion that passes because the situation
cannot arise rather than because the code is right, and it would look identical to a broken
comparison.

**TC0d** signs off the later draft inside the copy and requires the answer to move:
*"planted v1818, chosen=1818 (was 1817)"*, then puts it back. Without that row the fix is
unfalsifiable.

### One deliberate non-change

`verify-delta` still **borrows** its requirements, with their citations. Inventing prose a
grounding matcher will locate makes a worse fixture than copying one that already works, and a
delta locates quotes — rows with no evidence behind them would exercise a different path
entirely. What changed is that they are cloned into a product that did not exist a moment
earlier. **Borrowing the rows and building the product is the distinction**; a fixture that
invented everything would test the delta against text no model ever produced.

### Measured, not assumed

`forgesight` holds **20 approved versions, newest 1793** — before, after the forward ordering,
and after the reverse. `route=delta version=1793` either way. The checks take nothing and leave
nothing.
