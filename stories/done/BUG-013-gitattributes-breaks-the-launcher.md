# BUG-013: .gitattributes pins the launcher to the line endings that break it

**Found while:** preparing the first commit — checking, before pushing, that the file BUG-010
exists to protect was actually protected
**Severity:** major — a fresh clone reproduces BUG-010 on the very first command, and the
file written to prevent that is what causes it

## Repro

```
git check-attr text eol -- run.cmd
```

## Expected / Actual

- **Expected:** `run.cmd: text: set` / `run.cmd: eol: crlf` — the launcher is checked out
  with CRLF on every platform and under any `core.autocrlf`.
- **Actual:**

```
run.cmd: text: auto
run.cmd: eol: lf
```

The blob confirms it. `git show :run.cmd | od -c` begins:

```
@   e   c   h   o       o   f   f  \n   s   e   t   l   o   c
```

LF. The working copy on this machine is still CRLF only because it was created by hand and
has never been checked out since.

## Root cause

**In `.gitattributes` the last matching pattern wins.** The file was written in the order a
human reads — the exception first, with its explanation, then the general rule:

```
*.cmd text eol=crlf      <- intended to win
*.bat text eol=crlf
* text=auto eol=lf       <- actually wins, matches *.cmd too
```

`*` matches `run.cmd`, appears later, and silently overrides it. Nothing errors. `git add`
reports nothing. The file reads as though it does exactly what it says.

## Why it matters more than it looks

This machine would never have shown the symptom. The working copy already has CRLF, so
every check that reads the file from disk passes — `run.cmd` works, preflight is 6/6, every
UAT command runs. The defect only appears on a **clone**, which is to say: only for the
stranger, only on release day, and only on the first command in the README.

It also breaks the same way BUG-010 broke — `'tlocal' is not recognized` — so the failure
would have looked like a bug we had already fixed and closed.

## Fix (applied)

Reorder: catch-all first, exceptions after it. Plus the verification line in the file
itself, because the attribute — not the bytes on disk — is what a clone gets:

```
git check-attr text eol -- run.cmd     ->  text: set   eol: crlf
```

`*.pdf`, `*.png`, `*.jpg` and `*.db` are now marked `binary` as well; under the old
catch-all a PDF matched `* text=auto` and depended on git's content heuristic to escape
being line-ending-rewritten.

## Negative control

Reordering was verified by a real clone into a scratch directory and reading the bytes of
`run.cmd` as checked out, not by re-reading the source file. The control is that the same
clone taken **before** the fix yields LF. Both were run.

## Lesson

**A file that configures a check is not covered by that check.** `.gitattributes` exists to
guarantee `run.cmd` survives a clone; nothing verified `.gitattributes` itself, and the one
machine that could have noticed was the one machine whose working copy made it invisible.

This is BUG-001 in a different costume — *a check that repairs what it checks is always
green* — with a new edge: **a guarantee written for a state you are not in cannot be tested
from the state you are in.** The only honest test of "what does a clone get" is to clone.
