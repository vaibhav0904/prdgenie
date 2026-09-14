---
description: Draft or approve a PRD for a new epic
---

For $ARGUMENTS (a new idea, or an existing `PRD-E<epic>-slug.md` to approve):

1. **No argument or a new idea:** find the next free epic number across
   `prds/` and `stories/`, draft `prds/backlog/PRD-E<epic>-slug.md` using the
   template in `prds/README.md`. Leave Status: Draft. Do not create story
   cards yet — the PRD needs Vaibhav's read first.
2. **Approving an existing backlog PRD:** confirm the proposed scope with the
   owner **on a G6b page, not by pointing at the file** (`stories/README.md`)
   — the stories, the deliberate non-goals, and every open question with where
   you lean and what that answer costs. Then write its listed stories into
   `stories/backlog/` (story template in `stories/README.md`), set the PRD's
   Status to Approved, move it to `prds/approved/`.
3. **A PRD whose stories are all in `stories/done/`:** move it to
   `prds/done/`.
4. Update `stories/STATUS.md`'s PRD table and backlog list to match.

Bug cards never need a PRD — use `/bug` directly.
