---
description: Pick the next story from the backlog and move it to in-progress
---

Select and start the next unit of work:

1. List `stories/in-progress/`. If a story is already there, summarize its state
   and continue it — do NOT start a second one.
2. Otherwise read `stories/STATUS.md`'s backlog priority order, cross-check
   `stories/backlog/`, and propose the next story whose `Depends on:` are all in
   `stories/done/` and whose epic has an Approved PRD in `prds/approved/`
   (BUG cards are exempt from the PRD check and jump the queue at severity
   blocker/major).
3. **Confirm the pick with Vaibhav before moving anything** — priority is a
   joint call, not mechanical. If they want a different order, update
   `stories/STATUS.md`'s backlog list to match.
4. Move the chosen file to `stories/in-progress/`.
5. Read the story + the `docs/contracts.md` sections it touches, restate the
   acceptance criteria, and outline the implementation steps — then stop and
   point to `/testplan` next, not straight to building.
6. Update `stories/STATUS.md`.

$ARGUMENTS may name a specific story to pick instead (still confirm before
moving it).
