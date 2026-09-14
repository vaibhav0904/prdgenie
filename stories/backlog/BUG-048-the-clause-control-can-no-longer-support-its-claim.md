# BUG-048: The clause control can no longer support its claim

**Severity:** minor as a defect · the finding is about evidence going stale
**Found:** 2026-09-04, the first run of `negative-control-clause.mjs` after BUG-044 repaired it
**Area:** `evals/harness/negative-control-clause.mjs` · the claim belongs to **BUG-018**

## What happens

With the machinery fixed and the swap **proven** to reach n8n (`7f9c3916173e` → `a7001fa162f1`,
each direction verified against the shipped node), the control reports:

```
old bullet: T3-R07 present in 3 of 3
FAIL  T3-R07 goes missing in at least one of 3 runs with the old bullet (present in 3)
```

**BUG-018's diagnosis was that this one exclusion bullet is what suppressed `T3-R07`.** Restoring
the bullet no longer suppresses anything. At prompt `5ad1a07854f1` the miss was 2 in 3; today it
is 0 in 3.

## The likely reason, stated as a hypothesis and not as a finding

The prompt around the bullet has been rewritten since. `unsettled_positions` now exists as a
destination, with its own section and four further bullets — *"Casual or provisional wording is
not deferral"*, *"A decision taken over a dissent is settled"*. **Restoring one old bullet into a
substantially rewritten prompt is not the experiment BUG-018 ran.** The surrounding text now
carries the redirect that the single bullet used to carry alone, which is exactly what this
project keeps finding: *a prohibition holds about two runs in three; a redirect holds.*

If that is right, the behaviour is **better**, not worse: `T3-R07` is extracted reliably whichever
version of the bullet is present, because the rest of the prompt no longer needs it.

## What I deliberately did NOT do

**I did not weaken the assertion to make the suite green.** The obvious move — demote the
statistical half to a printed observation — would be changing a control's threshold on the
strength of **one three-run sample**, in the same session that produced it. This project's own
rule is that a single run is a diagnostic and only a range is a number, and the rule does not
stop applying because the number is inconvenient.

So `check-all.mjs` stays **red on this one check**, with this card as its reason. A red with a
card is honest; a green bought by editing the assertion is not.

## The decision this needs, and the evidence it needs first

1. **Repeat it.** Three runs each way, at least twice more, on different days. If `T3-R07`
   survives the old bullet consistently, the claim is dead and can be retired on evidence.
2. **Then choose, and record which:**
   - **Retire the claim.** BUG-018's fix is now carried by the whole `unsettled_positions`
     section, and `T3-R07` is a labelled item that **C1 already grades** on every run. The
     control's deterministic half (prompt hygiene) is kept, because it still demonstrates
     something true and cheap.
   - **Re-scope the control** to the current prompt: swap out the *section* rather than the
     bullet, and assert against that.
3. Whichever is chosen, **`verify-prompt-hygiene` keeps its half unchanged** — the old bullet
   quotes `T3-R07`'s own supporting sentence, and that must always be caught.

## Not fixed here

The machinery was BUG-044 and is fixed. This card is the claim, which is BUG-018's, and it needs
measurement before a decision — not a decision this evening.
