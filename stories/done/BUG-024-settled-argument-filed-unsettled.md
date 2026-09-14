# BUG-024: A settled argument is filed as unsettled

**Found while:** BUG-007, on the three runs that closed it — by reading what landed in the
new box rather than only the number it was built to move
**Severity:** minor — it costs no requirement and no label today, and it is the exact failure
mode BUG-007's own test plan predicted for a new drawer

## The finding

`unsettled_positions` was added so the extractor has somewhere to put both sides of an
argument nobody closed. On T3 it does that perfectly, 3 runs of 3. On **T1**, in **1 run of
3**, it also produced this:

> **Marcus (Head of Product):** *"Yes. Let's say the data refreshes every thirty seconds.
> Streaming…"*
> **Dana (Customer Success):** *"In eighteen months not one customer has asked me for live.
> Not one…"*

Both grounded, both real. **And that argument was settled in the room** — Marcus says *"I am
withdrawing the thirty seconds. Data refreshes hourly"*, and `T1-R04` records the outcome. It
is the one exchange in T1 that ends in an explicit reversal, which the prompt names as
**not** an unsettled disagreement in as many words.

| | T1 unsettled positions | T1 recall |
|---|---|---|
| run 33 | **2** | 93.3% |
| run 34 | 0 | 86.7% |
| run 35 | 0 | 86.7% |

## Why it is minor, stated precisely rather than assumed

- **It cost no requirement.** `T1-R04`, the hourly refresh, was extracted and matched in that
  run. The reconciliation withdrew nothing on T1 in any of the three runs, because neither
  position's citation overlapped a requirement's.
- **Recall was at its best in that run**, not its worst — 93.3%, the highest T1 has reached.
- So the defect is **precision inside the new box**, and nothing downstream of it moved.

## Why it is worth a card anyway

**Nothing measures the contents of that box.** C1 grades requirements. C2 grades grounding,
PII and refusal. A position filed there is grounded and well-formed, so
`verify-unsettled.mjs` is green on it too — the item is *correct in every way a machine
currently checks and wrong in the only way that matters.*

That is the third time this project has found a new output arriving without a guard: C2's
rules counted requirements when the gap detector started emitting questions (BUG-019), and
now the same again one card later. **The pattern is not "we forgot"; it is that adding an
output is cheap and adding its measurement is a case.**

It is also the mirror of BUG-007 itself. That card was about the extractor putting a
contested thing in the settled box. This is the extractor putting a settled thing in the
contested box — **the same judgement, failing the other way**, and the prompt already
addresses both directions by name.

## Fix — not applied, and deliberately behind a case

Two candidates, neither to be tried until something can say whether it helped:

1. **Prompt.** The `unsettled_positions` section already says a withdrawal is a decision and
   names the exclusion twice. A third wording is what this project has learned not to buy.
2. **Code.** A position whose subject also appears as an extracted requirement's subject is
   suspect — the hourly refresh is in both. Mechanical, and it would need to not fire on T3,
   where both positions are genuinely absent from the requirement list.

**Do not touch either until C4 exists.** C4 is the case that grades what lands in the
gap-and-argument outputs, it is unbuilt, its old threshold is void, and E3-S6 owns writing
the T4 fixture it needs. Tuning against a 1-in-3 observation with no case is exactly the
"tune until it looks better" the eval rules exist to prevent — and BUG-020 is already parked
behind the same gate for the same reason.

**Re-run when:** C1, and C4 once it exists. Read T1's `unsettled_positions`, not just its
recall.

## Lesson

**A new output needs a new case, and a card is the honest placeholder until it has one.**
Everything about this item is well-formed: grounded, cited, correctly shaped, attributed to
the right speaker. The only thing wrong with it is the judgement, and judgement is precisely
what none of the current cases measure.

---

## FIXED — 2026-09-03, and it was worse than this card recorded

**First, the number moved the wrong way.** The card filed this at 1 run in 3. Measured again
before touching anything, across six consecutive T1 versions: **3 of 6.**

## The mechanism, which is BUG-007's, pointed at the new drawer

T1's streaming exchange **is settled** — Marcus says *"I am withdrawing the thirty seconds.
Data refreshes hourly"* — and the extraction prompt said so explicitly:

> *"A position that was later withdrawn… a withdrawal is a decision, so this is **not** an
> unsettled disagreement and the withdrawn position does not go in `unsettled_positions`
> either."*

**That is a prohibition, and this project has measured six times what those are worth.** The
withdrawn position had nowhere to go, so it went in the box built for contested ones — which is
BUG-007's original diagnosis exactly, now aimed at the drawer BUG-007 built.

## The redirect: the withdrawal is already recorded, in the quote

> *"I am withdrawing the thirty seconds"* **is the best possible evidence that thirty seconds is
> not what gets built.** Put it in the requirement's `quote` and the withdrawal is on the
> record, permanently, where a reader can see it. So the earlier position needs no home of its
> own. **An argument that ended because someone changed their mind is an argument that ended.**

Prompt `76f2c985b27f` → **`cdac3b47e764`**. Three clean runs:

| | before | run 1 | run 2 | run 3 |
|---|---|---|---|---|
| **T1** — the settled exchange | 3 of 6 versions | **0** | **0** | **0** |
| T4 — a real argument, both sides | 2 | 2 | 2 | 2 |
| T3 — a real argument | 2 | 2 | **1** | **1** |
| C1 · C2 · C3 · C4 | — | **all PASS** | **all PASS** | **all PASS** |

## The cost, which is real and is not being buried

**T3's SAML argument now files one side instead of two, in 2 runs of 3.** Before this change it
filed both, consistently. Both sides matter: an argument with one side recorded reads as a
request nobody objected to, which is the opposite of what it is.

Nothing gates this — C4 reports unsettled positions with no threshold — so it is a **reported
regression, not a caught one**, and it is written here rather than left in a diff. It is the
trade this redirect bought: a sharper rule about what ends an argument made the model slightly
more conservative about what starts one.

**T4, the fixture written for this**, is unaffected: both sides, three runs of three.

**Re-run when:** C4, and specifically the unsettled-positions row per fixture.
