# BUG-086: A test plan was overwritten by its own results, and shipped that way

**Severity:** minor · no result was lost, but it is the first line of a public file and it reads
as corruption: *"undefined Pass | undefined Pass. full verifier sweep green after the change || …"*
**Found:** 2026-09-15, auditing the public repository for damaged prose (the same audit as BUG-085)
**Area:** `stories/done/BUG-007-unsettled-argument.tests.md`

## What happened

Three lines of the file were wrong, and had been since its first commit on 2026-09-02:

1. **Line 1**, the title, was replaced by every row's evidence joined with `||` and each prefixed
   `undefined Pass.` — a results-filling patch that wrote into the wrong place and read a column
   that did not exist.
2. **Line 3** stated *"16 of 17 pass; TC8 fails and was allowed to"* twice in a row.
3. **The "What is being built" heading** had the first row's evidence spliced onto it, and the
   table header that followed was pulled up onto the same line, so the table under it had no header.

Every value in the damaged lines also appears, correctly, in the results table further down. The
record was complete; it was unreadable where a reader starts.

## Why nothing caught it

Nothing reads a story card's structure. The checks that touch `stories/` count files by name
(the deck's count guard) or read `STATUS.md`. A title line that is not a title is invisible to both.

## Fixed

The title restored in the form every other test plan uses — `# Test cases: BUG-007 …`, worded from
the card — the doubled sentence removed, and the heading and table header put back on their own
lines. No result, status or evidence was changed.

A sweep of every Markdown file for the same signatures — a first line that is not a heading,
`undefined` or `[object Object]` in prose, a bold sentence repeated back to back, a heading
carrying `||` — found this file and no other.

## Lesson

**A patch that fills a table should assert the shape it writes into.** This one would have failed on
reading `undefined` for a column it expected, instead of writing the word into the file.

## Still open

The sweep above was run once by hand. It is not a standing check.
