# Stories — how work moves

**The rule: no build work without a card, and no new epic without a PRD
first.** `stories/STATUS.md` is the live dashboard — check it before assuming a
story's stage from the folder alone. This file is the static process
description.

## The full lifecycle

```
prds/backlog/ → prds/approved/ ─┐
                                 ▼
                    stories/backlog/ (prioritized together)
                                 │  /story — picked, confirmed with Vaibhav
                                 ▼
                    stories/in-progress/<id>.md
                                 │  /testplan — BEFORE any build work
                                 ▼
                    <id>.tests.md created, all rows "Not Run"
                                 │  /implement — build, verify each criterion
                                 ▼
                    test case rows flip to Pass/Fail; eval gate runs if required
                                 │  all Pass →
                                 ▼
                    <id>.uat.md generated — STOP, wait for Vaibhav
                                 │  owner runs UAT with dummy data, signs off
                                 ▼
                    commit, merge to main
                                 │
                                 ▼
                    stories/done/<id>.md (+ .tests.md, .uat.md alongside)
```

Bug cards (`BUG-<n>`) skip the PRD step — they go straight to
`stories/backlog/` — but still get a `.tests.md` and UAT sign-off like any
other story once picked up.

## The six gates

| # | Gate | Enforced by | Kind |
|---|---|---|---|
| G1 | No epic without an approved PRD | `/prd`, `/story` step 2 | doc |
| G2 | The pick is confirmed with a human, not mechanical | `/story` step 3 | **human** |
| G3 | No build without `<id>.tests.md` | `/implement` step 0 — a refusal | doc |
| G4 | Every criterion verified by running it, with evidence | `/implement` step 4 | evidence |
| G5 | Eval gate passes, if the story declares one | `/implement` step 5 | automated |
| G6 | UAT sign-off before promote — never automatic | `/implement` steps 6–7 | **human, when the story carries a judgment** (see below) |

A gate is only real if something refuses. G3 is the whole test-first discipline
in one line; if you soften it, the rest of this process becomes decoration.

## G6, scoped by Vaibhav on 2026-09-01

After running E1-S1's UAT, Vaibhav's call: *"Anything that requires some decision-making
should be shared with me so I can do some UAT, but here I don't think anything is needed."*
That is the owner narrowing the gate, not the builder waving it through — and the
distinction only holds if the line is written down and applied honestly.

**A story needs human UAT when it contains a check a machine cannot make.** Concretely:

| Needs Vaibhav | Signed off by evidence |
|---|---|
| Is this generated output any *good*? (extracted requirements, epics, stories, deltas) | Does a deterministic assertion pass? (schema, triggers, transitions, plumbing, redaction) |
| Does this read well to a human? (a UI, an error message, a report) | Does a command exit non-zero when it should? |
| Is this ground truth *correct*? (eval labels — everything downstream inherits them) | Does a number recompute from stored rows? |
| Any trade-off, naming, or scope judgment | Any criterion whose expected result is stated exactly in the card |

**What does not change.** Every story still gets a full `.tests.md`, every criterion is
still verified **by running it** with evidence recorded (G4), a `.uat.md` is still written
so the steps are reproducible by anyone, and any defect still gets a BUG card. What changes
is only who presses "accepted" on a mechanical result.

**The failure mode to watch:** classifying a story as mechanical because running its UAT is
inconvenient. If there is doubt, it needs Vaibhav. Every story promoted on evidence names
that fact in its Outcome, so the choice is auditable rather than assumed.

## G6b — anything that needs Vaibhav ships as one page, not a reading list

**Added by Vaibhav on 2026-09-02**, after E1-S3, E1-S4 and E1-S6: *"I don't want to open
files one by one. Please share the actionable here itself with all the relevant text."*

Those three cards each asked him to hold a transcript, an answer key and an extraction in
his head at once, and pointed him at four files and a browser to do it. That is not a UAT.
It is a scavenger hunt with a question at the end, and the cost lands exactly on the
judgments that everything downstream inherits — because a reviewer who has to reconstruct
the context will check three items and wave the rest through.

**The rule: when a UAT asks for a judgment over content, build the review surface.** Not a
list of paths. One page that holds everything the judgment needs.

**Extended on 2026-09-02, by the same instruction applied to work that is not a UAT:**
*"For other items blocked on me, share the context in an artefact, instead of me browsing
here and there."* The rule therefore covers **every item waiting on Vaibhav** — a PRD
approval, a BUG card whose resolution is his, an open question a story cannot start
without. Same standard, same page. Where several are outstanding they go on **one** page,
ordered, each saying what it blocks: the reading-list failure is not repaired by handing
over four artifacts instead of four file paths.

It must:

- **Put the evidence beside the claim.** The source document and the thing being judged, on
  screen together, with **click a quote → highlight the exact span in the source**. That
  single interaction is the whole point: it is how you tell a citation that supports a
  requirement from one that merely sits near it.
- **Be built from the live database, not from notes.** Every figure is read out of a run
  that actually happened, and the page names the run — doc_id, version, trace. A review page
  assembled from what the builder remembers is the BUG-010 failure in a new costume.
- **Verify itself before it ships.** Every quote it renders must resolve against `raw_text`
  first, and the check refuses rather than shipping a page whose highlight silently misses.
- **Ask the actual questions**, each with an answer affordance and a free-text note, and
  give back **one block of text to paste into the chat**. A judgment that costs a paragraph
  of typing to record is a judgment that gets skipped.
- **Say what changed since the card was written.** Cards go stale — E1-S3's warned that four
  requirement kinds were the model's hardest, and by the time it was read they all matched.
  A stale warning steers the review at the wrong thing.

**What it does not do:** decide anything. The page presents; the human judges. It must never
pre-select an answer, and where it shows the builder's own reading of how output lines up
against labels, it says so in those words — *orientation, not a verdict* — because the
stranger computes the real numbers and has not run yet.

**Applies to** eval labels, extraction quality, citation relevance, requirement wording,
generated PRDs, deltas, reports, any UI copy judged for tone — and to PRD approvals and
BUG-card decisions, which carry their open questions and the cost of each answer inline
rather than by reference. **Does not apply to** mechanical UATs, which stay as numbered
commands with pasted output.

The E1-S3/S4/S6 page is the reference implementation. It replaced three cards with one
sitting, and the review it produced overturned a diagnosis three prompt iterations had been
spent on (BUG-007) and found a defect no automated check could see (BUG-016).

## Folders

```
prds/backlog|approved|done/     see prds/README.md
stories/backlog/                 all known work, written before building starts
stories/in-progress/             what is being worked RIGHT NOW (max 1 at a time)
stories/done/                    verified complete, UAT signed off, promoted
stories/STATUS.md                live dashboard — check first
```

**File location *is* status.** `STATUS.md` is the arbiter when the two
disagree, and a disagreement is a defect to fix, never to live with.

**There is no `blocked/` folder, deliberately.** A card whose next step is a decision from
Vaibhav goes back to `backlog/` — `in-progress` means *worked right now*, and one waiting on
somebody is not. `STATUS.md` names it as blocked, says what the decision is, and links the
artifact carrying it (G6b). **A card returning to backlog with its measurements already on it
is not an unstarted card**, and its `.tests.md` sitting beside it is how you tell: read that
first, because re-running work that is already measured is the waste this rule exists to
prevent.

## Step detail

1. **PRD** (`/prd`): new capability → drafted in `prds/backlog/`. Approving it
   writes the story cards into `stories/backlog/` and moves the PRD to
   `prds/approved/`. Bugs skip this.
2. **Prioritize + pick up** (`/story`): backlog order in `STATUS.md` is set
   *together*, not mechanically — `/story` proposes the next pick (respecting
   `Depends on` and BUG severity) and confirms before moving the card.
3. **Test cases** (`/testplan`): written **before any build work**, one row per
   acceptance criterion, all starting "Not Run". `/implement` refuses to start
   without this file.
4. **Build + test** (`/implement`): build, verify each criterion by actually
   running it, flip rows to Pass/Fail, run the eval gate if there is one. If
   every row is Pass, generate `<id>.uat.md` and stop — nothing merges yet.
5. **UAT**: Vaibhav follows `<id>.uat.md` against a clean demo environment,
   works the numbered steps, and explicitly says "UAT passed" (or reports
   what's wrong). **This is a human gate, never automatic.**
6. **Promote**: only after sign-off — move the card (+ its `.tests.md` /
   `.uat.md`) to `stories/done/` with an **Outcome** section, commit, merge.
7. If a defect surfaces at any point, **stop and file `BUG-<n>-slug.md`**
   immediately — never fix-and-forget, never fold a bug silently into the
   current story.

## Naming
- PRDs: `PRD-E<epic>-slug.md` (see `prds/README.md`)
- Stories: `E<epic>-S<n>-slug.md`, paired `.tests.md` / `.uat.md` once picked up
- Bugs: `BUG-<nnn>-slug.md`, numbered in order of discovery

**Granularity:** one story = one demonstrable, end-user-visible behaviour
change, buildable and verifiable in a single sitting, with 3–6 criteria that
are each independently runnable. Title it from the user's point of view, not
the implementation's.

## Story template
```markdown
# E<epic>-S<n>: <title from the end user's point of view>

**As a** <persona from docs/domain.md>
**I want** <capability>
**So that** <outcome>

## Acceptance criteria
- [ ] ...

## Depends on
- <story ids or "-">

## Eval gate
- <evals/cases/... or "none">

## Technical notes
- ...
```

On promotion, append:
```markdown
## Outcome (YYYY-MM-DD)
<what was verified, with evidence. What was surprising. What this card
cannot claim.>
```

## Test case template (`<id>-slug.tests.md`)
```markdown
# Test cases: E<epic>-S<n> <title>
| # | Case | Steps | Expected | Status | Evidence |
|---|---|---|---|---|---|
| TC1 | ... | ... | ... | Not Run |  |
```
One row per acceptance criterion minimum. Eval-gated stories reference the eval
case by name in one row rather than duplicating it. Rows may be **added**
mid-flight when review or UAT exposes a gap — the plan is a living contract,
not a frozen one.

## UAT template (`<id>-slug.uat.md`)
```markdown
# UAT: E<epic>-S<n> <title>
1. Switch to the demo environment.
2. Reset it to clean dummy data.
3. <numbered steps: what to type/click, what you should see>
4. Sign-off: reply "UAT passed" (or file what's wrong) before this promotes.
```
Write it for a human's hands, and include the subjective checks a machine
cannot make.

## Bug template
```markdown
# BUG-<nnn>: <symptom, one line>

**Found while:** <story id / activity>
**Severity:** blocker | major | minor

## Repro
1. ...

## Expected / Actual
- Expected: ...
- Actual: ...

## Root cause (fill when known)
## Fix (fill when resolved, link commit)
## Lesson (fill when resolved — what this cost, and what prevents a recurrence)
```

The `## Lesson` line is the highest-value field in this whole kit. When it
names a trap that will recur, promote it into `CLAUDE.md`'s Gotchas **in the
same story**.
