# BUG-085: The scrub wrote "stranger" where it meant the grader

**Severity:** major · the repository is public and about to be linked from posts. A reader who
clicks through lands on sentences like *"a single provider call inside the stranger"*, which
make the project look machine-mangled in exactly the documents that argue it was built carefully
**Found:** 2026-09-15, auditing the public repository before it is shared
**Area:** prose across `docs/`, `prds/`, `stories/`, `evals/`, and comments in nine code files

## What happened

Before the repository went public, a scrub replaced wording that belonged to an earlier framing
of the project.
It worked by substitution, word for word, across every file:

| Replaced | With | Times |
|---|---|---|
| `grader`, `grader's`, `graders` | `stranger`, `stranger's`, `strangers` | 98 |
| `grader` (before "README") | `run-it-yourself` | 18 |
| `submission`, `submitted` | `release`, `published` | 56 |

"Grader" meant two different things in this repository: **a person trying the project**, and
**the eval grading code** (`evals/harness/grade.mjs`, the case registry). The first reads fine as
"stranger". The second became nonsense:

```
provider call inside the stranger would make the headline accuracy figure a model's opinion
scans both script directories for invocations of the stranger
measures the *stranger's* stability, not the system's
the doer's and the stranger's            (this one meant the judge)
```

"Submission" had the same problem: a **form submission** became *"n8n binds a form release by
index"* and *"a real multipart release"*. And five places now cited `deliverables/RELEASE.md`, a
file that has never existed; the checklist it renamed had been deleted.

**Four answer-key files were edited by the scrub** — the `notes` field of `E1`, `F1`, `T1` and
`T3` in `evals/datasets/labels/`. No label value moved, but the rule is that labels are never
edited after the fact, and a script edited them without anyone reading the change.

It also missed things a substitution list could not know about: two document titles still carried
numbering from an earlier plan, two sentences still measured the design against an outside scoring
sheet, and four ADRs and two process files cited *"the kit"* for a method that is not published
anywhere a reader can follow.

## Why nothing caught it

The scrub was verified two ways, and both were true and beside the point:

1. **A search for the banned words came back empty.** That proves absence. It cannot see what
   was left behind in their place.
2. **A diff against the pre-scrub commit showed zero runtime code changed.** Also true — every
   damaged line is prose or a comment, which is exactly why no check went red.

*A check that asserts something is gone cannot tell you whether what replaced it makes sense.*
The only instrument for that is reading each occurrence, and nobody did.

## Fixed

Every line the scrub changed was listed from `git diff 5117db7` (177 lines) and read in context.
67 edits in 46 files, plus the label restore:

- **The four label files were restored byte for byte** to their pre-scrub version with
  `git checkout 5117db7 -- evals/datasets/labels/`. Their only differences were the four swaps.
- **27 lines** where "stranger" meant the grading code now say so again — **grader**, or once **judge**.
- **6 lines** where "release" meant a form submission say **submission** again.
- **5 dangling `RELEASE.md` references** now say *the release checklist of the day, since removed*.
- **13 lines** where "stranger" or "submitter" meant a person but read oddly were reworded — *"As a stranger"*
  user stories became *"As someone new to this project"*, *"stranger setup cost"* became *"setup
  cost for someone trying it fresh"*.
- **The wording the substitution list missed**, 16 edits: the two titles, the two scoring-sheet
  sentences, seven mentions of *"the kit"*, a phrase ADR 0006 quoted from that earlier plan, a
  checklist line, a comment in `slides.mjs` and one warning in `prove-the-gate.mjs`.

The rest of the 177 lines read correctly and were left alone.

## Lesson

**A find-and-replace across two meanings of one word is not a rename.** Before substituting a
word, list its occurrences and sort them by meaning; if there is more than one meaning, the edit
is per line, not per word.

## Still open

Nothing checks prose for file references that no longer exist. `check-readme-links` covers one
README; the five `RELEASE.md` citations sat in story cards it never reads.
