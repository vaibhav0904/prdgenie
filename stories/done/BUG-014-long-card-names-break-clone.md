# BUG-014: Long card filenames make the repo unclonable on Windows

**Found while:** verifying BUG-013's fix by cloning the repo — the clone that was supposed
to prove one bug fixed found a second one
**Severity:** major — a release that cannot be cloned has failed before it is read

## Repro

Clone the repo into a directory that is itself nested a little way down, which is where
anyone actually clones things:

```
git clone <repo> "<some deep path>/prdgenie"
```

## Expected / Actual

- **Expected:** a working tree.
- **Actual:**

```
error: unable to create file stories/backlog/BUG-004-extraction-invents-requirements-from-a-requirement-free-document.md: Filename too long
error: unable to create file stories/backlog/BUG-007-an-unsettled-argument-has-nowhere-to-go-so-it-becomes-a-requirement.md: Filename too long
error: unable to create file stories/backlog/BUG-013-gitattributes-pins-the-launcher-to-the-endings-that-break-it.md: Filename too long
fatal: unable to checkout working tree
warning: Clone succeeded, but checkout failed.
```

The same clone into a short path (`C:\pg-cc`) succeeds completely.

## Root cause

Windows caps a path at 260 characters unless both the application and the OS opt out. Git
for Windows opts out only when `core.longpaths=true`, which is **not** the default and
cannot be set inside the repository being cloned — the repo's config does not exist until
after checkout, which is the step that fails.

Seven tracked paths exceed 70 characters and three exceed 87, all of them story cards named
in the house style: a full sentence describing the defect. That style is deliberate and
worth keeping in the card's title. It is not worth keeping in the filename.

## Why it matters more than it looks

The failure is **partial and quiet**. `git clone` prints `Clone succeeded`, exits, and
leaves a directory that looks like a repository and is missing files. A stranger would find a
populated `stories/` folder with three cards absent and no reason to suspect a truncated
checkout — and the three missing cards are bug reports, so their absence reads as a project
with fewer known defects than it has.

It also cannot be worked around by the reader on the machine where it matters: by the time
the error appears, they have already run the only command the README gave them.

## Fix

Shorten every tracked path to well under 70 characters, keeping the descriptive sentence as
the card's `#` heading where it belongs. The heading is what `/bug` and STATUS.md quote; the
filename only ever needed to be unique and sortable.

Do not fix this by asking the reader to run `git config --global core.longpaths true`. A
release whose first instruction is a workaround for the release is BUG-002 again.

## Negative control

The clone that fails must be shown to fail, and the same clone into the same deep path must
be shown to succeed after the rename — not merely a short-path clone, which passes either
way and would have hidden this bug entirely.

## Lesson

**The state you develop in is not the state you ship in.** The working copy on this machine
was created file by file, so no path was ever constructed by a checkout, and every check
that reads files from disk passed. Same shape as BUG-013, found by the same clone, ten
seconds apart: a guarantee about what a stranger receives can only be tested by receiving
it.
