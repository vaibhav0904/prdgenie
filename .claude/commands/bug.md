---
description: File a bug card in the backlog from a short description
---

File a bug for: $ARGUMENTS

1. Determine the next BUG number from existing `BUG-*` files across all three
   `stories/` folders.
2. Create `stories/backlog/BUG-<nnn>-<slug>.md` using the bug template in
   `stories/README.md`: symptom, found-while, severity, repro steps,
   expected/actual. **Leave root cause/fix empty.** No PRD needed.
3. Add it to `stories/STATUS.md`'s backlog list at a position matching its
   severity (blocker/major near the top).
4. If severity is **blocker**, recommend switching to it; otherwise continue
   current work and note it will be picked via `/story` ordering.
5. **If the card's resolution is Vaibhav's call rather than a fix** — a
   labelling question, a policy question, a choice between costs — say so at
   the top, withhold the recommendation, and put it on a G6b page with the
   source beside the claim (`stories/README.md`). A card that names a decision
   as his and then recommends an implementation gets the implementation built
   before the decision arrives; BUG-009 cost two hours that way.

Filing is observation. Diagnosis happens when the card is picked up — resist
diagnosing now, and resist fixing it inside the current story.
