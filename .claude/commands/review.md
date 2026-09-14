---
description: Review the in-progress (or a named) story's implementation against its contract
---

Review the implementation of the story in `stories/in-progress/` (or the story
named in $ARGUMENTS):

1. Check every acceptance criterion against the **actual system state** —
   evidence, not assumption.
2. Cross-check the story's `.tests.md`: every row's Status/Evidence should match
   **what you actually observe, not just what it claims**.
3. Check conventions from `CLAUDE.md`: naming prefixes, contract validation at
   entry points, events logged with the trace id, no per-tenant/per-customer
   branching, error paths wired to the error handler.
4. Check the guardrails relevant to this story — the ones listed under Hard rules
   in `CLAUDE.md`.
5. Report findings as: criteria met / criteria failed / convention violations /
   bugs to file. **File BUG cards for anything that must not be fixed silently.**
