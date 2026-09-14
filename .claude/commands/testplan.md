---
description: Write the in-progress story's test cases, before any build work
---

For the single story in `stories/in-progress/` (if empty, say so and suggest
`/story`; if `<id>.tests.md` already exists, show it and stop — don't
overwrite live progress):

1. Re-read the story's acceptance criteria.
2. Write `stories/in-progress/<id>-slug.tests.md` using the template in
   `stories/README.md`: one row per acceptance criterion at minimum, Status
   `Not Run`. If the story is eval-gated, add one row that references the
   eval case by name (`/eval <case>`) instead of duplicating its method.
3. Do **not** begin building. This file exists so `/implement` has
   something concrete to verify against — that command refuses to start
   without it.
4. Update `stories/STATUS.md`: this story's stage → "test cases ready".
