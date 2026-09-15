# BUG-088: The film project's launcher never launched anything

**Severity:** major · `run.cmd` is the first command of every step in *prdgenie-video*'s README,
and in the published repository it cannot start Node at all
**Found:** 2026-09-15, re-rendering the film after BUG-087 changed a count on slide 8
**Area:** `prdgenie-video/run.cmd`

## What happened

```
'ode-v24.19.0-win-x64' is not recognized as an internal or external command,
'ode.exe"' is not recognized as an internal or external command,
```

The file was written through a shell heredoc, which turned two backslash sequences into control
characters: `\n` in `...\node-v24.19.0-win-x64\node.exe` became a **newline**, splitting the Node path
across three lines, and `\t` in `node_modules\tsx` became a **tab**. It has been that way since the
repository's first commit.

## Why nothing caught it

Every render on the author's machine called Node and `tsx` directly, never through the launcher,
so the one file a reader is told to use was the one file never used. It is BUG-041's rule inverted —
*verify the artefact that ships* — and the heredoc trap is already in `CLAUDE.md`'s Gotchas.
Knowing the trap did not stop a file being written through it.

## Fixed

`run.cmd` rewritten with a file-writing tool rather than a shell, and verified by the path the README
gives: `.\run.cmd scripts/storyboard.ts` from PowerShell in the project folder, which built the
storyboard (27 beats, 26 spoken). The render that followed ran every step through it.

## Release

**Not published yet.** The change was pushed to *prdgenie-video* on 2026-09-15 and reverted the same
day (`c22149d`): it had been tested on one machine only, and that repository takes nothing that has
not been tested across. It waits on the local branch `testing-render-fixes`. Until it is released,
the public repository still carries the defect this card describes.

## Still open

A one-off scan of every tracked text file in both repositories — control characters other than tab,
newline and carriage return, a tab inside a path, a line beginning with the tail of a split path —
found no other file. It was run by hand; nothing in *prdgenie-video* runs it as a standing check.
