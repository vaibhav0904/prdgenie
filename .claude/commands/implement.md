---
description: Implement the story currently in stories/in-progress
---

Implement the single story in `stories/in-progress/` (if empty, say so and
suggest /story):

0. **Refuse to proceed if `<id>-slug.tests.md` doesn't exist yet** — point to
   `/testplan` instead. Test cases must exist before any build work starts.
1. Re-read the story's acceptance criteria, technical notes, and its `.tests.md`.
2. Build it, following the conventions in `CLAUDE.md`.
3. Any defect discovered along the way → file `stories/backlog/BUG-<n>-slug.md`
   immediately (template in `stories/README.md`), then continue or switch per
   severity.
4. **Verify each acceptance criterion by actually running it — not by reading
   the code.** Flip the matching row in `.tests.md` to Pass/Fail with evidence
   as you go.
5. If eval-gated: run the eval (`/eval`), save the result file, and reflect it in
   the eval's `.tests.md` row. Pass required to finish.
6. **Once every `.tests.md` row is Pass:** generate `<id>-slug.uat.md` (template
   in `stories/README.md`) with concrete, numbered steps Vaibhav can run
   against the demo environment. **Run every step yourself first, in his shell,
   and paste the real output** — a UAT is transcribed, not written (BUG-010).
   **If any step asks him to judge content** — labels, extracted requirements,
   citations, wording, a generated PRD, a delta, a report, UI copy — **build the
   review page (G6b in `stories/README.md`) and give him the link.** One page,
   built from a run that actually happened, source beside claim, click-a-quote
   highlighting, the questions with an answer affordance, and one block of text
   he can paste back. Never a list of files to open. Update `stories/STATUS.md`
   to "UAT pending" and **stop** — do not commit or move the story yet.
7. **Only after Vaibhav replies that UAT passed:** move the story (with its
   `.tests.md`/`.uat.md`) to `stories/done/`, append an **Outcome** section
   recording what was verified and anything surprising, and update
   `stories/STATUS.md`.

$ARGUMENTS may scope which criteria to work on.
