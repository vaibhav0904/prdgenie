# BUG-083: The clone fails on Windows before anyone reads a word

**Severity:** minor · only bites when the target directory is deep, but it is step zero on the
platform this project documents first, and it fails with twenty error lines and no advice
**Found:** 2026-09-14, cloning the public repository into a working directory during the setup
walk-through
**Area:** the card filenames in `stories/` · `README.md` · `deliverables/RUN-IT-YOURSELF.md`

## What happened

```
error: unable to create file stories/done/BUG-053-an-unattended-sweep-runs-a-paid-control-that-rewrites-the-shipping-prompt.tests.md: Filename too long
...
fatal: unable to checkout working tree
warning: Clone succeeded, but checkout failed.
```

Twenty files, all of them story cards. The longest tracked path is **103 characters**
(`stories/done/BUG-053-…-rewrites-the-shipping-prompt.tests.md`). Windows' default limit is 260
and git ships with `core.longpaths` off, so any clone target longer than about 156 characters
fails — a nested work folder, a synced Documents directory, a deep temp path.

**BUG-014 already shortened these names once, for this exact reason.** It bought headroom rather
than removing the failure, and nothing records the remaining budget or tells a reader the
one-line fix.

## Why nothing caught it

`check-readme-links` proves the README names paths that exist. It cannot know how long those
paths are on someone else's disk. The fresh-clone walk-through that would have found it was
deferred for weeks, and when it finally ran (BUG-078, 2026-09-10) it started from an unzipped
source archive rather than a clone — so the checkout step was never exercised.

## Fixed

Documentation, not a rename: shortening card names again would break every path already written
into other cards, and the real fix is one setting.

Both READMEs now name it in the setup preamble:

```
git config --global core.longpaths true
```

with the reason, and the note that the longest path in the repository is 103 characters so a
clone target under about 150 works without it.

## Still open

Nothing checks that the longest tracked path stays inside the budget, so the next long card name
re-opens this quietly. A one-line check — assert `max(len(path)) < 120` — belongs with the other
standing checks. Not added tonight because adding a checker changes the count this project quotes
on a slide and in its README, and that number is currently being re-verified.
