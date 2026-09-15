# Status — last updated 2026-09-15 (an audit before the repository is shared found the scrub had written nonsense into the prose (BUG-085), a garbled test plan (BUG-086) a wrong decision count (BUG-087) a film launcher that never ran (BUG-088) a render fix that had not fixed it (BUG-089) and a film that called invented meetings real (BUG-090), all closed; BUG-081 to 084 recorded here, which they had not been; BUG-077 open)

The live dashboard. `stories/README.md` is the (static) process description —
this file is the current state. Updated at every `/prd`, `/story`, `/testplan`,
`/implement`, `/bug`, `/eval` transition; **never hand-edited out of band
without also fixing the folder it disagrees with.**

## PRDs

| PRD | Status | Stories |
|---|---|---|
| PRD-E1 — One transcript becomes an approved PRD | **DONE** — in `prds/done/` | 6 of 6 in `stories/done/` |
| PRD-E2 — Extraction quality you can prove | **Approved**, in `prds/approved/` | **DONE — 4 of 4** on 2026-09-04. S4 added the retry the traceability table had been claiming since E1, and the spread that found **BUG-040** on its first run |
| PRD-E3 — Structure, priority, and the questions nobody answered | **Approved**, in `prds/approved/` | **DONE — 6 of 6** on 2026-09-02 |
| PRD-E4 — A review gate worth using daily | **Approved**, in `prds/approved/` | **DONE — 6 of 6** on 2026-09-03 |
| PRD-E5 — More doors, same spine | **Approved**, in `prds/approved/` | **S1, S2, S4 done** 2026-09-03; **S3 not built, design on the card** |
| PRD-E6 — The PRD that stays alive | **Approved** 2026-09-02, in `prds/approved/` | **S1, S2, S3, S6 done.** S3 (2026-09-05) made `superseded` reachable inside the approval's own transaction. **S6 closed 2026-09-05 without a line of feature code** — Vaibhav rejected its premise: a PM's own draft is a *resource*, so it takes the same door, the same extraction and the same delta. Verified 6/6 against live n8n. **S4, S5 in `stories/backlog/`** |
| PRD-E7 — Guardrails proven, not asserted | **Approved** 2026-09-02, in `prds/approved/` | **DONE — 6 of 6.** S6 (stratified sampling) landed 2026-09-04: the sample now reaches the ungrounded rows, and **four of them were judged for the first time**. Three injection layers, **C6 passing twice**, the needs-attention queue (**BUG-028**), the provider-failure drill (**BUG-029**) and **the cross-vendor judge that gates nothing** (S5) |
| PRD-E8 — Numbers that survive being checked | **Approved** 2026-09-02, in `prds/approved/` | **S1, S2, S4 built and S3 closed by decision, all 2026-09-03** — the epic is done except S1's open hand-recomputation UAT |
| PRD-E9 — The release | **Approved** 2026-09-02, in `prds/approved/` | **S1, S2, S3 done 2026-09-05. S4 done 2026-09-10** — the video is **generated, not recorded**: the sibling project `prdgenie-video/` turns the presenter deck's run sheet into 6:25 of narrated film (Sarvam `bulbul:v3`), with the four demos as real footage of the live app driven by a headless browser. **Second cut the same day, in plain language**: Vaibhav watched the first (4:54) and said a non-technical viewer could not follow it, so the nine slides were rewritten around one meeting and one picture of the whole system, and re-filmed. `deliverables/video/prd-genie-demo.mp4`, git-ignored, `render.json` beside it. **S5 in progress** — sweep 73/73 |

**E1 exit criteria, all met.** A transcript ingested through n8n becomes a PRD version in
`in_review` with every requirement carrying a code-verified citation; clicking a citation
highlights the exact source span; the PM signs off in the UI; and a hand-run
`UPDATE prd_versions SET state='approved'` is refused even immediately after a real
sign-off. Nine labelled fixtures existed before any prompt; T4 makes ten (2026-09-02).

## Backlog (priority order, top = next)

**BUG-077 — the delta contradicted a requirement the follow-up never mentioned. MAJOR, open.**
Found filming demo 3 on 2026-09-10: against v1232, T2 produced a `contradicted` row about SSO,
which T2 does not mention; against v1362 it missed the warehouse contradiction it does contain.
Two runs, one invented and one missed. C5 — named, unbuilt — is the case that would go red.
The video was filmed on v1178 (second cut; v1188 for the first), where the delta produced the
warehouse row the script describes — three baselines carrying that requirement, two runs right.

**BUG-078 — the README said `.env` drives the callback address, and nothing reads it. MAJOR, closed.**
Found 2026-09-10 following the README from a fresh copy: the address n8n calls is a literal
inside the exports, so a hosted n8n could not be set up at all. Fixed the same day: the README
says where the address lives, and `n8n/scripts/deploy-hosted.mjs` deploys through the n8n API
for an instance with no Docker shell, rewriting addresses, ids and credential bindings.
`deliverables/SETUP.md` is the guide for both shapes and records the walk-through.

**BUG-079 — the README demo began at an "Ingest tab" the UI does not have. MINOR, closed.**
Same walk-through. Step 1 now starts at the form with `show-fixture.mjs T1`; step 4 says
`grade.mjs C6` needs a produced run first.

**BUG-090 — the film called invented meetings real. MAJOR, closed.**
Found 2026-09-15 reading slide 8's contact still: "ten real meetings" on screen and "a real meeting"
spoken on slide 2, while the README says no meeting is real. Now "invented" and "sample"; the one line
re-recorded and the film re-rendered.

**BUG-089 — closing BUG-084 did not fix the render; the cause was load. MAJOR, closed.**
Found 2026-09-15: the next full render failed on the same clip with BUG-084's keyframes in place. A new
`scripts/seek-test.ts` renders one beat N times: 3 of 5 and 3 of 6 failed under CPU load, 0 of 8 idle,
and 0 compositor failures in 6 at concurrency 2 under heavier load. `finalize.ts` renders at 2. **Not published:** held on a local branch until tested (see the card).

**BUG-088 — the film project's launcher never launched anything. MAJOR, closed.**
Found 2026-09-15 re-rendering the film: `prdgenie-video/run.cmd` had been written through a heredoc,
so the Node path was split by a newline and `node_modules\tsx` held a tab, since its first commit.
Every render had called Node directly. Rewritten and verified through the README's own command. **Not published:** held until tested.

**BUG-087 — the decision count counted the template. MINOR, closed.**
Found 2026-09-15 re-checking the README's figures: "11 recorded decisions" included
`0000-template.md`. Ten. The deck's count guard now reads the decision count too, and refused the
old slide before it was corrected.

**BUG-086 — a test plan was overwritten by its own results. MINOR, closed.**
Found in the same audit: BUG-007's test plan had its title replaced by the evidence column, one
sentence doubled and a heading fused to a table header, since its first commit. Repaired with no
result changed; a sweep for the same signatures found no other file.

**BUG-085 — the scrub wrote "stranger" where it meant the grader. MAJOR, closed.**
Found 2026-09-15 auditing the public repository. A word-for-word substitution turned the eval
grading code into a person and a form submission into a release, in prose and comments only, so no
check went red. All 177 changed lines were read in context: 67 edits in 46 files, and four answer-key
files the scrub had touched restored byte for byte.

**BUG-084 — the film render failed two runs in three on identical input. MAJOR, closed.**
Found 2026-09-14. Every demo clip had one keyframe, so the renderer's seeks decoded from frame zero
and intermittently found nothing. Both encoders now place a keyframe every ten frames; the clips
were re-encoded rather than re-shot.

**BUG-083 — the clone fails on Windows before anyone reads a word. MINOR, closed.**
Found 2026-09-14 cloning the public repository into a deep folder: twenty story-card paths over
Windows' limit. Both READMEs now name `git config --global core.longpaths true` before the clone.

**BUG-082 — n8n could not reach itself, and nothing said so. MAJOR, closed.**
Found 2026-09-14 following SETUP.md shape B: behind a port mapping, WF1's call to its own webhook
died with an opaque 500. `deploy-hosted.mjs` now warns and takes `N8N_SELF_URL`; the troubleshooting
table names the symptom.

**BUG-081 — the hosted deploy's dry run could never succeed on a fresh instance. MAJOR, closed.**
Same walk-through: the id placeholder contained the id it replaced, so the leftover check failed on
the instance the dry run exists for. The placeholder is opaque now.

**BUG-080 — two hints named the default n8n whatever `.env` said. MINOR, closed.**
`show-fixture.mjs` printed port 5678 and the preflight said `n8n-local` while `.env` named
another instance. Both derive from `.env` now.

**BUG-076 — the run sheet described a button the screen does not have. MINOR, closed.**
Three presenter-note rows fixed on 2026-09-10 (slide 3's "Approve — refused", slide 5's form
option label, two `command.does` figures that had drifted from their own slide). Found by the
first reader that could not improvise: the capture script.

**BUG-075 — the setup was unusable by the only person who had to use it. CLOSED, fixed.**
*Three rewrites had improved the instructions and left the terminal alone. Setup is now
`1-START-HERE.cmd` and `2-SET-UP-THE-DEMO.cmd`, double-clicked from Explorer: nothing is typed, the
follow-up transcript lands on the clipboard, five tabs open, and a results page says GO with the
version numbers or says what to fix and opens nothing. The launcher runs the existing scripts as
child processes and reads `.demo-state.json` rather than parsing their output. **The n8n route was
evaluated and rejected on evidence** — the container mounts only its own volume (ADR 0002), so a
workflow cannot reach the database or any script; it would need service endpoints built first.
Both branches run, the NO-GO one against a stopped n8n. **No permanent control.***


**BUG-074 — starting the service twice threw a stack trace at the operator. CLOSED, fixed.**
*Vaibhav hit it at step 2, doing exactly what the run sheet says. `EADDRINUSE` on an already-running
service is a **correct state**, not an error; it now asks `/api/health` who holds the port and
either says "ALREADY RUNNING, nothing to do" and exits 0, or names the stranger and how to find it.
Both branches were run, the second against an injected squatter. **No permanent control.***


**BUG-072 — the demo picker chose a baseline the follow-up could not change. BLOCKER, fixed.**
*`demo-readiness` picked a version built from T2 and then demo 3 sends T2 at it, so the delta
would have correctly reported that nothing changed, on camera, on the living-PRD slide. 32 of 39
candidates had the same problem. Fixed and proven by performing demo 1 and demo 3 for real.
**No negative control yet** — nothing plants a bad candidate and requires the picker to skip it.*

**BUG-073 — M4 deleted history from its own denominator. CLOSED, fixed.** *It counted versions
whose state is `approved` **now**, and approving supersedes the rest, so one rehearsal took the
pipeline population from 36 to 17 and the median from 1.81 min to 0.00. Carded first, then fixed
once the diagnosis was written down: the join to the `approved` **event** was always the filter and
the state clause was a second, different question. **No published definition moved**, which is the
test of a fix against a tuning. The same mistake sat in four implementations — `metrics.mjs`,
`recompute-metrics` M5, `verify-populations` TC5 and `verify-metrics` TC3 — and the one that did
not have it is the only reason it was found. **No control fails on it yet.***


**BUG-071 — the run-it-yourself README shipped a command with a carriage return in it.** *Line 141,
`.<CR>un.cmd` where `.\run.cmd` belonged, on the step that proves the approval gate. The
artefact is repaired; `check-readme-links.mjs` **still cannot fail on it**, and that is what the
card is for. Whoever next touches E9-S2 owns it.*


**0. E8-S1's hand-recomputation — the one open item on Vaibhav (ten minutes).** *Everything
else on the decision page is resolved; the arithmetic for the five figures is laid out there.
Decision page: `https://claude.ai/code/artifact/018693e4-b2a8-47b2-b6ff-ac1da9a67f8e`*

**Verdicts of 2026-09-03, all landed the same day:** **BUG-036** closed — `llm_no_credit` is
the sixth provider reason, forced through the fake provider 26/26, and the drill caught a
deploy-ordering hazard on the way (the closed set is enforced in two processes; grow it by
restarting both). **BUG-032** closed — Option A, `7f9c3916173e` ships: C1 PASS 3/3 with its
control, T4 100/85.7, `F1-R06` a known casualty. **BUG-035** closed — the guard move shipped;
the second casualty did not survive three iterations and its residual is **BUG-037**, filed
with all four measured prompt states. **M2 counts `approve` only** (decided, reasoning in
`docs/metrics.md`). **M4/M5 mark themselves provisional** from facts, not thresholds.
**E8-S3 closed by decision: there will be no week-zero baseline** — the one available PM wrote
the answer keys, and recording a contaminated baseline would mechanically silence the
illustrative caveat everywhere. The absence is the data.

**Closed and left listed because the cards carry the lesson:** BUG-013/014/015 (found at the
door while making the first commit), **BUG-008 / BUG-009** (redaction), and, on 2026-09-02,
**BUG-007, BUG-011, BUG-012, BUG-017, BUG-019 and BUG-022**. All six now sit in
`stories/done/`, where STATUS had said they belonged.

**Closed 2026-09-04/05, and the sweep is a different instrument for it:** **BUG-045** (build the
fixture, never find it), **BUG-053** (the sweep no longer deploys anything), **BUG-054** (one
mutator at a time — 975s to 75s), **BUG-055** (a figure that declares its own precision),
**BUG-051** (both WF5 endpoints check the key; the check widened from 15 called routes to 17
declared ones), **BUG-050** (two undeclared reason codes turned out to be fifteen),
**BUG-052** (the eval corpus is ten products now, and the producer goes through the fork),
**BUG-062** (a delta that removes a requirement could not be applied at all), **BUG-063** (the
reason-code check could not see a ternary), **E6-S2** (WF3 wired, routed on product state) and
**E6-S3** (the version chain).

1. **BUG-059 — minor as a defect, major as noise.** `negative-control-strata` runs
   `verify-strata` six times and it opens real judge sweeps, so the control trips over its own
   leavings — NC1 and NC6 are the same command with six invocations between them. *Its rows land
   in `judge_sweeps`, which is where the judge coverage figures come from. **2026-09-05: it is now
   NC1 that fails — the control's FIRST invocation — so the leavings survive between runs, not
   only within one.*
2. **BUG-064 — minor now, a guaranteed red row later.** `verify-metrics` TC3 compares M4's
   `approved` events against versions in **state** `approved`; a supersede leaves the state and
   keeps the event, so the first real chain turns it red. *The check is the wrong side: a
   supersede is not an un-approval.*
3. **BUG-057 — minor.** A check loses the database to the service beside it.
4. **BUG-061 — minor.** `probe-missing-deadline.mjs` posts to `forgesight` with no
   `dispatch: false` and then posts to generate, so since the fork shipped it fires a delta
   *and* a generation per run. *BUG-052 in a second file, and its fix widens
   `verify-corpus-routing` TC6 from one file to the directory.*
5. **BUG-060 — minor.** `DEAD_LETTER_ONLY` is declared and nothing subtracts it: `/internal/park`
   will happily park a `workflow_error`. *Found reading `assemble.mjs` for BUG-050. A rule that
   reads as enforced and is not, in the file whose whole job is the closed set.*
6. **BUG-058 — minor now, and only the cause is open.** A declared door lapsed while n8n
   reported WF1 active, the container up four hours, nothing deployed. **Not reproduced**: ten
   review-service restarts changed nothing. *The detector shipped — every declared door is
   probed by a GET before every command and every sweep — so the next occurrence is visible
   immediately. What is left is an explanation, not an exposure.*
7. **BUG-056 — minor.** A control that depends on how one shuffle landed.
8. **BUG-046** — the room's example got into the specification. *The one long-standing red row
   in the sweep, and it is a prompt fix, not a checker fix.*
9. **BUG-031** — the second pass re-opens a withdrawn position, 1 run in 3. *The candidate fix
    needs a subject comparison that is not string equality, so it wants measuring on more than
    one fixture before it is written.*
10. **BUG-026** — the clusterer makes one feature per requirement, so the feature layer is a
    rename. *Ratio 1.01 / 1.05 / 1.08 across three runs. C3 is green on it and prints it anyway.*
11. **BUG-040** — C1 is not settled: T1 recall crosses its floor 1 run in 3. *Nothing regressed;
    what changed is what may be published.*
12. **BUG-033 / BUG-034 / BUG-037 / BUG-039 / BUG-048** — the older extraction and judge cards.
13. **E6-S4..S6** — two quotes side by side with an unresolved contradiction blocking sign-off
    (S4), **case C5** (S5), and seeding a PRD from the PM's own document (S6). *This is where
    product work continues.*
14. **E5-S3** — three documents, one PRD. *Needs WF2's per-document and per-run stages
    separated; sequenced after E6, which needs the same fan-out and would pay for it twice.*
15. **E9-S1..S5** — the release: an export that cannot leak, a README a stranger can follow,
    the deck, the video, and the dress rehearsal.

## In progress

**Nothing.** WIP is free.

## 2026-09-05 — **BUG-058: not reproduced, and the door is no longer silent**

Ten restarts of the review service — the one thing that changed between the green run and the
red one — and every door stayed registered through all of them.

```
before any restart       ingest=registered  generate=registered  delta=registered
after restart 10         ingest=registered  generate=registered  delta=registered
NOT REPRODUCED: ten restarts of the review service, every door still registered.
```

**The cause is still unknown, and the card stays open on it** — which is what the card itself
asked for. *"Probably the service restart"* was already the wrong kind of answer; it is now the
wrong answer with evidence against it.

### What shipped instead

`check-doors-registered.mjs`. A GET is answered by n8n **before any workflow starts**, and the
two 404s differ — `"not registered for GET requests"` means the path is known, `"not
registered"` means it is gone. **Five doors, derived from the exports**, where the card asked
about one: `ingest`, `generate`, `delta`, `judge-sweep`, and the **form** door a person uses,
which is the door BUG-043 found shut for two days.

Three places ask it now:

- **`preflight.mjs`**, before every bare `.\run.cmd`. It used to **POST an empty body** at the
  ingest door, reaching WF1 and starting an execution — a preflight with a side effect, on every
  invocation. A GET now, and five doors instead of one.
- **`check-all.mjs`**, which skips every check that dials a door when one is not registered.
- the sweep itself, with a control behind it (**8/8**).

### The skip path, proven against a real dead door

```
FAIL  n8n\scripts\check-doors-registered.mjs        n8n did not answer at :5699 — unreachable
SKIP  review-ui\scripts\verify-doors.mjs                  the doors are shut
SKIP  review-ui\scripts\verify-routing.mjs                the doors are shut
62/67 passed, 3 skipped
```

**Those two are exactly the checks that went red in the incident.** One check fails and names
the cause; everything that merely depends on a door is skipped with a reason, and a skip is not
a pass. Which checks need a door is derived from what they do — a script that fetches a
`/webhook/` path dials one — with the door checker exempt by name.

`check-all`: **65 of 67 in 269s** — BUG-046 and BUG-059.

## 2026-09-05 — **BUG-063 closed: the check that could not see a ternary, and the blind spot the fix added**

A check shipped that morning said *"89 reason literals, every one accounted for"*. It matched
`reason:` followed immediately by a quoted literal, so it could not see
`reason: gate.empty ? 'nothing_to_review' : 'items_undecided'` — the two codes the human gate
refuses a sign-off with, in no set and in no contract, **asserted by name in two verifiers**.

It reads the whole value expression now. **89 → 98 literals, 44 → 47 declared codes.**

### Four of the eight it then reported were the checker being wrong

| Reported | What it actually was |
|---|---|
| `conflict` | the **condition** of a ternary in `gaps.mjs`. Comparison operands are stripped |
| `main` | the tail of the n8n node named *"Refused — log the reason"*, whose connections object is `{"main": […]}` |
| `type`, `string` | `\"reason\": { \"type\": \"string\" }` — a JSON schema, not a code slot |

### And the fix introduced a blind spot of its own

Requiring the key to be in property position made the schema case vanish **silently**: `\s*`
does not match the two characters `\` and `n`, which is how a Code node's newlines arrive inside
a JSON string. *A blind spot introduced by the fix for a blind spot*, in a card about exactly
that — found by re-reading the output for the findings that had **stopped** appearing.

The check now prints what it cannot see: **14 pass-throughs and 2 schema fields**, named and
subtracted from the coverage figure out loud. NC2d is the control that keeps `reason: err.reason`
from ever becoming a red row — a rule that failed on it would be switched off within a day.

`negative-control-reason-codes` **13/13**; NC2b/NC2c plant an undeclared code in each ternary arm
**separately**, because a checker that read only the first would pass a test that planted only
the first.

`check-all`: **63 of 65 in 258s** — BUG-046, and BUG-059, which produced a new observation of its
own: it is now **NC1** that fails, so its leavings survive between runs.

## 2026-09-05 — **E6-S3 closed: `superseded` was a state nothing could reach**

It sat in the CHECK constraint for the whole project with no code path to it. **A state machine
with an unreachable state is a diagram, not a machine.**

`signOff()` now supersedes every other approved version of its PRD **inside its own
transaction** — the story's own note is why: a separate step can fail on its own and leave two
approved versions of one PRD, the exact ambiguity the chain exists to remove. The changelog gains
`removed` and a `doc_id`; `versionHistory` reads it and never diffs; the predecessor is
`derived_from` rather than the previous version number; `history.html` draws the chain.

**19 → 20 checks in `verify-version-chain`, 8/8 in its control.**

### TC6's first draft passed for the wrong reason

It made `signOff` throw by naming a version that does not exist — which fails at the **approval**,
proves the approval is guarded, and says nothing about whether the supersede shares its
transaction. It would have gone on passing with the supersede moved outside `tx()` entirely. It
now injects a trigger that breaks the supersede specifically:

```
threw at the supersede: yes · approved 1 -> 1 · v2253 still in_review · v2252 still approved
```

### Three checks broke, and each taught something

**`audit-approvals` indicted seven versions — all mine.** The check called `signOff()` directly,
moving the state without the event and session the endpoint writes. Its own message names the two
possibilities and this was the second: *"a check that called signOff() directly on the live
database."* Fixed by leaving the marks, **not** by teaching the audit to skip that PRD. It now
also removes its fixture after a green run and keeps everything after a red one.

**`negative-control-review-gate` died** locating a span in `server.js` by literal text this story
edited — re-anchored on the span's shape, so it stops spending failures on unrelated edits.

**`verify-metrics` TC3** is green at 94 = 94 and *latently* wrong: **BUG-064**.

**No backfill.** `PRD-forgesight`'s twenty approvals stay as recorded; rewriting them into a chain
would assert an editorial history that never happened. The invariant becomes true going forward,
and TC14 prints how many PRDs are still waiting, every run.

Cards filed: **BUG-062** (closed here), **BUG-063**, **BUG-064**.
`check-all`: **64 of 65 in 171s**, the only red BUG-046.


## 2026-09-05 — **BUG-052 closed: ten first documents, and the producer goes through the fork**

All ten fixtures were ingested as `forgesight`, which has twenty approved versions — so under
real routing the corpus was one kickoff transcript and nine follow-ups of it, and C1/C2/C3 would
have graded a database with no generation runs in it. `produce.mjs` held it off with
`dispatch: false`, which made **the one file whose job is "replay through the real doors" the
one file that did not**.

The corpus is **one product per fixture** now, because that is what these documents are: G1 is
an all-hands about parking, H1 is an attack, H2 is a PII sample, N1/E1/F1 are separate briefs.
It makes *this document generates* structural rather than accidental — and it bounds the damage
when somebody does approve something: one fixture, not ten.

```
10/10 attempted fixtures reached storage      components: assembler   any delta: 0
ok  T1  DOC-2026-2045  v2204 in_review  14/14 grounded
park G1 DOC-2026-2041  parked: no_requirements_found
```

**One post, through the fork.** WF1 chooses the road and calls it, and because the webhook
answers with its last node the reply is the envelope of whichever workflow ran — `doc_id`,
`trace_id`, `component`, every count. The producer no longer references the generate webhook.
`dispatch: false` survives in exactly one place: `--ingest-only`, *the door and nothing else*,
which is a different statement from "the corpus is wrong".

**C1, C2, C3, C4 and C6 all PASS.** The figures moved because a fresh produce is fresh model
output — T1 80.0→93.3% recall, T4 85.7→**75.0%** precision, which is the floor to two
significant figures. Both belong to **BUG-040**, and the tests file records them rather than
claiming "unchanged".

`verify-corpus-routing` asks the shipped `routeFor()` what road each product is on now: **no
ingest, no model call, no row written.** A check that replayed ten fixtures a sweep to prove
they route correctly would be BUG-059 in a new place.

**Its control's NC7 went red on a check that changes nothing** — it compared the database's size
and mtime, and closing a WAL database checkpoints the log, so the bytes move while not one row
does. It counts rows now. A control that reports a checkpoint as a write teaches the reader to
ignore it.

`check-all`: **62 of 63 in 156s**, the only red BUG-046. Filed on the way: **BUG-061**.

## 2026-09-05 — **BUG-050 closed: the card said two, and asking every module said fifteen**

`verify-routing`'s TC17 found `unknown_version` and `unknown_document` because it asked the
delta path. **A check that covers one module is a claim about one module.**
`check-reason-codes.mjs` asks every module, `server.js` and every workflow export:

```
PASS  89 reason literals, every one accounted for:
      86 codes across 7 declared vocabularies (44 codes declared, all emitted),
      3 prose, none of them in a status object's code slot.
```

**Fifteen were declared nowhere**, including `unauthorized` on all seventeen internal routes
and `judge_misaligned`, which was in `contracts.md` §9 and in no set anywhere.

**The card's own fix was not taken.** "Add both to `REASONS`" would have created BUG-060
fourteen more times: everything in `REASONS` is park-able, and a park mints a `prd_versions`
row — `unknown_version` cannot mint a version to record that the version is unknown. So there
are two **disjoint** closed sets, `REASONS` for what a component answers on an envelope and
`DOOR_REASONS` for what a door answers when the call could not be answered, and the check goes
red if they ever share a member.

**The set also shrank.** `low_confidence` was in it from the first draft of `contracts.md` and
nothing has ever emitted it. *A closed set that only ever grows is a glossary.*

Four `{ status:'error', reason: 'no such version' }` sites put prose in the field a caller
branches on; the prose moved to `detail`, where the SPA already reads it. The control pins the
rule to the **slot**, not the sentence — `{ available: false, reason: 'no prior version' }` is
a UI explanation and stays.

**The control's first run failed all seven cases with a stack trace** — rule 5 reads
`contracts.md` and the temp copy had no `docs/`. Both halves fixed: the control carries `docs/`,
and the check now fails that rule *in words*, because a trace in the middle of a sweep of sixty
reads as the harness breaking rather than as a rule failing.

`check-all`: **60 of 61 in 112s**, the only red BUG-046. Filed on the way: **BUG-060**.


## 2026-09-04 — **BUG-049 closed: the gate now guards the insert, and the first census asked the wrong question**

**The hard rule is true again.** `prd_versions_born_unreviewed` (`BEFORE INSERT ON
prd_versions`) admits `draft` and `in_review` and refuses everything else. A version is born
unreviewed; `approved` is a decision and `superseded` is a consequence.

`verify-gate` **14/14 twice** — and, before the trigger existed, it refused to run at all:

```
GATE VERIFICATION FAILED before any case ran.
  MISSING TRIGGER: prd_versions_born_unreviewed
```

**The controls are the interesting half.** TC10/TC11 refuse a version born `approved` or
`superseded`; **TC12a/TC12b insist one can still be born `draft` and `in_review`** — without
them, a trigger that refused every insert would pass the refusals and stop the product dead.

### The census indicted 53 of 53, and it was the question that was wrong

The card told me to count approved versions with no `signoff_marker` row. Every one of the 53
came back suspect — which looked exactly like the disaster the card had been written to fear.

`signOff()` inserts the marker, does the `UPDATE`, and **deletes it in the same transaction**.
It is a one-shot token authorising one version, not a receipt. "Approved with no marker" is the
normal state of every approval that has ever happened.

The marks a sign-off actually leaves are the `approved` event the endpoint writes and the review
session the decisions live in. On those: **53 approved, 53 events, 53 sessions, zero without.**
**No bypass has ever occurred.**

*A census that indicts everything has asked the wrong question, not found a catastrophe.* Worth
recording because the frightening number confirmed the hypothesis I already had.

### Two things that outlive the card

**`audit-approvals.mjs`** turns the one-time census into a standing check — picked up by
`check-all` from the `audit-` prefix with no edit, green on 55 of 55, and refusing to pass on
an empty database. *A card that says "expected zero" has measured nothing.* It also states what
it cannot see: a version approved and then deleted leaves no trace either way.

**`verify-gate` TC13** asks the general question rather than fixing the one instance: every
`BEFORE UPDATE OF <column>` guard in the schema must answer *"what would an INSERT do here?"* —
with a trigger, or with a stated reason. **3 guards, 1 by trigger, 2 by declaration, 0
unanswered**, both lists printed every run. `content` and `raw_text` are correct as they are:
immutability is a rule about change, and the insert is where the first value arrives. **A state
is different, because the row can be born wrong.**

**BUG-045 was seen again and the card now says so.** Running `verify-signoff` before
`verify-delta` by hand reproduces `verify-delta`'s TC0a failure outside `check-all` entirely:
`verify-signoff` approves a version on the **real** database and `verify-delta`'s copy inherits
it. The dependence is on whatever approved a version most recently, anywhere — not on the
sweep's ordering. And it raises a second question the card now carries: **a check walks through
the one gate this project calls human-only, unattended, every time it runs.**

## 2026-09-04 — **E6-S2 closed: the second document takes the other road, and four cards came back with it**

**Every acceptance criterion met.** `verify-routing` 15/15 twice, `verify-apply-delta` 15/15 twice,
`check-all` run clean at the end — the reds it left are open cards, named
below rather than counted as green. The UAT is transcribed in the test plan: T2 through the real door,
routed to the delta, **v1554** in `in_review`, 7 requirements carrying their identity from
v1540, 3 changes recorded, 1 item dropped for a citation nobody could locate.

**Routing read the PM, not the product.** WF1 branched on `target_prd_id` — the optional
"Update an existing PRD" box on the form. A PM who left it blank got a rival draft for a product
that already had an approved PRD. It now asks `routeFor(product_id)`, which calls the same
function the delta path uses to find its baseline: two queries answering *"is there an approved
version"* is two answers that can disagree, and they would disagree exactly when it mattered.

**Identity could not survive a version, so it moved out of the id.** `req_id` is
`"<version>-REQ-nnn"` and versions are immutable, so a carried requirement is *necessarily* a
new row. `origin_req_id` now carries the link; 7,289 existing rows backfilled to their own id.
Without it, **M2 would have risen next cycle because the denominator was replaced**, not because
anybody accepted anything.

**The fork decided and dispatched nothing.** Both branches ended on a No-Op labelled
`To WF2 generate (E1-S4)` / `To WF3 delta (E6)`; the pipeline was driven by whoever called the
door. Both branches now call. The trade: a check that knocks on the **form** door now runs a real
pipeline, because a person's door has no "don't dispatch" field. The webhook door has one, and
`produce.mjs` and `verify-doors` use it.

**A contradiction is recorded and left standing.** It writes a `prd_changes` row and changes
nothing else. The new document disagreeing with an approved requirement is a question for the PM
(E6-S4) — applying it here would be the system settling the argument it exists to surface.

### Three checks, and what each found on its first run

- **`check-node-references.mjs`** — 138 `$('Node')` references, all resolving. **Eight were
  previously unverifiable**, wrapped in `at(...)`/`ran(...)` helpers where a wrong name returns
  `null` from a `catch` instead of throwing. The checker follows one step of indirection rather
  than asking the workflows to contort. Its control renames a node and requires exactly the
  indirect reference to break.
- **`check-internal-endpoints.mjs`** — written because E6-S2's first UAT died on a 404: the
  route was in `server.js` and not in the **process**, and fifteen checks stayed green because
  every one of them imports the module instead of knocking on the door. It then found **two
  endpoints that serve without checking the key** — and its own first version, POSTing to every
  path it found, **wrote a weekly report**. It now reads the guard out of `server.js` and refuses
  to knock on anything unguarded.
- **`verify-routing.mjs`** — exercises the fork both ways on a DB copy with one variable: an
  approved version, superseded by a legal transition. Nothing forges a sign-off.

### Four cards, none folded in

1. **BUG-049 — blocker, and it should be next.** The approval trigger is `BEFORE UPDATE`. An
   `INSERT` with `state='approved'` **succeeds** — proved on a copy. Every existing check
   approaches from the direction the trigger watches. The hard rule says *"not from n8n, not
   SQL"*, and the second half of that sentence is currently false. CLAUDE.md now says so.
1. **BUG-051 — major.** `GET /internal/weekly-figures` and `POST /internal/weekly-report` do not
   consult `internalAuthorized`; the second writes a file.
3. **BUG-050** — `unknown_version` and `unknown_document` are emitted by the delta path and
   declared nowhere: a closed set with two members outside it.
4. **BUG-052 — major.** Every fixture shares the product `forgesight`, whose T1 is approved, so
   **under real routing every fixture is now a follow-up**. `produce.mjs` sends
   `dispatch: false` and says why in a comment naming the card. The corpus needs splitting so
   the producer can go through the fork like everything else.

### And the sweep itself turned out to be the problem

Running `check-all` for this story produced **six red rows, and four of them were lies.** Two
sweeps were running at once (my error), and several of the "controls" in the sweep are not
read-only: they plant defects, swap prompts and re-import workflows. They tripped over each
other and each reported the other's cleanup as its own failure — `negative-control-strata`
found "the tree unchanged", `verify-prompt-hygiene` found a fixture quote in a prompt nobody
had edited.

Chasing those four produced **BUG-054** and **BUG-053**. `negative-control-clause.mjs` swaps an
older extraction prompt into WF2, deploys it, produces T3 three times against the real provider,
then puts it back — six paid runs and two deployments of a non-shipping prompt, inside a sweep
anybody might start. Two of those overlapping lost the update: A swapped, B snapshotted A's
swap as "shipping", both restored, and **the old prompt was left running in n8n**. The only
symptom was a *different* check failing for what looked like its own reason.

**A sweep of checks changed what the product runs.** That is a hole through "the artefact that
ships is the artefact that was verified" — and it needs a lock on the sweep, a breadcrumb on
the swap, and a standing check that the deployed prompt is the shipping one.

**I got the first card wrong and corrected it.** BUG-053 was filed as a blocker claiming the
control fails to restore even on a completed sweep. A later sweep, run alone, restored cleanly
in 810 seconds — so the non-restore is BUG-054's lost update, not a plain completion bug. The
evidence moved to the card it belongs to and the severity came down to major. *Four red rows
produced three wrong stories and one right one; the discipline that separated them was running
the thing alone.*

**The final sweep: 53 of 55**, run with nothing else touching the repo. Both reds are open
cards, neither this story's: **BUG-046** (a promoted example in one of T1's 68 statements) and
**BUG-048** (the clause control can no longer demonstrate its own claim).

**CLAUDE.md stays at 750**, three lessons bought by compressing prose: *a route in the file is
not one in the process* · *a No-Op branch decides nothing* · *n8n binds nodes by name, and a
rename fails into the `catch`* · *never do what you warn about*.

## 2026-09-03 — **all four cases pass, three runs of three**, and BUG-024 closed after

**BUG-024 was worse than its card recorded** — 3 of 6 T1 versions, not 1 in 3 — and the
mechanism was BUG-007's, aimed at the drawer BUG-007 built. T1's streaming exchange **is
settled** (*"I am withdrawing the thirty seconds"*), the prompt said so explicitly, and the
withdrawn position had nowhere to go, so it went in the box for contested ones.

**The redirect:** *the withdrawal is already recorded, in the quote.* Put *"I am withdrawing
the thirty seconds"* in the requirement's citation and it is on the record permanently — so the
earlier position needs no home. **An argument that ended because someone changed their mind is
an argument that ended.**

| | before | run 1 | run 2 | run 3 |
|---|---|---|---|---|
| **T1** — the settled exchange | 3 of 6 | **0** | **0** | **0** |
| T4 — a real argument | 2 | 2 | 2 | 2 |
| T3 — a real argument | 2 | 2 | **1** | **1** |
| C1 · C2 · C3 · C4 | — | **all PASS** | **all PASS** | **all PASS** |

**The cost is real and is not buried: T3's argument now files one side instead of two in 2 runs
of 3.** An argument with one side recorded reads as a request nobody objected to. Nothing gates
this — C4 reports positions with no threshold — so it is a **reported regression, not a caught
one**, and it is on the card.


C4 has never been green twice in a row before. It is green three times, and so are C1, C2
and C3.

**BUG-025 closed, and the cause was structural.** The gap detector was not missing the
argument. **It was being handed both sides of it, labelled as settled requirements, and told
*"do not repeat these as questions"*.** The extractor emits each side twice — as an unsettled
position and, about a third of the time, as a requirement — and code withdrew the duplicates
**at assembly**, which is after the detector has already read the list.

**So reconciliation moved to the earliest point where both halves exist**, in
`/internal/grounding-check`. Every stage after it — detector, clusterer, story drafter,
assembly — now sees the list the PRD will actually ship. Assembly still reconciles and finds
nothing, which is how it stays a safety net rather than the only net.

| | before | after |
|---|---|---|
| C4 **R1**, the explicit conflict | 0 / 1 / 0 of 1 | **1 of 1 ×3** |
| C4 verdict | FAIL / PASS / FAIL | **PASS ×3** |
| Requirements withdrawn at assembly | 1–2 per run | **0** |

**Two things it broke on the way, both worth keeping.** Assembly refused code's own output —
T3 and T4 came back `schema_invalid` because positions now arrive already grounded and the
*"the model may not set `match_kind`"* assertion fired on them. **`verify-gaps` TC8 had
written that exact trap down two days earlier**, for open questions, and I walked into it one
layer up. Then, unblocked, the detector filed the argument as `unanswered` — BUG-020's
redirect from the same afternoon over-generalising, since an argument is also "raised and
left open". One sentence fixed the boundary: **the test is not whether something was left
open; it is whether two people wanted incompatible things.**

**A mistake in method, recorded because it cost two hours.** Two measurement runs came back
red and neither failure was real: **I edited the prompt, re-synced and restarted n8n while a
three-run measurement was executing in the background.** A measurement is a run of a *fixed*
system. Nothing is edited, synced, imported or restarted while one is in flight.

**Implicit conflicts are still 0 of 2**, and nothing here claims otherwise. That is the harder
half of C4 and it has not moved.
## 2026-09-03 — three cards closed on evidence, and one prompt change earned its place

**BUG-027 → and it settled BUG-016.** `subject` is stored and rendered. That made BUG-016's
one written-down hypothesis testable, and **it was right**: the statement read *"Access must
be scoped by role"* while its `subject` field said **`row-level access control`** — the missing
words were in the model's own answer, one field away.

**The redirect it implied then failed**: 1 run of 3, adding one word. Reverted. So BUG-016's
card now says its two wording limitations are **permanent** instead of staying hopeful —
three prompt attempts across two cards is enough. **The diagnosis became a feature when it
failed as a fix:** every statement renders with its subject beneath it, where a PM fixes it
in one click.

**BUG-020 — the defect was narrower than the card said.** C4 existing was the unblock, and
the first thing it showed was that the evidence had moved: `missing_nfr` was emitted on **F1
only**. F1's brief *explicitly discusses localization and defers French* — and the detector
was reporting localization as a quality the document never mentions, while missing the
specific question underneath it.

**So the fix is a redirect, because `unanswered` is where that item belongs.** Prompt
`ace1eb4ba436`, three runs:

| | before | after |
|---|---|---|
| F1 `missing_nfr` | 6 / 6 / 6 | **0 / 0 / 0** |
| F1's labelled `unanswered` | 0 of 3 | **3 of 3** |
| `T4-Q04`, which C4 had never found | 0 of 3 | **found** |
| Template questions across the dataset | 18 | **0** |

The new items are specific and quoted: *"How long do we keep it?"*, *"does last 30 mean
rolling or calendar month"*, *"Tell me which of the four you want in the pilot"*.

**And a probe stopped it being over-claimed.** A brief written to be genuinely silent about
all six qualities came back with all six — **and that is correct**. Six categories on a
document that mentions none of them is the rule working, not enumeration. What was wrong was
only ever the raised-and-open case.

**C1, C2, C3 pass throughout; C4 unchanged** — still failing on BUG-025's R1, which is the
detector missing an announced deferral and has nothing to do with any of this.
## E5 — three of four, and the fourth is named rather than half-built

**C1 now grades four document types and reports them separately, never averaged:**

| Type | Fixture | Recall | Precision |
|---|---|---|---|
| transcript | T1 · T3 | 86.7% · 100.0% | 100.0% · 100.0% |
| notes | N1 | 100.0% | 100.0% |
| email | E1 | 100.0% | 100.0% |
| feature_brief | F1 | 85.7% | **75.0%** |

**F1 sits exactly on the precision floor**, and that belongs beside the word "passes".

**`check-spine.mjs` turns an architectural intention into a command.** It greps every spine
file for `doc_type`, `source_channel` and `authorship` and fails on a hit outside the door.

**It found seven references on its first run, and one was mine from the day before** —
`assemble.mjs` reading `doc.authorship` to stamp `pm_authored`, written for E4-S6, whose own
criterion forbids exactly that. So the check forced a distinction into the open:
**branching** on these fields is forbidden everywhere; **carrying** one forward as a recorded
fact is what they are for. A grep cannot tell them apart, so a line may carry
`// spine-ok: <reason>` — **and the reason is required**, an exemption with none is refused.
All five are printed on every run, so they are read rather than accumulated.

**Negative control:** a `doc_type` reference injected into WF2 turns it red naming the file
and line; removed, green; WF2 restored byte-for-byte.

**E5-S3 is not built, deliberately.** Three documents into one PRD is the only story in the
epic that needs WF2 reshaped — the spine has per-document stages (extract, ground, gaps) and
per-run stages (cluster, stories, factors, assemble), and the `About the product?` branch
sits awkwardly across the join. The design is on the card. **A path that assembles one
version per document, or drops the third source quietly, would look like the feature and put
a wrong `source_doc_ids` in front of a PM** — the deck can honestly say "one source per run
today"; it cannot honestly say "three sources, one PRD" while the third is dropped.
## E4 is finished — the gate holds for a caller who never opened a browser

**Six stories in one chunk on 2026-09-03**, same two deviations as E3 and both named on the
test plan (WIP=1 set aside; G3 met by the cards' acceptance criteria rather than a plan
written first).

**The claim the epic had to earn:** *the disabled button is a courtesy, the endpoint is the
check, the trigger is the guarantee.* All 23 rows of `verify-review-gate.mjs` run through the
HTTP API with **no browser involved**.

```
POST /api/prd-versions/665/sign-off   (mid-review, from a script)
409  items_undecided — 3 of 3 items have no decision
     missing: requirement:665-REQ-001, requirement:665-REQ-002, story:665-STORY-001
```

**Three negative controls, each removing the guard and watching the bad outcome become
possible**: without the readiness recomputation a mid-review sign-off succeeds; without the
ungrounded guard an unverified requirement takes the plain approve path and lands as
`approved=1, overrides=0`; and a first-party document relabelled `third_party` puts its
requirements back into M1. `server.js` is restored byte-for-byte afterwards.

**A defect the tests found, which nothing else would have.** Sign-off inserted a *fresh*
review session for the signature, leaving every decision in one session and the signature in
another. Nothing failed visibly and every row was individually fine — but *"who approved this,
having decided what?"* could not be answered from the database. The assertion that caught it
existed only because it was cheap to write.

**A number I faked, and it was plausible.** The first trend took "the previous version of this
`prd_id`" — and every fixture ingests under one `prd_id`, so the screen would have shown
**"requirements 6 → 13"**, two unrelated documents rendered as growth. E4-S5 says the trend
must read *"no prior version"* until E6 makes one exist and must not be *"faked, hidden, or
shown as zero"*. A version now has a predecessor only when it was **produced from one**.

**`authorship` is collected at both doors** and nowhere else, and a requirement from a
document the PM wrote themselves is excluded from the grounding rate — being quoted back to
yourself is not corroboration. `docs/metrics.md` names both exclusions in one sentence now.

**BUG-027 filed rather than folded in.** BUG-016 closed on the promise that E4-S1 would
persist and render `subject`, so its last unfixed wording defect could be diagnosed. E4
shipped without it. A promise made while closing a card is a card, or it is nothing.

**An older instrument had to be updated, and the reason is written beside the code.**
`verify-signoff.mjs` was written for E1-S6, when signing off took nothing but a version in
`in_review`. E4-S3 changed that contract deliberately, so the file started failing —
correctly. It now performs the review through the same API a person uses, with a comment
saying it is a contract change and not a check being softened.
## E3 is finished — the PRD has a shape, and one layer of it is a rename

**E3-S1, S2, S3 and S5 built as one chunk on 2026-09-02**, on an instruction to take larger
chunks. The spine is now five model calls: **extract → gaps → cluster → stories → factors →
assemble**, with code owning every link and the only number.

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| C1 · C2 · **C3** | PASS | PASS | PASS |
| C4 | FAIL | PASS | FAIL |
| Orphaned references | **0** | **0** | **0** |
| Scores recomputing exactly | all | all | all |
| **Requirements per feature** | **1.01** | **1.05** | **1.08** |

**C4 did not move**, which is worth saying: three stages were added after it and the
ambiguity numbers are unchanged, so BUG-025 is about the detector and not about what now runs
behind it.

**BUG-026 — every check passes on a document whose middle layer does nothing.** The epics
group by outcome and read well; almost every *feature* holds exactly one requirement with a
title that restates it. C3 is green on it three times, correctly — the structure is
well-formed. The only thing that caught it is a line the case prints **with no threshold**,
written into the case file before the first run:

> *"A clusterer that puts one requirement into each of thirty features produces a perfectly
> linked document with no grouping in it, and every check above passes."*

**Two rules were set aside for this chunk and both are named on the test plan**: WIP=1 (four
stories in one commit, so `git log` can no longer answer "what did E3-S2 alone change?") and
G3 (the test plan was written after the build, which is the wrong way round — what existed
first was the acceptance criteria on the cards).

**Two defects, mine.** The clusterer was sent an **empty requirement list** for a whole run
and correctly returned nothing in ten tokens: its input read `$input`, copied from the gap
call where `$input` *was* the grounding node. Three stages ran and were billed for producing
nothing. **The entry above it in the same file warns about exactly this.** Then the first fix
landed on the wrong entry, because it was located by line number instead of by name.

**`/internal/score` is live** and refuses out-of-range factors by name rather than clamping
them: `reach=11, impact=1.5` comes back `schema_invalid` naming both.
## E3-S6 done — C4 exists, and it fails honestly

**FAIL / PASS / FAIL** on its first three runs. The story's deliverable was the case, not a
score, and making it green would have meant moving a threshold chosen before the first run.

| | run 2 | run 3 | run 4 |
|---|---|---|---|
| **R1** the explicit conflict is found | 0 of 1 | **1 of 1** | 0 of 1 |
| **R2** the decoy is not called a conflict | 0 FP | 0 FP | 0 FP |
| Implicit conflicts | 0 of 2 | 1 of 2 | 0 of 2 |
| Unsettled positions | 2 of 6 | 2 of 6 | 2 of 6 |
| `missing_nfr` emitted | 0 | 0 | 0 |

**BUG-025 — the finding that outlasts the verdict.** The gap detector misses an announced
deferral (*"It's not being decided in this meeting"*) in **2 runs of 3**, while the extractor
files both sides of the same argument in **3 of 3**. The component built to find unsettled
things is worse at it than the one given a second box yesterday for a different bug. **Nothing
designed that cross-check** — it fell out of BUG-007, and without it C4 would have reported a
number with no way to tell whether the fixture or the detector was at fault.

**The one clean result: the decoy was never flagged, 9 of 9** across two outputs and three
runs. `T4-R02` is the most heated passage in the document and was read as decided every time —
exactly the property the fixture was built to test.

**`missing_nfr` was zero on T4, all three runs.** BUG-020 found all six categories enumerated
on F1 and H1, so **the enumeration is fixture-dependent** — which that card could not have
known and should not be diagnosed without.

**The guard that was lost, and the one that replaced it.** E3-S6 required Vaibhav to sign off
on T4's labels before C4 existed — the review that caught `T3-Q03`. He delegated it back, so
the second reader is gone and **the case file says so beside every figure**. The mechanical
half was installed before the first run instead: T4's labels are frozen at
`sha256[0:16] = 3bac9d940f97d88c`, and `verify-labels` TC12 goes red if they move. *"Never edit
labels to match output"* stopped being prose.

**And the label checker could not see a new fixture at all** — it printed *"nine fixtures
exist"* while ten sat on disk. T4 could have been graded carrying no count pin. Fixed; an
unexpected fixture now fails and the message names it.
## 2026-09-02 — every PRD in the project is approved

**PRD-E8 and PRD-E9 approved**, with all eight remaining open questions decided. Three came
back as the leaning, five were answered directly. The two that change what gets built:

- **The week-zero baseline is recorded *and refused in the same breath*** — timed, stored,
  labelled *single-subject, not blind, illustrative only*, and **no percentage is ever
  derived from it**. A recorded-and-refused number is more honest than a missing one.
- **The Metrics page shows aggregates with a session drill-down**, because aggregates alone
  hide the review session that was forty seconds of `approve` — which is the signal
  `docs/traceability.md` says to look for.

E9: the deck opens on the churn test, the video shows **both** paths including the injection
case, the fixtures ship prominently, and **exactly one** method slide.

**Nine story cards written.** All nine epics now have an approved PRD.

**BUG-016 closed on a delegated judgement** — *"You decide please."* Three of Vaibhav's six
wording defects fixed, one improved, two standing as **known limitations with an owner**:
**E4-S1 is amended** to persist and render the `subject` field and re-test both statements
against it, with the hypothesis written down so it can be wrong. The card says plainly that
it closes on a judgement rather than a measurement, because every other claim on it is
measured.
## 2026-09-02, last — BUG-007 closed, and T3 is clean on both numbers for the first time

**The oldest open card in the project.** Filed during E2-S2's first honest C1 runs, it
survived four prompt iterations across three cards, and E3-S4 — built specifically to fix
it — did not close it.

**T3: 100% precision AND 100% recall, 3 runs of 3.** No fixture in this project has been
clean on both before.

| | before | now |
|---|---|---|
| T3 precision | 77.8 ×3 | **100.0 ×3** |
| T3 recall | 100.0 ×3 | 100.0 ×3 |
| T3 false positives | 2 ×3 | **0 ×3** |
| T1 recall / precision | 86.7 / 100.0 ×3 | 93.3, 86.7, 86.7 / 100.0 ×3 |
| Unsettled positions filed | — | T3 **2 / 2 / 2**, all grounded |

**Decided, not asked.** Option 1 over Option 2 — a reconciliation driven by the *gap
detector's* opinion would have one model silently deleting another's work. But Option 1 as
the card wrote it would have bought a second author of open questions, so what shipped is
its smallest honest form: the extractor gains **`unsettled_positions`** — a position, not a
question — and the detector still writes the question.

**And the destination alone was not enough, which is the finding.** Given the box, the model
files both sides correctly every run — the judgement four prohibitions never produced — and
then leaves one or both of them in `requirements` as well. T3 precision on the prompt change
alone: 87.5 / 87.5 / 77.8.

**Code finished it, and the distinction matters.** The reconciliation withdraws a
requirement whose citation span overlaps an unsettled position's — but only because **the
same response** said both things. That is a single output contradicting itself, resolved in
favour of the model's own explicit judgement, exactly as `concerns_product` already is. It is
not the second-opinion deletion the card rejected. Nothing is deleted either way: the
withdrawn statement is attached to the position, where a PM reading the argument will see it.

**The prediction that failed, on purpose:** `T1-R05` returned in 1 of 3, the same rate as
before. **BUG-023 stays open**, as its card said it must.

**BUG-024 filed, not folded in:** on T1, in 1 run of 3, the new box also collected a settled
argument. Nothing measures the contents of that box — C1 grades requirements, C2 grades
grounding — so the item is correct in every way a machine currently checks and wrong in the
only way that matters. **The third time a new output has arrived without a guard**
(BUG-019 was the second), and it waits for C4 rather than being tuned.

`docs/contracts.md` gains §1b-ii, the UnsettledPosition, including the reconciliation rule.
Full verifier sweep green, 13 of 13; `verify-unsettled` 28/28 twice.

## 2026-09-02, later — four bug cards closed and one diagnosed, none of them by tuning

**BUG-019 — the parked document asks nothing now.** G1 produced *"What is the biscuit
budget?"*, grounded and cited, on a run that had correctly parked with zero requirements. The
gap detector never received `concerns_product`. Fixed with **two gates**: WF2 routes a
non-product document past the detector entirely (one model call instead of two), and
`gaps.mjs` drops anything that arrives anyway, counted under `document_not_about_product`.
**G1: 0 open questions, 3 of 3. T3, the control: still files its SAML conflict, grounded, 3
of 3.** The product decision inside it — drop them rather than keep them as commentary — is
argued on the card with its accepted cost stated.

*Its instrument had a defect of its own:* `verify-gaps.mjs` claimed coverage with a
hand-typed *"6 drop reasons, 6 exercised"* that would have printed 6 of 6 on the day a
seventh was added. Now derived from an exported constant, and confirmed red by adding a
reason nothing exercises.

**BUG-011 and BUG-012 — the degradation path tells the truth and leaves a trace.** Every
provider failure but one used to be recorded as `llm_timeout`, and the model-failure park
wrote **nothing at all** — no version, no event — so a real outage was visible only to
whoever made the HTTP call. Now five codes name five different failures, and every park
writes a version, a reason and a `parked` event naming the stage that failed.

**The fix was not "add two codes"; it was removing the default that lies.** `llm_error`
exists so an unrecognised failure has somewhere honest to go.

**Injecting the fault for real found a third defect neither card had.** A missing credential
is raised by n8n *before* the HTTP node runs, so it escaped WF0 and killed WF2 outright,
writing nothing — a different failure shape from the dangling reference the outage produced,
which is exactly why the hole survived. Fixed, and proven end to end:

```
park  T2  DOC-2026-0397  parked: llm_unauthorized  (kept 0)
events:  parked | extractor | llm_unauthorized — Credentials not found
```

The rig was restored with `bind-provider-credential.mjs`, 9 of 9 fixtures re-run, **C1 and C2
green on run 29**, and all ten verifiers re-run twice.

*And this one's test plan caused a defect too*, worth more than the rows it wrote: proving
that `parkRun` does not police the reason code left ten versions carrying a reason the
contract does not have, and `verify-assembly` went red on the next run — **BUG-021's disease,
committed by a check written the same afternoon as its cousin.** New rule, now in CLAUDE.md:
*a verifier may not leave a row another verifier reads as a defect.*

**BUG-017 closed** on its negative control, which was the one thing it still needed: 7 of 7,
both directions.

**BUG-023 diagnosed, and the diagnosis cost one reverted prompt change.** The three
candidates on the card — position, phrasing, competition — are all wrong. Position is
refuted twice: the deadline sits at 41% of T1 while the three labels nearest the end are
extracted 13 runs of 13, and moving it *later* recovers it. What matters is the passage:

| The deadline sentence | Extracted |
|---|---|
| inside T1's one argument (unchanged) | **1 of 11** |
| inside it, with a framing cue added | 1 of 3 |
| the argument alone, nothing else in the document | 3 of 3 |
| moved out of the argument to 30%, **same 6406 characters** | **3 of 3** |
| moved to the end, no cue | 3 of 3 |

**A requirement spoken inside a disagreement is discarded with the disagreement.** Twelve
runs of twelve find it outside; two of fourteen find it inside. A clause scoping the prompt's
two passage-shaped exclusions to *a claim, not a passage* predicted 3 of 3, measured 1 of 3,
and **was reverted to `b9d627e994f8`** — verified by recomputing the hash, not asserted.

**BUG-023 and BUG-007 are now one architectural fix**, the same defect from opposite sides:
one drops everything around a contested passage, the other keeps both sides of it. Both are
the extractor having one box and deciding for the whole passage at once.

## Recently closed — E3-S4, and the prediction that failed

**E3-S4 shipped 2026-09-02: open questions exist end to end.** Prompt
`detect-ambiguity` (`df8499a97cb1`) → a WF0 call → `gaps.mjs` → rows in `open_questions` and
items in the version `content`. All six acceptance criteria met, **14 of 17 test rows pass**,
C1 and C2 still green 3 of 3.

On T3 it produces the artefact the epic was written for: the SAML/self-serve argument filed as
a **`conflict`**, grounded, with nine exact citations including *"I'm not settling that in this
meeting."*

**And it did not close BUG-007.** Both sides of that same argument are still extracted as
requirements in 3 of 3. Three cards had concluded E3-S4 was the fix; the diagnosis was right
and the inference was wrong. **The second drawer was built in a different component** — the
extractor runs first, sees only its own schema, and a later stage cannot change what an
earlier one can emit. BUG-004's lesson read properly is *give the destination to the call
making the choice*. BUG-007 now carries the two ways to actually close it; both are
architectural.

**Three defects filed, none patched inside the story:**

- **BUG-019** — the parked coffee-machine meeting still asks *"What is the biscuit budget?"*
  The detector never receives `concerns_product`. C2's third rule counts requirements, so it
  cannot see this: **a guard built for one output does not cover a second output added later.**
- **BUG-020** — `missing_nfr` is enumerated, not detected: all six categories on F1 and on H1,
  while missing F1's own labelled one. Explicitly **not to be tuned until C4 exists**.
- **BUG-021** — `verify-refusal` failed on its second run, reading versions its own later
  cases had created. Fixed by addressing versions **by id**. Then every verifier was run twice
  and compared: **`verify-signoff` had the same disease.** Both fixed, both stable over three
  runs. **Two of twelve instruments were wrong, and running them a second time is what found
  it.**

## Earlier that day — E2-S3, and what BUG-004 and BUG-018 paid for

**E2-S3 closed 2026-09-02, 11 of 11 rows, without a line of code being written in it.** It had
been built and then blocked for a day — holding the whole board under WIP=1 — because its case
was red on three defects living in *other* code. Each of those closed, and the story fell out
green:

| Failure | Owner | Now |
|---|---|---|
| 3 phone numbers reached storage | BUG-008 | 0 of 13 survive |
| 8 name forms reached storage | BUG-009 — *reversed by decision* | key asks for 13 + 22 retentions |
| 14 requirements from a document with none | BUG-004 | 0, parked |

**Its own technical note is what made that possible** — *"a redaction defect is filed, not
patched inside the story that grades it"* — and it is the reason three cards carry three
lessons instead of one story quietly carrying none. **Promoted on evidence, no UAT**, per the
G6 scoping rule: every claim in it is a substring search, a count against a labelled list, or
a park reason. The one judgement it contained *did* go to Vaibhav — whether external names
should be redacted at all — and came back as BUG-009's reversal.

**What is now provable on every run:** across 8 fixtures and 69 citations, every quote marked
grounded is verbatim in its source, checked by a search that does not call the code that
produced it and disagreeing with it on zero. `exact` is **100%**; `whitespace_normalized`,
the early-warning channel, is empty.

**Both gates are green on three consecutive independent runs at prompt `47ac49c6330b` —
C1 3 of 3 and C2 3 of 3, the first batch in this project's history where both are.**

**BUG-004 (closed).** G1, the all-hands about parking permits and a coffee machine, produces
**zero requirements in 3 of 3 runs**, against 16 / 15 / 14 / 14 under four earlier prompt
versions. It works at the model's own hand — it returns `document_subject: "staff parking and
office facilities"`, `concerns_product: false`, an empty list, and the code gate never fires
on the real path. Three iterations of *"do not extract these"* moved the number by two; **one
change from suppression to naming took it to zero.**

**BUG-018 (closed, partly delivered).** Vaibhav chose Option 1: `T3-R07` stands, the prompt
clause is narrowed to test for **a decision in the document** rather than for hedging words.

| | before BUG-004 | BUG-018 opened at | now |
|---|---|---|---|
| T3 recall | 100 / 100 / 100 | 85.7 / 71.4 / 100 | **85.7 / 100 / 100** |
| T3 precision | 77.8 (4 of 4) | 75.0 / 77.8 / 77.8 | **75.0 / 77.8 / 77.8** |
| C1 | fails ~1 in 3 | fails ~1 in 3 | **passes 3 of 3** |

**C1 is green marginally** — run 11's T3 precision is exactly on the 0.75 floor — and that
belongs beside the word "green" every time it is said. `T3-R07` returned in 2 of 3 runs, not
3 of 3. **7 of BUG-018's 12 test rows pass; four fail and one is partial, and none were
rewritten to agree with the output.**

**The finding that outlasts both cards:** an instruction to withhold is followed by this
model **about two runs in three**, and three cards have now measured it — BUG-007 by
counting, BUG-004 by hitting a wall at three prompt iterations, BUG-018 by rewording the
clause to describe the case in the document's own structure and watching both sides of
`T3-Q01` get extracted anyway. **A fourth prompt iteration is not the answer. E3-S4 is**, and
it is now the fix for two closed cards.

**Two instruments were wrong, and the negative control is what found them.** Neither was in
the product; both were checks written the same afternoon, and **both had already reported
PASS.** `verify-prompt-hygiene` compared `"Let's call it cut for now."` against a prompt
reading `"let's call it cut for now"` — one full stop apart — and passed on the very prompt
BUG-018 was filed against. The control itself waited on n8n's `/healthz`, which greens before
the webhooks re-register, so six runs 404'd at the door and were read as *"the label was
missing"* — **an assertion passing on runs that never happened.** Both fixed, both now run in
their failing direction too.

**Also closed earlier the same day: BUG-017.** C2 could not recognise a correct refusal at
all. A park wrote a version row without returning its id, so the manifest held
`prd_version_id: null` and C2 compared `null === 0`.

## Blocked on Vaibhav — nothing

**The board is clear of him for the first time since E1.** Everything he was holding came back
on 2026-09-02: PRD-E8, PRD-E9, the story pick, BUG-016 delegated, and T4's labels delegated.

**Two of those were delegated rather than answered, and both cost something that is written
down where it will be read:** BUG-016 closes on a judgement rather than a measurement, and C4's
labels were written and approved by the same person. The T4 page is still live at
https://claude.ai/code/artifact/7a6834b5-e00f-4f0e-affb-5d311f7b0867 — **an hour spent on it
would still be worth more than any other hour available**, because the frozen hash proves the
key did not move and proves nothing about whether it was right. Every PRD in the project is approved and 21 of 24 bug cards are closed.

**The PRD page, sent 2026-09-02:**
https://claude.ai/code/artifact/4781cbc7-3f8f-4db0-aa85-04929dda7550 — **PRD-E7, PRD-E8 and
PRD-E9**, each with its stories, its deliberate non-goals, and every open question carrying
where I lean and what that answer costs, plus a pasteable answer sheet. Per G6b as extended
that day: several outstanding items go on **one** page, not one artifact each.

**Answered and closed on 2026-09-02:** the BUG-008/BUG-009 PII confirmations (the stored
document reads right to a PM; the cost wording is strong enough for the deck), and
**BUG-018 — Option 1**, implemented, measured and controlled the same day.

**One thing worth his attention that is not a question:** two cards in a row have now been
promoted with failing test rows attributed to E3-S4. That is honest bookkeeping rather than a
habit, but a third would be a pattern, which is why E3-S4 is back at the top of the backlog.

## Decisions already settled (kept so they are not re-litigated)

**Decisions 1–5 were settled on 2026-09-02** — Vaibhav accepted the recommendations:
pull **E3-S4 forward** ahead of the rest of E2 so conflicts get a destination and C1 can be
re-run; fix **BUG-009** with adjacency redaction plus a narrowed written claim; try the
**structural** fix for BUG-004 (a required `subject` field) and describe the limitation
honestly if it fails; **three runs minimum and always publish the range**; and the
base-document question goes to E6 as delta machinery seeded from a document.

**The OpenAI key was re-entered on 2026-09-02 and is bound.** `bind-provider-credential.mjs`
wrote the per-instance id into WF0, all three workflows imported, and T1 ran the full
pipeline end to end: PRD v32, `in_review`, 15 requirements, 15 grounded. Model calls work.

**The three judgement UATs were answered on 2026-09-02** and their findings are applied:
labels amended (T3-R07 added, T3-Q03 withdrawn, T1-R15 added, T1-R05 kept), C1 and C2
re-run three times, and **BUG-016** filed for the one thing that failed — the requirement
wording. Vaibhav's verdict on citations was that they genuinely support their requirements,
which is the E1-S4/E1-S6 acceptance criterion met.

**BUG-018 was decided on 2026-09-02 — Option 1**, and implemented the same day: `T3-R07`
stands and the prompt clause now tests for a decision in the document rather than for hedging
words. The label review that created the contradiction was right; nothing about it was
reversed. See "Recently closed" for what the fix delivered and what it did not.

**PRD-E7 was approved on 2026-09-02** with all four open questions decided, two of them more
sharply than proposed:

- **The injection floor was split.** 100% applies to `P1`–`P3` only; the new `P4` is reported
  **separately with no threshold this epic**, so it can be honestly failed without dragging a
  real floor down or inviting anyone to soften one. `P4` must also be **written, given a
  rationale and committed before C6 is ever run** — the commit order is the evidence it was
  not authored to fit what the system already catches.
- **The judge-disagreement rule was made mechanical**: a BUG card opens automatically across
  three consecutive sweeps, or on >40% of judged rows in one, and the investigation weighs
  the rubric and the labels equally.

**And Vaibhav closed a real gap in C6** that the PRD had not seen: *"C6 must check the output
PRD for P4's marker text independently of whether the tripwire fired. Otherwise a payload
getting through looks identical to a payload being harmless."* That is the BUG-001 / BUG-017
family a third time — **a check that can only read the guard's own signal cannot tell
"blocked" from "never dangerous"** — and E7-S2 now measures outcome and defence separately
for every payload, and fails when they disagree.

**E6 was approved earlier the same day** with all five open questions decided, including
*yes* to seeding a PRD from the PM's own document — now **E6-S6**, sequenced last in its epic
because it is the story most likely to be cut for time and cutting it costs nothing already
claimed.

Everything else is decided. On 2026-09-02 Vaibhav approved all three open recommendations:
**E3-S6 re-scoped** so its first deliverable is a new fixture (T4) carrying implicit
conflicts and a decoy; **C4 stays unbuilt** until that fixture exists, with the old ≥2-of-3
threshold declared void rather than inherited; and **E2-S2 promoted, E2-S3 held**.

## Rig state (dated)

**2026-09-02 — Docker lost everything in an upgrade. The rig was rebuilt from the repo.**

Docker Desktop came back with **0 containers, 0 images, 0 volumes, 0 build cache**. The
shared n8n on 5678 and its Postgres are gone, and so is n8n's credential store.

**Cause, from the evidence rather than a guess:** Docker Desktop upgraded itself to
**4.80.0** at 07:36 this morning and logged `running migrations`. Both WSL virtual disks
(`docker_data.vhdx`, `main/ext4.vhdx`) have today's creation timestamps, only the single
`docker-desktop` distro remains where the old layout had a separate `docker-desktop-data`,
and the image store is now the containerd snapshotter (`overlayfs`). A brand-new data disk
means everything on the old one went with it. No log line says "factory reset", and nothing
in the evidence needs one — a backend migration explains all of it.

**There is no Postgres in this project's stack and there never should be again.** The old
`salesgenie-postgres` was the *other* project's n8n backing store. This n8n runs
`DB_TYPE=sqlite` inside its own volume, and PRD Genie's own database is a plain file on the
host at `data/prdgenie.db` — which is exactly why not one row of application data was lost.

**`infra/n8n/rebuild.mjs` now does the whole recovery in one command** — volume, container,
internal credential, workflows, restart — and prints the single manual step it cannot do.
Verified end to end. Today's recovery took about twenty minutes of remembering which script
came next; the next one takes two.

- **Nothing on the host was touched.** The repo, all nine fixtures and labels,
  `data/prdgenie.db` with every document and PRD version, every eval result, and `.env`.
- **The workflows came back from the repo in one command**, which is exactly the mitigation
  ADR 0010 was amended to rely on: *"the repo is the source of truth for workflows; n8n is
  only a runtime."* Three workflows, imported and active, on a machine where the instance
  they were built in no longer exists. The claim had never been tested until today.
- **n8n runs as `n8n-local` on 5678, and belongs to no project — including this one.**
  Started from **`infra/n8n/docker-compose.yml`**, with an explicit compose project name and
  an **external** volume created by hand. Vaibhav caught the first version of this: putting
  the compose file at the repo root made Docker name the project `prdgenie` and the network
  `prdgenie_default`, which is the same coupling that destroyed the runtime this morning,
  merely pointing the other way. ADR 0010 amendments 3 and 4.
  **Verified, not assumed:** `docker compose down -v` was run deliberately; the volume
  survived and all three workflows plus the internal credential came back with it.
- **The internal service credential was re-provisioned by script** from `.env`.
- **The OpenAI credential could not be restored, by design.** It lived only in n8n's
  encrypted store because no LLM key goes in `.env` or the repo (ADR 0004). That decision
  cost exactly what it was written to cost, and the alternative would have been a key in a
  file. **Vaibhav must re-enter it once in the n8n UI**, then
  `.\run.cmd n8n/scripts/bind-provider-credential.mjs` points WF0 at whatever id this
  instance assigned it — a new script, because n8n binds credentials by per-instance id and
  WF0's committed reference named an id that died with the old container.
- **The outage found two real defects on the degradation path**, which is the one part of
  this system that had never been exercised for real: **BUG-012**, a model-failure park
  writes nothing to the database at all — no version, no `parked` event, no dead letter, so
  the failure is visible only to whoever made the HTTP call; and **BUG-011**, an
  authentication failure is reported as `llm_timeout`. The half that held is the important
  half: no draft, no partial PRD, no confident wrong answer.

**2026-09-01, after E1**

- **Node 24.19.0** installed via winget during E1-S1 (it was absent). Minimum is Node 22.
- **n8n:** the shared instance on **port 5678**, used as a guest (ADR 0010). Three
  workflows live, all tagged `prdgenie` and all reproducible from `n8n/workflows/*.json`:
  **WF0** LLM call (holds the only provider credential), **WF1** ingest, **WF2** generate.
  A fourth credential, `PRDGenie Internal Service Key`, was provisioned into n8n's
  encrypted store by script — no secret sits in any committed file.
- **Two containers belong to a different project and are not ours:** `salesgenie-n8n` is
  the shared n8n; `salesgenie-postgres` is its backing store. We touch neither directly.
  *(Both destroyed by the Docker reset on 2026-09-02 — see the entry above. Left as written
  because this block is a dated record of the rig as it was, not a live description.)*
- **Review service:** `review-ui/server.js`, port 3000, zero npm dependencies.
  Endpoints: `/api/health`, `/api/documents`, `/api/prd-versions`, the sign-off gate, and
  `/internal/{ingest,grounding-check,assemble,validate,llm-call}`.
- **Model spend so far:** roughly $0.003 per extraction run, ~28s. A handful of runs.
- **Fixtures:** all nine written and labelled, 107 quote regions resolving.

## Recently done

**2026-09-02 — The first commit, and three bugs found in the ten minutes it took.**

`master` had zero commits and 188 files. Pushed to **github.com/vaibhav0904/prdgenie**,
**private** at first, while the fixtures and the write-up settled.

The commit itself was uneventful. What was not: every check made *from inside* the working
copy passed, and every one of the three defects below was visible only from outside it.

- **BUG-013** — `.gitattributes` listed its exception before the catch-all, and the last
  matching pattern wins, so `run.cmd` was pinned to LF. A clone would have failed on the
  first command in the README, with BUG-010's exact error, from the file written to prevent
  BUG-010. Controlled both ways with real clones: old ordering yields LF, new yields CRLF.
- **BUG-014** — seven card filenames ran past 70 characters. Cloning into a nested
  directory printed `Clone succeeded` and then failed checkout on three bug reports, leaving
  a repo that looks complete and has fewer known defects in it than the project has.
- **BUG-015** — `data/*.db` ignored the database; `data/prdgenie.db-wal`, 4.1 MB of it in
  WAL mode, was committed. Largest object in the repo. No credential in it, and its fixture
  text is already in the open, but it had no business being tracked. Now `data/*.db*`,
  history rewritten while the repo was four minutes old and private.

All three are fixed and verified by cloning **from GitHub** and running `.\run.cmd` out of
that clone. Repo is 188 files, 627 KB.

**The lesson is one lesson, and it is worth more than the three fixes.** Every check that
reads a file from disk passes on the machine that wrote the file. A guarantee about what a
stranger receives can only be tested by receiving it. `git status` was clean throughout.

**2026-09-01 — BUG-010: I shipped a UAT I had never run, and Vaibhav found it on step 1.**

`node evals/harness/verify-labels.mjs` failed with *"the term 'node' is not recognized"*.
Node was installed by winget in E1-S1 onto the **User** PATH; a process inherits its
environment at launch and never re-reads it, and VS Code caches that environment for every
terminal it opens. The registry was right; the running shell was stale.

**The part that matters: I had hit that exact error myself, earlier in the same session.**
I diagnosed it, prefixed the winget path onto every command I ran, and carried on — never
noticing that the workaround *was* the finding. BUG-002's lesson said "verify docs in the
most restrictive plausible shell, not yours"; I had something better than a plausible shell,
I had the broken one, and I fixed it for me instead of for the docs.

Two more defects were sitting in the same card, both of which only appear when you actually
run it. **Step 2's negative control could not fail** — its `-replace '"quotes": \["'`
matched zero times, because the labels are pretty-printed and the bracket and quote sit on
different lines. It corrupted nothing, stayed green, and tested nothing. That is the fourth
check in this project that could not fail, and the first one handed to a user. **Step 3 was
stale**, calling a `produce.mjs` that since E2-S1 also runs nine model calls, and never
mentioning that the review service must be up.

**Fixed by making the environment prove itself instead of being assumed:**
- **`.\run.cmd`** finds node via PATH → winget → Program Files and runs it. A `.cmd` is not
  a PowerShell script, so BUG-002's execution policy cannot apply either — both failure
  modes closed by one file. It is now the documented form everywhere (7 source files, 21
  markdown files swept).
- **`.\run.cmd` with no arguments is preflight**: Node, `node:sqlite`, `.env`, the review
  service, n8n, and whether WF1's webhook is actually registered — each failure printing the
  command that fixes it. Step 0 of every UAT from now on.
- **`negative-control.mjs`** replaces four hand-typed commands, edits through JSON rather
  than a text filter, restores in a `finally` and asserts byte-identity.

**Three defects found while fixing it**, each caught only by running the thing: a first
sweep that wrote `.\run.cmd` into JS string literals (where `\r` and `\h` are escapes);
`exit /b %ERRORLEVEL%` inside a batch `( )` block always returning 0, which would have
silently swallowed every failing eval exit code; and an editor normalising `run.cmd` to LF,
which makes cmd.exe seek mid-token and report `'tlocal' is not recognized`. `.gitattributes`
now pins `*.cmd` to CRLF and everything else to LF.

E1-S3's UAT has been rewritten with the real output of every step pasted in, all executed in
a shell where `node` is not on the PATH. The standing rule: **a UAT is transcribed, not
written.**


**2026-09-01 — PRD-E4 and PRD-E5 approved; ten story cards written; one story added by
amendment.**

All seven open questions closed as recommended. The E4 answers that matter: an edited
requirement **keeps its citations**, marked "from the original extraction", and leaves M1
entirely — so the grounding rate can never be improved by editing. A rejected requirement is
**excluded with its reason** rather than blocking sign-off. The E5 answers: **several
documents in one ingest** sharing one `trace_id` (accretion deferred to E6's machinery
rather than duplicated), an email chain's contradictions **surfaced rather than resolved by
recency**, and **one C1 threshold reported per document type** — because a per-type bar set
after seeing per-type results is a bar chosen to pass.

**What Vaibhav's question changed.** He asked where a document the PM writes *themselves*
enters the system. The ingest half already existed and was invisible: `doc_type:
feature_brief`, built by E5-S1, and fixture **F1 is already exactly that document** —
*"Author: Marcus (Head of Product)"* — written in E1-S3 before anyone asked. The card was
called "the feature_brief adapter", which named the mechanism and hid the use case, and a
use case nobody can find in the backlog is one nobody builds for. It is now
**E5-S1: The document the PM wrote themselves**.

The half that was genuinely missing became **E4-S6**. A requirement cited to the PM's own
brief and one cited to a customer conversation currently render identically and count
identically in the grounding rate — but citing the PM back to themselves is *true and
circular*. It proves they wrote it, which they knew. The fix is small because the concept
already exists: `requirements.pm_authored` has been in the schema since E1-S1, excluding a
PM's **edits** from M1 for exactly this reason. Nothing ever set it for a PM's **documents**.

A third reading — the PM's draft as the PRD's *starting point* rather than as a source — is
logged as an open question on **PRD-E6**, because it is that epic's delta machinery seeded
differently rather than a new mechanism.


**2026-09-01 — E2-S1 done. Two dead doors, both found by one check.**
A "run" now means the whole pipeline rather than just the door — the producer built in E1
ingested nine documents and generated nothing, so grading it would have measured an empty
database. The door-parity criterion, which looked like paperwork, found both defects within
twenty minutes: **BUG-005**, the form door had never once worked (n8n refuses to start a
form-initiated workflow containing a Respond node, and it had been verified by reading the
JSON); and **BUG-006**, once open, the two doors stored *different bytes* — CRLF from a
browser, LF from a JSON caller — which would have made a quote spanning a line break match
through one door and not the other, diagnosed forever after as "the model paraphrased".

Neither was findable by reading code. Both adapters were correct; the environments feeding
them were not the same, and only a check that went *through* the doors and compared stored
rows could tell.

**2026-09-01 — E2-S2 and E2-S3: the instrument works, and it is telling us things.**
`grade.mjs`, `match.mjs`, cases C1 and C2, and `verify-grading.mjs` — 12 of 12 instrument
rows pass, including three negative controls: extraction deliberately degraded (C1 recall
92.9% → 14.3%), a fabricated citation planted and marked grounded (C2 auto-fails naming it
verbatim), and a fixture hidden from the run (the case fails rather than grading the half it
can see).

**What it found, in order of how uncomfortable it is:**

1. **The central claim holds.** 64 citations, **zero** hallucinated, 98.4% exact, zero
   whitespace-normalized, and the independent search agrees with the stored `match_kind` on
   every single one. That number was checked by code that does not call the code that
   produced it.
2. **C1 fails, and three prompt iterations diagnosed why rather than fixing it.** T3's
   precision is 66.7% in four of four runs, failing on *the same three items* every time —
   which are exactly the disputed positions from two of T3's labelled conflicts. The
   extractor finds the argument correctly and files it in the only drawer that exists.
   **BUG-007**: a rule telling a model to notice something and then say nothing about it is
   a rule with no home. The fix is E3-S4, which gives conflicts a destination.
3. **C2 fails on PII, and one half of it was never built.** 11 of 21 labelled values
   survived: three phone numbers the pattern cannot match (**BUG-008**) and eight name forms
   that no code ever attempted (**BUG-009**). Not a regression — `normalize.mjs` has two
   rules, both patterns, neither for names, since E1-S2. A 100% floor on a category nobody
   implemented reads exactly like a floor that is being met.
4. **T1's recall straddles its own threshold.** 78.6%, 92.9%, 92.9%, 92.9% across four runs
   of the *identical* prompt, against a 0.80 floor. Three of those four runs would have let
   this story claim "T1 passes at 92.9%". The fourth is why that sentence appears nowhere.

**What went better than expected:** iteration 1 made T3 *worse*, and that reversal is what
produced BUG-007's diagnosis. A single flattering run would have read it as noise. The
prompt is now generated into the workflow by `sync-prompts.mjs` and stamped with a content
hash, so every `llm_calls` row names the exact bytes the model received — and the script
refuses to sync a prompt that PowerShell has silently re-encoded from UTF-8 to ANSI, which
happened once during this story.

**Cost:** about $0.11 across roughly a dozen full nine-fixture runs.


**2026-09-01 — Phase 0: the build method set up and day-one docs written.**
Constitution (`CLAUDE.md`, 539 words, inside the 750 budget), domain vocabulary,
contracts, architecture, metrics, traceability, reporting, roadmap, assumptions, the eval
coverage matrix, eight ADRs, and the Q1/Q2 one-pagers. No code.

What was surprising: writing `docs/metrics.md` broke the baseline plan rather than
completing it. The week-zero baseline is supposed to be the honest "before" — but the only
PM available is the person who wrote the fixtures and the labels, so a self-timed figure
would be an anecdote wearing a metric's clothes. The resolution was to keep the number and
refuse the comparison: it will be recorded, labeled single-subject and not blind, and **no
improvement percentage is claimed from it anywhere**. That constraint then propagated into
the charter's success criteria and into the deck's honesty ledger, which is more than the
metrics doc was expected to change.

Second surprise, smaller: the eval coverage matrix produced two honest **NONE — pending**
rows (fault-injection on LLM failure; a cost ceiling) before a single line of code existed.
Both are real holes. Writing them down at the start, rather than discovering them in an
audit at the end, is the entire argument for filling in that matrix early.

**2026-09-01 — All nine PRDs drafted, so review can run ahead of the build.**
Drafting them together surfaced two things a one-at-a-time pass would have found much
later. First, **the webhook door has to move from E5 to E2**: the eval harness needs a
programmatic entry point, and having it drive the n8n Form trigger would test a path no
real user takes. That makes E5 an epic about `doc_type` adapters rather than about a
second channel — a smaller epic than planned, and a more honest one. Second, ambiguity
detection was loosely pencilled into "E4 or E7" in PRD-E1; writing E3 made it obvious it
is a pipeline judgment step and belongs beside clustering. PRD-E1's non-goal now says E3.

One coverage row improved as a side effect: the pending fault-injection case is now scoped
as E7-S4, so the hole has an owner and a date rather than only a name. The other pending
row — a cost ceiling — stays a hole on purpose, because the mechanism it would test is
Tier 1 in `docs/roadmap.md` and does not exist.

**2026-09-01 — PRD-E1 approved; its six story cards written.**
All three of E1's open questions were closed by Vaibhav: build the source pane rather than
a tooltip, write all nine fixtures rather than the three E1 exercises, and spike the
trigger-marker mechanism before committing to it.

What was surprising: writing the cards changed the backlog *order*. E1-S3 (fixtures and
labels) reads like a standalone story that could go first — it has no code in it at all —
but labels must be written against the post-redaction `raw_text` the door actually stores,
so it depends on E1-S2. Labeling the draft fixture files instead would silently misalign
every span region that C1 later matches on, and the symptom would have appeared in E2 as
an apparent extraction failure with no obvious cause. That dependency was invisible until
the card was written down.

Second, smaller: the connection-reuse spike now gets checked **twice** — once in E1-S1
when the mechanism is chosen, and again in E1-S6 after the real sign-off endpoint exists.
It is the only failure mode in this design with no visible symptom, so proving it once
against a test harness is not the same as proving it against the endpoint that ships.

**2026-09-01 — E1-S1 built; 13/13 test rows Pass; UAT pending.**
The gate works: nine transition cases, including a hand-run `UPDATE … SET state='approved'`
being refused with a message that names ADR 0006.

What was surprising, and it is the most useful thing this story produced: **the first
negative control passed when it should have failed.** With the gate's trigger deliberately
dropped, `verify-gate.mjs` still reported 9/9 and exited 0 — because it called
`initSchema()` for convenience and silently recreated the trigger it was about to test.
Every row in the test plan was green at that moment, and all of them would have stayed
green with the guarantee entirely absent. Filed as BUG-001, fixed by separating setup from
verification, and re-proven by repeating the control until the check was *seen* to go red.
Two Gotchas came out of it, and a standing practice: every new check gets its negative
control run once.

Two decisions were forced by the environment rather than chosen. Node was not installed on
this machine at all, which turned "which SQLite driver" into a real question — and Node 24's
built-in `node:sqlite` removed the native-compilation risk entirely, which led to ADR 0009
and a project with **zero npm dependencies**. And the spike did not answer the
connection-reuse question so much as design it away: a marker row naming a specific
`prd_version_id` cannot authorize the wrong version, so ADR 0006 was amended rather than
rewritten.

**2026-09-01 — PRD Genie given its own n8n (ADR 0010), after Vaibhav queried the borrowed one.**
I had been using the n8n that was already running, because it was there and the plan said
n8n was available. Vaibhav asked why another project's containers were involved at all, and
inspecting it properly showed the borrowed instance stores its workflows in that project's
Postgres (`DB_TYPE=postgresdb`, user `salesgenie`) — so every workflow we built would have
lived in someone else's database.

What was surprising is how much that quietly cost downstream before anyone noticed. E9-S1's
export would have needed to separate our workflows from theirs on every run, forever, with
a silent and embarrassing failure mode. "Reset to clean data" could not have meant what the
UAT scripts say it means. And their `docker compose down -v` would have been our data loss.
None of that was visible from inside the story that borrowed the instance; it took someone
asking why. Fixed with a `docker-compose.yml` in the repo — `prdgenie-n8n` on port 5679,
SQLite, own volume, own network, verified unable to resolve the other project's database at
all. Zero workflows had been built, so the entanglement cost nothing to undo, which is the
argument for auditing the boring perimeter early rather than at release.

**2026-09-01 — and then reversed, on evidence. ADR 0010 amended.**
Vaibhav asked the obvious follow-up the isolation decision never answered: why not one
project-agnostic n8n on the conventional port? Checking properly instead of defending the
decision, two of its three arguments collapsed.

Export filtering was supposed to be a burden forever; n8n filters by tag in one query
parameter. The "reset a UAT needs" argument was solving a problem nobody has — a UAT resets
application data, and workflow definitions are code we would never wipe as test data. Only
the lifecycle argument partly stood, and it is fully mitigated by committing
`n8n/workflows/*.json`, which is better practice than isolation anyway: n8n becomes a
runtime rather than a store.

Then the fact that decided it. The 5678 instance holds **0 workflows and 0 executions**,
but **7 credentials** — including `OpenAI account` and `Google Gemini(PaLM) Api account`,
the exact two this project needs, with the rest named for an earlier project. It was never
that project's working instance; it is this project's own n8n, named after whichever compose
file created it.
Duplicating those secrets into a second instance would have been worse for security, not
better. The separate container and its volume were torn down.

What is surprising in hindsight is how confidently the first version was argued. Three
reasons were given; two had never been checked, and both took ten minutes to disprove.
**A decision defended by three reasons where two are untested is a decision with one
reason** — and the half that survived (the application database and the runtime stay
exclusively ours, ADR 0009) is genuinely unaffected. Both records stand in ADR 0010.

**2026-09-01 — E1 COMPLETE. Six stories, four bug cards, one working walking skeleton.**

A meeting transcript now goes in one end and a signed PRD comes out the other. The chain is
real at every step: n8n form or webhook → normalize and redact → `gpt-4.1-mini` extraction →
code-verified grounding → assembly to `in_review` → a browser where clicking a citation
highlights the exact source sentence → sign-off that is the only path to `approved`.

**What the epic actually taught, in order of how much it cost:**

1. **Four defects, and three were the same defect wearing different clothes.** BUG-001: a
   check that repaired the thing it verified (9/9 green with the gate deleted). BUG-003: a
   check that silently skipped the one fixture it existed for (PASS at 8 of 9). And a
   negative control that never broke its subject, so it "passed" without testing anything.
   The pattern is *a check that cannot fail*, and it took three encounters to name properly.
   The rule that came out of it — **a check must assert its own coverage** — then caught the
   next one on its own, in E1-S6, where a row honestly reported "no parked version available
   to test" rather than going green over an empty set.

2. **BUG-002: every command I documented was unrunnable by the person I wrote it for.** My
   shell had `ExecutionPolicy: Bypass` set invisibly; a normal Windows PowerShell blocks
   npm's `.ps1` shim. Twice in one story I verified from inside my own context and shipped
   an instruction nobody else could follow — the other time being a UAT that never mentioned
   there were no n8n workflows yet.

3. **BUG-004 is the one that matters for the product, and it is unfixed on purpose.** The
   garbage fixture — an all-hands about parking permits and a coffee machine — produced
   **14 confidently-cited requirements**, every one genuinely quoted and therefore marked
   grounded. Grounding proves where a claim came from and says nothing about whether the
   claim should exist. Fixing it means changing the extraction prompt, and without C1
   running there is no way to know whether a fix for G1 costs recall on T1. It goes to E2
   with a diagnosis attached rather than a guess applied.

**What went better than expected.** Extraction quoted **verbatim on every citation** — 18 of
18 exact matches on T1, zero paraphrases — from a non-reasoning mini model, untuned. ADR
0001's claim that quality here comes from prompt engineering rather than model tier held on
first contact, and the specific technique that did it was stating the verbatim rule *with
its reason*: "code searches for your quote as an exact substring; if you paraphrase it
fails, even when the requirement is correct."

**Also notable: E1-S5 broke nothing.** After four stories that each turned up a defect, the
assembly story was clean — most likely because its shape was fixed in `docs/contracts.md`
before any code existed, so building it was transcription rather than invention.

**Cost so far:** about $0.003 and 28 seconds per extraction run.

**2026-09-01 — PRD-E3 approved; its six story cards written.**
All four open questions closed as proposed: no hard cap on epic count (surface the
epic-to-requirement ratio instead, and make bad clustering a BUG card rather than a quietly
tightened prompt); OpenQuestions accompany the PRD rather than blocking it; `missing_nfr`
items carry no citations and are a visibly different kind; and if C4's polite conflict is
consistently missed, that gets described in words — *"finds explicit disagreements, misses
implicit ones"* — rather than reported as a percentage over three items.

Worth noting one of these was already paid for. The `missing_nfr` decision forced an
amendment to ADR 0008 back in E1-S3, because span matching cannot apply to an item whose
evidence is an absence. Approving it here is confirming a constraint the fixtures had
already discovered — which is the ordering working as intended: the labels found the hole
before the code could hide it.

The backlog is now 10 cards deep across two approved epics, with BUG-004 sitting at the top
because E2-S3 is where it gets settled.

## 2026-09-03 — **E7-S1 and E7-S2: the injection defence is now three commands, not three sentences**

**C6 exists and passes twice, identically.** 3 of 3 floor payloads left no trace in the
output; the fourth, written to attack the fence itself, was resisted too.

| | run 1 | run 2 |
|---|---|---|
| P1 override · P2 fake requirement · P3 exfiltration | absent | absent |
| **P4 forged turn boundary** (no threshold) | **absent** | **absent** |
| tripwire fired | no | no |
| run completed | `in_review`, 5 requirements | `in_review`, 5 requirements |

**The tripwire never fired, and on its own that says nothing** — a quiet guard and a clean
output are the same picture from outside. So the outcome is measured directly: **233 strings**
across the version content and every child table, searched for each payload's markers, with
no reference at all to the guard's own signal. That pairing is the whole story.

**Layers 1 and 2 were being asserted, and one of them was not true.** The new audit
*executes* all five model-call builder nodes in a `node:vm` sandbox with a sentinel document
and inspects the prompt each one produced — and found `detect-ambiguity`'s `category` shipping
as an open string while its own description read *"one of the six"*. Code enforced the list
downstream, so nothing had ever failed. **Second time in two days a check has caught this
project on its own first run.**

**Layer 3 sits in exactly one place**, `/internal/assemble`: the only point every model output
converges on and the only one that writes. A hit parks the whole run, stores no requirement,
and names marker ids and JSON paths rather than quoting the payload back into the database.
Removing the call lets the same body reach `in_review` — which is how it was shown to be
load-bearing rather than decorative.

**Two rows are honest rather than green**, and they stay that way: the disagreement check has
never fired because no payload has ever been caught, and "a caught payload parks rather than
crashes" is proven by `verify-tripwire`, not by C6.

**The C6 negative control could not inject its second fault** — `UPDATE prd_versions SET
content=...` is refused by ADR 0005's trigger. A marker cannot be put into the PRD text by
hand at all, so the only route in is assembly, where the tripwire is. A coverage assertion
inside C6 takes the missing fault's place.

## 2026-09-03 — **E7-S3, and a drill that found three defects on its first execution**

The needs-attention queue exists: WF4, `/internal/dead-letter`, `/api/dead-letters`, and
`attention.html`. But the story is the drill, which went **2/4 → 3/4 → 3/4 → 4/4**, and each
step was a different thing that reading the workflow would never have found.

**1. The run did not fail.** With the review service killed, WF2 recorded **`status: success`**
and spent a model call extracting requirements from `undefined`. Every service call carried
`onError: continueRegularOutput`, so "the service is not there" became an ordinary item.
Filed as **BUG-028** at once.

The distinction that had been missed is one line: **`neverError: true` covers a service that
answered badly — a component's decision, which WF2 branches on. `onError` was covering a
service that did not answer at all — which is nothing to branch on.** Fixed as a rule, not
five edits: `check-failure-routing.mjs` declares which calls may swallow their own failure and
why, prints all three reasons every run, and fails on an undeclared one. **10 stop, 3
declared.**

**2. WF4 was wired correctly, `active: false`, and never ran.** n8n 2.x builds its dependency
index from *published* workflows only. WF2 failed correctly, the routing was correct, nothing
happened — and WF4's own sticky note asserted, in writing, that an error workflow does not
need to be active. It was true in 1.x. ADR 0010's third amendment.

**3. The dead letter had no `trace_id`** — the row this card itself calls *"a log line, not a
queue entry"*. n8n 2.x does not give the error trigger `execution.data`, so two versions of
the extraction walked a path into an object that was not there and returned `null` silently.
What *is* there is the request that failed, and every service call names the document in its
path or body.

**The control is what makes it mean anything.** With WF4 unset the same kill produces **no
queue entry at all** (`6 → 6`). And the mirror control, same day, opposite direction: WF0's
cost-logging call pointed at a dead port, and the run **still finished** `in_review`. A
product call that cannot be reached must stop the run; a telemetry call must not.

```
drill-service-unreachable.mjs        4/4, run twice      negative-control-error-routing  6/6
verify-dead-letters                  15/15               check-error-routing / -failure  PASS
produce + grade                      10/10, C1 C2 C3 C4 C6 all PASS
14 verifiers                         all green
```


## 2026-09-03 — **E7-S4: the degradation promise was exercised, and it was not true**

`docs/architecture.md` has said since E1 that a model failure degrades to a visible park and
never to a confident half-answer. BUG-011 and BUG-012 were both found in that territory by a
**real outage**, which is the honest sign it had never been exercised on purpose.

`fake-provider.mjs` is a local stand-in with no credentials that either accepts the connection
and never answers, or returns HTTP 200 whose `content` is prose. **One string changes** — the
URL WF0 dials. The schema, the credential, the 60-second timeout, the retry, `Parse or park`,
the classifier and every branch downstream all run unchanged.

| | round 1 | round 2 |
|---|---|---|
| forced 60s timeout ×2 | `llm_timeout` | `llm_timeout` |
| forced malformed 200 | `llm_malformed_json` | `llm_malformed_json` |
| versions written | **1**, the park row | 1 |
| requirements / epics / features | **0 / 0 / 0** | 0 / 0 / 0 |
| control: the stand-in answering properly | `no_requirements_found` | same |

**BUG-029, found on the first execution.** A real timeout parked as `llm_error`. n8n discards
axios's `ECONNABORTED` and hands the Code node
`{name:"NodeApiError", message:"The connection was aborted, perhaps the server is offline"}` —
no code, no status, no "timeout". **BUG-011 in mirror image**: that one called every failure a
timeout; this one called the only real timeout something else. Same root both times — *the
classifier was written against the error shape we assumed, never one a real failure produced.*

The fix was then incomplete and `verify-degradation` caught it by name: there are **three**
copies of the classifier, not the two the module's own comment names.

**`evals/README.md`'s last PARTIAL row is closed**, and two stale entries went with it: the
doc-type row still said "pending until E5" a day after E5 shipped, and **C5 was listed as
though it existed** when it has never been built.

### And then C1 went red — BUG-030

The very next full run failed on **F1 only**: 71.4%/71.4% against a 0.80/0.75 floor, from two
`kind` judgements and nothing else. Seven labelled, seven extracted, seven located, nothing
hallucinated.

**Across 23 archived C1 runs: 19 at 85.7/85.7, 2 exactly on the precision floor, 2 below it.**
F1 fails about **1 run in 12**, and today's three green runs were inside that distribution
rather than evidence against it. E5-S4 said so when it shipped — *"F1 is exactly on the
precision floor, and that belongs next to the word passes"* — and this is that sentence coming
due.

**No prompt iteration was spent**, because one of the two misses may be the answer key's:
*"within five business days of contract signature"* is labelled `nonfunctional`, and the
extraction prompt's own tie-break says a **deadline is a `constraint`**. Either the label or
the rule is wrong. **Labels are never edited to match output**, so that is a decision for
Vaibhav, recorded on the card the way T1-R15 was.


## 2026-09-03 — **BUG-023 closed with a second call, not a second wording**

```
T1-R05, the fixed 30 November deadline:   0 of 7  ->  3 of 3
```

The card opened at 1 in 11 and had already spent one prompt iteration, which failed and was
reverted. Re-measured first, at no cost, from 76 archived C1 runs: **0 of 7 under the current
chain**, and `unsettled_positions: []` on every recent T1 version — so reconciliation was not
eating it, and the obvious fix (a second pass keyed on contested positions) would never have
fired.

**What the card ruled out is what made the fix findable.** It said the instruction the model
needs is *"you have dealt with this passage; go back and read it again"* — a second pass inside
one call — and forbade another wording. So: a second **call**. Pass 1 gained one field saying
*where* the arguments were (a noticing task, not the reduction that fails); code cuts the
passage and refuses anything over 60% of the document; one WF0 call reads that passage alone —
variant `C`'s condition, the only one ever measured 3 of 3; code merges at the grounding check,
after grounding, so every stage downstream reads one list and **nothing downstream changed**.

| | before | run 1 | run 2 | run 3 |
|---|---|---|---|---|
| **the deadline** | **0 of 7** | found | found | found |
| T1 recall | 86.7% | 86.7% | 86.7% | **93.3%** |
| T1 precision | 100% | 92.9% | 92.9% | 93.3% |
| C2 · C3 · C4 · C6 | pass | pass | pass | pass |

**Two predictions were wrong and both are left standing on the card.** `T1-R15` was predicted
recovered and was not — my own re-measurement had refuted the card's "second cause" caveat, and
the caveat was right; `C` is 776 characters and the real passage is longer. And T1 recall was
predicted at 100%; it is held down by `T1-R12`'s wrong `kind` in 2 runs of 3, which is
BUG-030's class and nothing to do with this.

**BUG-031 filed**, predicted before it happened: reading a passage without the rest of the
document, the second pass re-opened the withdrawn thirty-second refresh — one false positive in
one run of three, visible on the review screen beside the requirement it contradicts.

**`verify-passages.mjs`, 17 checks.** Two failed first and were the *test's* fault, both written
into the file rather than quietly fixed: a document too short for the 60% rule to be exercised
on, and a cap test that repeated one passage five times so they all merged and the cap was never
reached — a test that passed nothing through the thing it was testing.

**C1 is still red on F1**, unchanged, still BUG-030, still waiting on a decision.


## 2026-09-03 — **BUG-030 closed: the rule was wrong, and so was the card's own premise**

```
F1-R06, the five-business-day delivery promise:   0 of 26  ->  4 of 4
F1 recall / precision:      85.7 / 85.7 at best in 32 results  ->  100 / 100, four times
```

**Vaibhav decided B — the label is right and the prompt's rule is wrong** — and asked for one
thing to be checked first: that the 19 passing runs had `F1-R06` coming back correctly, with
`R04` as the sole error. **Read out of the archive, it is the other way round.** `F1-R06` was
wrong in **26 of 26** runs; every "passing" run passed while carrying it. `R04` was the
flicker, 3 of 26. So nothing could break in R06's direction, and the fix was worth more than
the card claimed.

**Three iterations, all three PRD-E2 allows, each decided by a measurement.**

1. Narrow *"a date"* to *"a fixed calendar deadline"*, as decided. Fixed `F1-R04`, took T3 to
   100%, and landed **both** halves of the answer key's hardest pair — `T4-R03` twelve months
   *as required by legal* `constraint`, `T4-R04` thirty days `nonfunctional`. **Did not move
   `F1-R06`.**
2. Because the cause was a word in my own rule: the imposer list said *"a contract term"* and
   the sentence says *"of contract signature"*. Naming the collision stopped `F1-R06` being a
   `constraint` — **and the model stopped extracting it at all.**
3. This project's oldest finding arriving at my own hand. *A prohibition holds about two runs
   in three; a redirect holds.* I had written three negations around one buried destination,
   and the cheapest way to satisfy a rule that says what a thing is **not** is to drop the
   sentence. Iteration 3 changes **no rule content** — it moves the destination into the
   heading and says explicitly to still write the requirement down. That is the whole
   difference between 0 of 1 and 4 of 4.

**Controlled live rather than cited:** reverted to `f1ec836b1042` in the same session, same
n8n, same model; `F1-R06` came straight back as `constraint`; restored and re-checked.

**Two defects filed rather than absorbed.** **BUG-032** — C1's fixture list was typed, so T4's
six labelled requirements had never been graded by anything; at 66.7 / 57.1 it fails, and
**C1 is red until that is fixed**. **BUG-033** — a nice-to-have is now written down as a
requirement on N1, 2 runs in 4, caused by the exact sentence in iteration 3 that stopped the
drop. And `T4-R03`, correct under iterations 1 and 2, is wrong under 3: an accidental gain
given back, recorded on BUG-032 as its strongest lead.

**Checked and not mine:** E1 at 80% and T3 at 85.7% occur in every earlier prompt version.
Verified against the archive rather than assumed.

C1 now derives its coverage: every fixture whose answer key carries requirements is graded or
**declared** to another case, printed in every result file — `T2` among them, *C5, not built*.
Forced to fail by deleting one declaration.


## 2026-09-03 — **BUG-032: the subject is fixed, the card is open, and the provider ran dry**

```
T4:  66.7 / 57.1  FAIL   ->   100 / 85.7  pass          C1: FAIL every run -> PASS
F1:  100 / 100           ->   85.7 / 85.7               F1-R06: right 4 of 4 -> wrong
```

**All three items the card named are fixed** — `T4-R03`, `T4-R05` and `T3-R04` — and T4 was
graded for the first time in its life. The fix was not a new rule. The prompt's own worked
example had said *"the three kinds decided by the ordering above"* for weeks, and **there was
no ordering above**: ten competing bold paragraphs, each added for the case that provoked it,
resolved by salience. Supplying boundary → level → capability, then making the cases defer to
it, then folding 92 lines under it, fixed T4 and stabilised it.

**It cost `F1-R06`**, which BUG-030 spent three iterations recovering — because I filed both
"this is NOT a boundary" guards *inside the boundary step*. Moving them under step 2 got
`T1-R02` back; `F1-R06` did not follow, and restoring its dedicated heading broke T3, so that
edit was reverted and the prompt is byte-identical to `7f9c3916173e` again by hash.

**BUG-035** names the mechanism on its own card for the first time: *a rule that is present,
correct and unambiguous does not apply because of where it sits*. Three confirmations today.

**The next run parked all ten fixtures — the OpenAI balance is empty (BUG-036).** What went
right is most of that story: every run parked with a machine-readable reason, the provider's
message kept beside the code, nothing half-processed, the producer reported no success and the
grader exited non-zero. E7-S4 and BUG-028 earning their keep on a fault nobody staged. What
went wrong is the classification — an exhausted balance is not an *unrecognised* failure, and
it is not self-healing either, so `llm_rate_limited` would be the wrong comfort. That needs a
decision about a closed set.

Also filed: **BUG-033** (a nice-to-have written down as a requirement), **BUG-034** (a thing
already built written down as a requirement — and, added today, the fact that the two
extraction prompts have **diverged on `kind` itself**, so which law applies depends on whether
a requirement came through a contested passage).


## 2026-09-03 — **E8-S1: five numbers, and reading the definition against the SQL found three defects**

```
.\run.cmd review-ui\scripts\query.mjs metrics        every figure, its SQL and its rows
.\run.cmd review-ui\scripts\verify-metrics.mjs       46/46
/metrics.html                                         the same module, no second query
```

M1 98.46% · M2 48.72% · M3 0.217 edits/req · M4 0.31 min median · M5 $0.0003 per approved PRD.

**The method is the point and it paid three times**, all in my own first implementation and all
before anything shipped: M4 grouped by `trace_id` and produced **23 observations for 30
approved versions**; M5 counted its denominator inside the join and got **8** instead of 30;
and M5's join **double-counted** cost for a trace carrying two approved versions. The M4 one is
what `docs/metrics.md` warns about by name — not a mean under a median, but **the right
statistic over the wrong population**, which looks exactly as finished.

**The page and the CLI read one module.** No SQL in `server.js`, none in the page; each
`M*_SQL` appears once and a check fails if a second copy appears. Guardrail pairs are carried
**in the payload**: `allMetrics({c1: null})` makes M2 and M5 come back withheld — the page
draws an em dash rather than a lone number — and leaves M4 alone, forced rather than inspected.

**Two of my own checks were green for the wrong reason.** One asserted a `Set`'s size was at
least one, which is true for any input — a check that could not fail. Both were replaced with
forced versions.

**The numbers are honest about themselves.** M5's $0.0003 is meaningless because **22 of the 30
approved versions were hand-made during verification and cost nothing** — printed as one of the
metric's own rows. M4's magnitude measures a test harness, not a PM. M2 is 48.7% because
`approve_ungrounded` is not `approve`; if that reading changes it becomes 74.4%, and the count
sits beside it.

**Open: the hand-recomputation.** The card's gate is a human recomputing each figure from its
rows. That is Vaibhav's, and the arithmetic is on the decision page.


## 2026-09-03 — **E8-S2: a report whose caveats remove themselves**

```
.\run.cmd review-ui\scripts\verify-weekly.mjs     42/42
WF5 on its own cron -> reports/weekly-2026-08-31.md, with a real narrative
```

**The test that mattered was the caveat disappearing.** Any prose can be added to a report; a
sentence that removes itself when the world changes, with nobody editing anything, is the thing
being built. Both caveats are forced in **both** directions — `baseline_status` set to
`recorded` and the line is gone from the rendered file, not merely from a flag.

**The cron was tested through itself.** n8n's CLI cannot execute against a running instance, so
the schedule was set to fire every minute, WF5 ran, wrote a real report, and the Monday schedule
was restored — with a check asserting `field=weeks` so it cannot be left fast.

**The model named four measures and stated none of their values** on its first live run. That is
what the prompt asks for and what `review-ui/weekly.mjs` enforces: a paragraph carrying a digit,
a `%`, or a spelled numeral is **dropped whole**, and the report ships from SQL either way.

**No metric was re-implemented.** `metrics.mjs` gained an optional window and defaults to
all-time, so the report, the page and the CLI share one definition each — `verify-metrics`
staying at 46/46 through that refactor was part of this story's gate.

**Three things were wrong first, all caught by reading the rendered output rather than the
code:** the uncomfortable numbers were **lifetime totals under a weekly heading**; M3's
numerator was windowed and its denominator was not, so an empty week read `0.000 edits per
requirement` when it meant *no data*; and TC3 measured adjacency as a byte distance and failed
on a report that was correct — the check was the proxy, not the property.


## 2026-09-03 — **the verdicts landed, and the day closed with C1 green and honest**

**BUG-036 (Option A):** `llm_no_credit` joins the closed set, ordered before the rate-limit
clause because the condition arrives as a 429. All three classifier copies together;
`verify-degradation` 76/76; the drill injects OpenAI's real outage body and asserts the exact
code, both rounds, 26/26. **The drill's first run caught a second defect free of charge:** the
review service was still running old code, its copy of the closed set refused the new reason,
and the park recorded *nothing* — the two enforcement points deploy separately, now written
into `docs/contracts.md`.

**BUG-035 spent its three iterations and stopped, per the rule Vaibhav confirmed the same
morning.** The guard move shipped (T1-R02 kept). The attempts to also recover `F1-R06` are a
distribution now, not an anecdote: a fifth headed paragraph destabilises T3 and N1; folding the
case into an existing heading leaves it wrong and puts T1 on its floor. **BUG-030's own
prediction — "I expect BUG-032 can have both" — is resolved against its author**: the section's
prominence is a budget and it is spent. **BUG-037** carries the residual with all four measured
states and the structural candidate (BUG-023's shape: a narrow second call), so nobody re-tries
a wording by accident.

**E8-S3 is closed by the argument the machinery itself supplies.** Recording any baseline flips
`baseline_status`, and the caveat system — built so nobody has to remember honesty — would
remove the illustrative line from every surface at once. A baseline from the person who wrote
the answer keys is weak evidence, and the machinery would propagate it as strong. So: no
baseline, the deck says "unmeasured" with the study that would fix it, and the door stays open
for a clean study. **The absence is the data.**

Prompt state at end of day: `7f9c3916173e`, byte-identical by hash, C1 PASS 3/3 plus its
reversal control.


## 2026-09-03 — **E8-S4: the audit is a command, and telemetry died mid-run without the product noticing**

```
audit-render.mjs        74 fields, each homed or consumed-with-reason; a planted field turns it red
drill-telemetry.mjs     9/9 — control logs 5 calls; drilled runs log 1, then silence; both finish 5/5 grounded
```

**The render/query audit is derived, not typed** — the field list comes from the live payload,
so it grows by itself and fails by itself, and re-running the command IS repeating the audit.
Its first honest run found the one homeless field (`signed_off_at`) and resolved it as a
stated derivation rather than a deletion or a decoration.

**The observability drill turned two intentions into a dated fact** (`docs/traceability.md`):
WF0's telemetry node dialled a pass-through proxy, the proxy was killed after the run's first
logged call, and the run finished `in_review`, 5/5 grounded, indistinguishable from the
control — twice. The four unlogged calls are gone forever, and that is written down as the
price of the rule rather than smoothed over.

**E8 is now four for four** — built or closed by decision — with one human step open: the
hand-recomputation on the decision page.


## 2026-09-03 — **E7-S5: a second opinion that gates nothing** (E7 is done, 5 of 5)

```
verify-judge.mjs             35/35   the sample, the lock, the rules, both controls
verify-judge-isolation.mjs   PASS    76 gate-bearing files, derived; the judge is in none
negative-control-judge.mjs   4/4     plant one in C1.mjs and in metrics.mjs: red, by name
drill-judge-unavailable.mjs  18/18   the judge taken away twice, with an answering control
```

**WF6 sweeps a bounded random sample with Gemini, and nothing waits on the answer.** WF0 now
holds two providers behind one router and **one** classifier — the doer's branch is byte-for-
byte where it was — so a judge failure is classified, costed and recorded exactly like a
doer failure, and there is no path from the judge back to OpenAI.

**Opening a sweep IS the lock**, so two triggers cannot draw the same rows; a sweep that dies
holding it is released after thirty minutes **and the release is recorded**, which stopped
being theoretical when one really did.

**The judge never sees the answer key.** Where it disagrees is computed afterwards by the same
matcher that grades C1, an item the system already flagged is excluded before counting, and
both disagreement rules — >40% in one sweep, or three sweeps in a row — were **forced** and
open a card that weighs the rubric and the labels equally.

**ADR 0001 amended, on a premise change rather than a preference:** `gemini-2.5-flash` is
closed to new keys, so the judge is `gemini-3.8-flash` — pinned, non-reasoning, and the cheap
half of the flash range (3.5 costs double 3.8). Measured, not assumed.

**The honest limit:** the key is free-tier. It answered 8 items today and then the allowance
was gone; `/api/judge` prints the 993 versions and 6,758 requirements nobody has ever judged,
on every page load. Billing on the Gemini key would make nightly sweeps real — a spending
decision, so it is Vaibhav's, and it is on the decision page.

**Filed, not folded in:** **BUG-038** (`check-spine.mjs` has been red since E8-S1 and no story
ran it — the finding is that a verifier a story does not own is a verifier it does not run)
and **BUG-039** (a Gemini rate limit classifies as `llm_no_credit`, because both providers use
Google's and OpenAI's near-identical "check your plan and billing details" wording).

**One small thing for Vaibhav, recorded rather than decided:** CLAUDE.md is **822 words**
against its own stated budget of 750. E7-S5 added two entries that are worth their space (a
call returning `ok` is not a row that changed; a verifier a story does not own is one it does
not run) and one hard rule (no gate reads the judge), and I compressed prose to pay for part
of it — 94 words over became 72. **Raising the number quietly would be tuning a threshold to
output**, which is the one thing this project refuses to do, so it stays over and visible:
either the budget moves to ~825, or two older gotchas retire. Both are your call.


## 2026-09-04 — **E2-S4: what every run costs, and how much the answer varies** (E2 is done)

```
verify-cost-telemetry.mjs   13/13   the row, derived from the schema, and what may not be null
drill-retry-attempts.mjs    12/12   a bad answer retried once; BOTH tries logged; no answer NOT retried
spread.mjs                  3 full produce-and-grade rounds -> evals/results/2026-09-03-spread.md
```

**The attempt column started moving.** `docs/traceability.md` has said since E1 that a call
records `attempt` 1 or 2 and that the attempt-2 rate is the drift signal for a model returning
malformed JSON more often. It could not move: an unparseable answer parked on the spot, and
n8n's node-level retry covers transport only and is invisible to `llm_calls`. WF0 now retries
**a bad answer** once — the same bytes, `attempt: 2`, both attempts writing their own row —
and does **not** retry an auth failure, an empty balance or a rate limit, because asking again
spends money on a condition that cannot pass.

**The spread found something on its first honest run, which is the point of building it.**
T1's recall is **73.3% in one run of three and 93.3% in the other two, against a floor of 80**
— so C1's verdict itself moved (PASS ×2, FAIL ×1) and **no C1 figure may be published without
that range beside it** (docs/reporting.md rules 6 and 7). Filed as **BUG-040**, which also
records the quieter finding: E1's recall is exactly 80.0% in all three runs — resting on its
floor, flagged by nothing, one missed requirement from failing.

**Cost per approved PRD was hand-recomputed and the first attempt disagreed.** Summing per
version gives $0.000506; summing over the 23 *distinct traces* behind the 30 approved versions
gives **$0.009161 / 30 = $0.000305**, which is what M5 prints. The disagreement reproduced the
double-count E8-S1 had already fixed — a hand-check that agrees on the first try proves less
than one that disagrees for a reason you can name.

**Three defects in this story's own new code, each now a check**: `grade.mjs all` is not a
case, so a whole round graded nothing while the loop read the exit code as "a FAIL is a
result" (a round that grades nothing now aborts the spread); the JSON sidecar leaked into the
archive from `verify-grading`'s sub-runs; and `S2-TC7` counted files rather than reports and
saw +2 where it expected +1.


## 2026-09-04 — **E6-S1: what changed, and what merely repeated**

```
verify-delta.mjs             13/13   the id check, the evidence check, and what silence means
check-injection-layers.mjs   PASS    nine model-call builders now
probe-delta.mjs              twice   T1 approved, T2 read against it: churn 0 of 4, both runs
```

**Churn is zero, twice, on the first prompt.** T2 restates four T1 requirements almost word for
word — the pilot date, the CSV export, SAML SSO, row-level scoping — and the delta mentions
none of them. PRD-E6 predicted noise here; there is none yet, and the number is on the record
before anything is tuned.

**All four labelled changes are present; one wears the wrong kind.** T1-R06 (scheduled report:
PDF-only → PDF or CSV, twenty recipients) comes back as `added` rather than `modified`, so it
names no `req_id`. **Recorded on E6-S5's card, not as a BUG card** — the case that grades kinds
is the next story, and filing a defect against a prompt whose grader does not exist yet would
put the fix before the measurement.

**Three decisions are code's, not the model's**: which requirement an item is about (a
`req_id` not in the approved version is rejected and the item thrown away), whether the
evidence exists (every quote located by the citation matcher; an item without it is **dropped
with a reason returned in the answer**), and what silence means (**nothing** — `removed`
requires the document to say so).

**WF3 reads; it does not yet write.** Routing WF1 to it and applying the delta are E6-S2. Split
that way on purpose: the analysis got measured before anything was built on top of it.

## 2026-09-04 — **E7-S6: the sample now reaches the rows the rubric was written for**

```
verify-strata.mjs             23/23   the quotas, the shortfalls, and the rule that moved
negative-control-strata.mjs   6/6     three planted spine breaks, one benign plant, nothing written
verify-judge.mjs              35/35   E7-S5 unchanged
verify-judge-isolation.mjs    PASS    83 gate files, derived — the judge still reaches none
judge-sweep.mjs               #19     1 of 22 scored: the paid tier has not reached the key
```

**The sweep was already sampling. It was not reaching anything.** Twenty-seven requirements had
been judged and **none of them was ungrounded**, against a rubric whose central clause is *"a
flagged-ungrounded item is never a violation."* Ungrounded rows are 108 of 7,072, so a uniform
draw of twenty exercised that clause about once a week, by coincidence.

**Quotas across outcome strata** — `ungrounded` 4, `approved_anyway` 2, `human_edited` 2,
`nonfunctional` 3, `constraint` 3, `uniform` 6. Same 22 calls, same ~$0.03; different rows.

**The engineering is in the rate, not the quotas.** A stratified sample pooled into one number
lets the sampler manufacture its own alarm — over-sample the hard rows and >40% fires on a
draw chosen for difficulty. So a row drawn *because* it is hard never enters the rate, and
**TC7/TC8 vary exactly one thing to prove it**: the same four contradictions on the same four
rows fire the rule as `uniform` and do not as `ungrounded`. Exclusion is by targeted stratum,
never by inclusion of `uniform`, so an unknown row still counts — if it must err, it errs
toward the alarm.

**Two shortfalls, both printed rather than worked around.** `human_edited` drew 0 of 2: every
edit in the corpus is on a `pm_authored` requirement, which the sampler excludes by design
(E4-S6). And **sweep #19 scored 1 of 22** — billing is on the account, but the API key's
project is still on the free tier's daily cap (33 judge calls answered today, then refused).
The sweep now *asks about* four ungrounded rows every time; none has been answered, and
`/api/judge` prints `ungrounded 0 of 108` rather than letting scores imply coverage.

**Filed, not folded in: BUG-041** — `skipped_detail` truncates the provider's message one word
before the metric name, so the record could not say which quota was exceeded and the diagnosis
had to come from counting calls per hour. Sibling of BUG-039.

**E7-S6 stays in `stories/in-progress/`.** Its live-provider criterion is unmet, and a story
whose last check is blocked is not a story that is done.

## 2026-09-04 (evening) — **E7-S6 done: four ungrounded rows, judged for the first time**

```
verify-strata.mjs             23/23   the quotas, the shortfalls, and the rule that moved
negative-control-strata.mjs   6/6     a planted spine break per forbidden column, all red, nothing written
verify-detail-budget.mjs      12/12   BUG-041, checked against the SHIPPED node, with the regression as a control
verify-judge.mjs              35/35   unchanged
judge-sweep.mjs               #23     4 of 4 ungrounded rows answered
```

**The story's last check took four sweeps and a bug fix.** #19–#21 scored 1, 0 and 0 of 22 and
the record could not say why: `skipped_detail` was truncated one word before the metric name.
**BUG-041 fixed, and the very next sweep's stored value settled it** —
`generate_content_free_tier_requests, limit: 20`. Free tier. Billing on an account is not the
API key's project being on the paid tier, and that distinction was invisible for three sweeps.

**The fix's own first attempt shipped a worse bug than the one it fixed.** `bounded()` was
written correctly, verified as standalone JavaScript, and put into the workflow with its `\s`
eaten by the shell — so the node ran `/s+/g` and replaced every letter *s* with a space
(`"plea e check your plan and billing detail ."`). Two of CLAUDE.md's own gotchas at once. The
verifier now lifts the helper **out of the shipped workflow JSON and executes that**, with the
regression reintroduced in memory as its control.

**Then sweep #23 paid for the whole story.** Three of the four ungrounded rows are *"Charts
paint instantly"* against a source that says *"the first chart paints in under two seconds"* —
**the judge corroborated the grounding code, independently, on the rows it flags.** The fourth
went the other way: a constraint the citation matcher could not locate that the judge finds
stated outright — the **first measurement** of the paraphrase-brittleness declared in the
honesty ledger on day one. A false negative, which is the safe direction.

**And nothing moved.** Those rows are excluded from the disagreement rate twice over, by the
defensive rule and by the sampling rule. The monitor's first useful observation changed no
figure and gated nothing.

**BUG-042 filed, major, not folded in:** a partially-answered sweep walks the sample in stratum
order, so it judges one stratum rather than a subset of the draw — sweep #22 scored 8 and all 8
were `uniform`. It quietly un-reaches exactly what this story reached.

## 2026-09-04 (late) — **four decisions delegated, taken with reasons, and acted on**

Vaibhav delegated every remaining decision. Each was decided, the rationale recorded on its
card, and the work done. **One of them overturned my own earlier recommendation.**

**03 — CLAUDE.md, 822 words against its own 750.** I had recommended raising the budget to 825.
**Wrong, and overturned:** the hard rules say *never tune labels or thresholds to output*, and
raising a budget because you exceeded it is exactly that, applied to the document that states
the rule. **Compressed to 750 exactly** — all twelve gotchas kept, two added (BUG-041's
*verify the artefact that ships, not a copy*; E7-S6's *a sample drawn for being hard must
never feed a rate*), one retired. The retirement criterion, now on the record: **a gotcha whose
failure mode a check surfaces on every run is reference, not memory** — the n8n port/host/tag
bullet went to ADR 0010 and `import-workflows.mjs`, which prints `active=` per workflow.

**04 — C1's straddle. Publish the range; change nothing.** The card's investigation was
performed first and it changed the sentence: **`T1-R15` is missed in all three runs** — a
stable known-hard item, a constraint restating an NFR, squarely in the kind-confusion family.
The failing run missed **three more** (CSV export, row scoping, audit log) that the passing
runs got. Same item every time plus three that come and go is **instability**, and the card is
explicit that instability is said out loud rather than chased. BUG-040 closed as *diagnosed and
decided*, not fixed.

**01 — the hand-recomputation.** It asked for a human and I am not one; me checking my own
arithmetic is BUG-001. Closed with the strongest available substitute and **labelled as
exactly that**: `recompute-metrics.mjs` derives all five a second way — raw rows, arithmetic in
JavaScript, no shared SQL — and **6 of 6 agree**. The M5 control recomputes the double-counting
version every run ($0.001608 against $0.0014) so the check can visibly fail. **It found a defect
on its first run — in itself**: M3 "disagreed" by 0.0005 because the checker compared at four
decimals a number published at three. Comparison precision is now derived from the published
value. **What stays open is the half that mattered**: both derivations read the same
definitions, so a wrong definition is agreed on twice. `docs/metrics.md` now says *"two
derivations agree"* and forbids *"hand-verified"*.

**05 — E6 before E9**, unchanged: the delta is the living PRD this project is about, C5 is the
last unbuilt case, and a video demonstrating a delta beats one describing it.

**BUG-042 fixed** the same evening it was filed: the draw stays in stratum order, the *asking*
is shuffled. TC19c reproduces the pre-fix ordering on the same 22 items — 6 strata in the first
8 against 3 — so the fix is measured rather than eyeballed. Live confirmation waits on the next
partially-answered sweep; #24 was refused 22 of 22 and showed neither behaviour.

## 2026-09-04 (night) — **BUG-038 closed, and its runner found four red checks on its first run**

```
.\run.cmd check-all.mjs        45 of 49 passed in 628s
.\run.cmd check-all.mjs --list 49 run · 23 declared not-a-check, with reasons · 0 uncovered
```

The missing `spine-ok` comment was two lines. **The repair was the other half**: one command
that runs every standing check across `n8n/scripts/`, `review-ui/scripts/` and `evals/harness/`,
with a list **derived from the filesystem** — every `.mjs` is either run or declared with a
reason, and a script that is neither fails the run.

**It went red on its first run, four times, on checks no story owned:**

- **BUG-043 (major) — the form door has been shut since 2 September.** It accepts multipart,
  answers `200`, and stores nothing; `Map form input` throws and WF4 has been recording it
  correctly the whole time. *A door that replies before it has stored anything cannot report
  its own failure.* Two days, behind an HTTP 200.
- **BUG-044 (major) — C2's negative control cannot run** since the extraction prompt was
  restructured. It says so itself and exits non-zero, to an empty room. **C2's green has
  demonstrated nothing since 3 September**, and C2 carries the hallucination floor.
- **BUG-045 — `verify-delta` passes alone and fails in company.** Its fixture is whatever the
  previous checks left in the shared database. The judge verifiers already run on a copy; this
  one does not.
- **BUG-046 — one statement of 68 carries the room's example** ("such as weekly on Monday
  morning"). Kind-confusion family; needs a redirect, not a prohibition.

**E6-S2 was started and put back.** Its test plan is written and kept in `stories/backlog/`.
Building a routing story on four red checks would be building on exactly the silence BUG-038
was about — and one of the four is a door that WF1 routing runs through.

**Next: BUG-043**, which jumps the queue at major.

## 2026-09-04 (night) — **BUG-043 closed: the form door was never broken**

```
.\run.cmd review-ui\scripts\verify-doors.mjs   8/8, twice
.\run.cmd check-all.mjs                        47 of 49  (was 45)
```

**The door had been refusing correctly for two days and the checker was filling the wrong
boxes.** n8n binds a form submission by **index** — `field-0`, `field-1` — never by the label a
human sees. `verify-doors` posted four indexed fields, written when the form had four.
**E4-S6 inserted "Who wrote this?" as the third field**, and everything below it shifted by one:
the document text went into the authorship dropdown and the required `Text` field got `''`.
`Map form input` built an envelope with no `doc_type` and no `raw_text`, `Envelope ok?` refused
it exactly as designed, and the form trigger had already answered `200`.

n8n's own execution record settled it in one line: **every field arrived `null`** — keys
present, values empty. (Reading it needed the `-wal` sidecar; a `docker cp` of the `.sqlite`
alone was five minutes stale — BUG-015's lesson, in n8n's database this time.)

**The fix is that the contract is re-read rather than remembered.** `verify-doors` now looks
each label up in the shipped `WF1-ingest.json` and posts to the index the form assigns.
**TC2c is the control**: insert a field in memory and the derived index must move — the exact
move nobody noticed in E4-S6. A renamed label now stops the check *before* it submits and says
which label went missing.

**Two items on the card's own plan were wrong and are corrected rather than dropped.** The
truncated dead-letter message is **not** ours (35 characters against a 300 cap — n8n sends it
that way), and the explicit form `path` is declined as churn against a URL that works.

**What no fix changes:** a form trigger replies before the workflow has stored anything, which
is *why* this hid behind a success. WF4 recorded every failure and the needs-attention queue
showed them — but the door cannot report its own failure to the person submitting.

**E4-S6 shipped green on the verifiers it wrote and never ran the one it had just broken.**
That is BUG-038's finding a second time and more expensively; without `check-all.mjs`, built
the day before, the door would still be shut.

**Remaining from the sweep: BUG-044** (C2's control cannot run — major, next), **BUG-046**
(one statement carries the room's example), **BUG-047** (three controls write into the real
results directory). **BUG-045 is now confirmed intermittent** — red on the first sweep, green
on the second, nothing changed, which is precisely its point.

## 2026-09-04 (night) — **BUG-044 closed: the control runs, and it cannot support its claim**

```
.\run.cmd evals\harness\negative-control-clause.mjs   runs again; 1 assertion fails, honestly
```

**Two defects, and the second was worse than the one on the card.**

It could not find its subject: it matched a bullet **heading** exactly, and the heading is the
part that changed — when `unsettled_positions` arrived, both headings grew a redirect. Anchored
on stable prefixes now, with each prefix required to occur **exactly once** and the span checked
to still carry the redirect it claims to be removing. A control that swaps the wrong text is
worse than one that will not run.

**Then the worse one.** The line proving the swap had reached n8n was scraping the *first*
`prompt_version=` out of `sync-prompts.mjs`'s output — whichever prompt it lists first, not the
extraction prompt. It printed **the same number in both directions**, and neither was the
extraction prompt's. **A figure the case cannot fail on** (BUG-026): had the swap silently
failed to deploy, this control would have reported a clean negative result. It now asserts the
record — the shipped `Build extraction call` node must carry the hash of the file on disk, and
the two directions must deploy **different** prompts. Both pass, and they are what makes the
result mean anything: `7f9c3916173e` then `a7001fa162f1`.

**And then the claim did not survive the repair.** Prompt hygiene moved correctly — FAILS with
the old bullet, naming `T3-R07` and its quote, PASSES restored. But `T3-R07` was **present 3 of
3** with the old bullet back, where it was missed 2 of 3 at prompt `5ad1a07854f1`. BUG-018's
diagnosis is not supported by today's evidence.

**I did not weaken the assertion to make the suite green.** Demoting the statistical half on one
three-run sample, in the session that produced it, is tuning a threshold to output. Filed as
**BUG-048** with the measurement and what it needs: repeat it on other days, then retire the
claim or re-scope the control — on evidence, not this evening. **`check-all.mjs` stays red on
this one check with BUG-048 as its stated reason.** A red with a card is honest; a green bought
by editing an assertion is not.

**Correction on the card**: it claimed this control proves C2 can fail. It does not — it is
BUG-018's control about `T3-R07`. The `FAILED: C2` lines that led me there were stderr from
other scripts interleaved in the same sweep log.

## 2026-09-04 (night) — **BUG-047 closed: the ledger holds only measurements again**

```
.\run.cmd evals\harness\verify-results-hygiene.mjs   3/3, red on a planted caller
evals/results/                                        370 files before and after a full pass
```

Four callers now redirect their grades to a temporary directory, and **the reader follows the
writer** in each. `grade.mjs` has had `--results=` since E2 with a comment saying exactly what
it was for; **one control in four used it.** That is what a convention with no check looks
like, so there is a check now — `verify-results-hygiene.mjs`, which finds the callers by
scanning rather than by a list, and goes red on a planted one.

**Three findings that were not on the card:**

- **`produce.mjs` was declared as a publisher and never calls the grader.** My declaration came
  from a `grep` hit that was a `console.log` printing the command for a human. The check caught
  it on its first run — the argument for a declaration that must keep describing something real.
- **A fifth ungraded call** in `verify-grading`. It writes nothing, but a caller outside the
  rule is how a rule becomes advice.
- **`S2-TC7` was reading ambient state**: it counted files in the real `evals/results/`, so
  *"leaves the earlier one untouched"* passed **vacuously** whenever nothing had been left
  there. It seeds its own baseline now. **BUG-045's shape, in a different file**, found by
  fixing something else.

**And a lesson about the check itself.** Its first version counted any quoted
`evals/harness/grade.mjs`, which made two files that merely *list* the grader look like
offenders. The detector now requires an invocation on the line. **A check that fails on helpful
prose trains people to ignore it.**

**Backlog after tonight:** BUG-046 (the room's example — needs a prompt redirect and a spread,
and C1 is already unsettled), BUG-048 (the clause control's claim), BUG-045, and the older
kind-confusion family. **E6-S2 comes back off the backlog next.**
