# BUG-044: A control that cannot run is not a control

**Severity:** major — it is the evidence for C2, and it has been asserting nothing
**Found:** 2026-09-04 by `check-all.mjs` on its first run
**Area:** `evals/harness/negative-control-clause.mjs`

## What happens

```
.\run.cmd evals/harness/negative-control-clause.mjs
Could not locate the bullet to swap. The prompt has been restructured;
this control needs updating before it can assert anything.
FAILED: C2
```

**The control says so itself, out loud, and exits non-zero.** That is the good half: it did not
quietly pass. The bad half is that nothing ran it, so it has been saying this to an empty room
since the extraction prompt was restructured (BUG-032's `7f9c3916173e`, 2026-09-03).

## Why it matters more than a broken test usually does

This control exists to prove that **C2's grounding case can fail** — it swaps a clause in the
prompt so the model produces a subtly wrong citation, and C2 must go red. While it cannot run,
**C2's green means nothing has been demonstrated**, only that C2 passed. That is the exact
shape of BUG-001: a check whose ability to fail is untested is a check that might be reporting
the weather.

C2 is the case that carries the project's hardest floor — *a hallucinated requirement marked
grounded fails any eval at any score*. A floor whose control is broken is a floor nobody has
tested since the prompt changed.

## The fix, when this is taken

1. Find what the control is trying to swap and where that text went. It locates a bullet by
   its wording; the restructure moved or reworded it. **Do not relocate it by a looser match** —
   a control that finds "something like" the bullet is a control that can silently swap the
   wrong thing.
2. Anchor it to something the prompt cannot lose without the control noticing — the same
   problem `sync-prompts.mjs` solved with a content hash. If the anchor disappears, the control
   must fail *loudly*, exactly as it did here.
3. **Then re-run C2 and confirm it goes red**, and only then confirm it goes green again. A
   control repaired without watching it fire is a control repaired on faith.

## Not fixed here

Found during BUG-038's repair, filed rather than folded in. Related: BUG-038 is the reason this
was invisible; this is the second card its runner produced on its first run.

## Fixed, 2026-09-04 — the control runs again, and it found a second defect in itself

**It could not find its subject.** It located the bullet by matching the heading exactly, and
the heading is precisely the part that changed: when `unsettled_positions` was introduced, both
headings grew a redirect — *"— those go in `unsettled_positions`"*, *"— and the withdrawal is
already recorded"*. The match failed and the control exited 1 into an empty room for a day.

**Anchored on stable prefixes now**, with the looseness bounded rather than traded for
brittleness: each prefix must occur **exactly once**, the span must be ordered and non-empty,
and the text being replaced must still carry the `unsettled_positions` redirect while the
restored bullet must not. A control that swaps the wrong text is worse than one that will not
run, so a failure to locate prints **both match counts** and stops before touching anything.

### And then the second defect, which was worse

The line that was supposed to prove the swap had been deployed —
`deployed the old bullet: prompt_version=…` — **scraped the first `prompt_version=` out of
`sync-prompts.mjs`'s output.** That is whichever prompt that script happens to list first, not
the extraction prompt. It printed **`86992c960ac4` in both directions**: a number that is
neither the current extraction prompt (`7f9c3916173e`) nor the swapped one (`a7001fa162f1`).

**A figure the case cannot fail on** (BUG-026). Had the swap silently failed to reach n8n, the
result would have been "T3-R07 present 3 of 3" in both directions and would have read as a
clean negative finding.

It now **asserts the record instead**: after each sync, the `Build extraction call` node in the
shipped workflow must carry the hash of the prompt file as it stands on disk — and the two
directions must deploy **different** prompts. Both assertions pass, and they are what makes
today's result mean anything:

```
PASS  the extraction node carries the prompt on disk (a7001fa162f1 vs a7001fa162f1)
PASS  the two directions deploy DIFFERENT prompts (7f9c3916173e then a7001fa162f1)
```

### What the repaired control then reported

| half | result |
|---|---|
| **prompt hygiene** (deterministic) | **demonstrated** — FAILS with the old bullet, naming `T3-R07` and the quote *"Let's call it cut for now."*; PASSES restored |
| **extraction behaviour** (statistical) | **failed to demonstrate** — `T3-R07` present **3 of 3** with the old bullet restored |

The prompt was restored byte-for-byte (27,192 bytes, `7f9c3916173e`) and the workflow now
carries that same hash.

**That failure is not this card's to resolve.** The control did exactly what its own text says
to do — report, and do not re-run until it agrees — and the claim it cannot support belongs to
**BUG-018**, not to the machinery. Carried to **BUG-048**.

### Correction: this card named the wrong subject

The card said this control exists to prove **C2's grounding case** can fail, and that C2's green
had therefore demonstrated nothing. **Wrong.** It is BUG-018's control, about whether one
exclusion bullet decides that `T3-R07` is extracted. The `FAILED: C2` lines that led me there
were stderr from *other* scripts interleaved in the same `check-all` log — a conclusion drawn
from adjacent lines in a combined output, which is a conclusion drawn from formatting.

Everything else on the card stood: it could not run, it said so, it exited non-zero, and nothing
noticed for a day.
