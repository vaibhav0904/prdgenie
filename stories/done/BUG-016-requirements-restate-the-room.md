# BUG-016: Requirements restate what was said instead of specifying what to build

**Found by:** Vaibhav, E1-S4 / E1-S6 Part 2, 2026-09-02 — *"Would you put this wording in a
PRD?"* → **"Needs rewriting."**
**Severity:** major — the citations are sound and the statements are not, which means the
one part a PM reads is the one part nobody has checked

## Repro

Generate a PRD from T1 and read the `statement` fields on their own, without the source
beside them, the way anyone reads a PRD.

## Expected / Actual

Grounding is fine. Recall is fine. The prose is not. Six failures, all from one run:

| Model | Label | What is wrong |
|---|---|---|
| "…in under two seconds on **our** largest customer account." | "…on the largest customer account **(Northwind)**." | Speaks in the room's first person, and drops the identity Marcus supplies one line later. |
| "Data refreshes hourly, **flat, not as a minimum**, for the pilot." | "…hourly, flat — **not streaming, and not stated as a minimum interval**." | Meeting shorthand. Means nothing to an engineer reading cold. |
| "…an audit log **that can be handed over**." | "…handed **to a customer's security review**." | Purpose clause truncated. Handed to whom? |
| "…on a recurring schedule, **such as weekly Monday morning**." | "…on a recurring schedule." | An example from the room promoted into the specification. |
| "A user can share a **filtered dashboard view via a shareable link** that preserves the filters." | "A user can share **a link to a dashboard** that preserves the filters currently applied to it." | Circular — defines sharing by sharing. |
| "**Access** is scoped by role…" | "**Data access** is scoped by role…" | Subject dropped; access to what. |

## Root cause

**The model restates the sentence that was spoken. It does not write the requirement that
sentence implies.** Every one of the six is the transcript with light grammatical tidying —
deixis intact, shorthand intact, examples intact, resolved referents left unresolved.

Worth naming the likely cause, because the obvious fix would break something valuable:
**the extraction prompt asks for a statement and a verbatim quote in the same breath.**
Staying close to the source wording is the cheapest way to make the quote resolve. The
prose defect is plausibly a *side effect of the grounding guarantee* — the thing that makes
the system trustworthy is pressing the thing that makes it readable.

## Why it matters more than it looks

**Every automated check in this project passes on this output.** The grounding check
compares the *quote* to `raw_text`, not the statement. C1 matches by span overlap, so
wording is invisible to it. C2's three auto-fail rules are about invention, PII and
refusal. There is no test anywhere that reads a statement as English — and the statement is
the only field a PM actually reads.

That is why it took a human answering "would you put this in a PRD" to find it, and why the
answer to that question has to stay in a UAT.

It also lands on the metric that matters most: **M2, accepted-unedited rate**, the proxy for
whether this saves a PM any time. A requirement that is correct, grounded, and phrased
wrong still gets edited. The system would be scored as low-value for a reason that is not
about accuracy at all.

## Fix — not yet applied

The load-bearing point: **`statement` and `citations` are two different artifacts and the
model is conflating them.** The quote is evidence and must be verbatim. The statement is
the model's own prose and is *free to differ* — nothing in the grounding check requires
them to resemble each other. The system already supports this; the prompt does not ask for
it.

Candidate fix, in order of preference:

1. **Say it in the prompt, with the contrast made explicit**: the quote is copied, the
   statement is written. Resolve pronouns and referents against the document. Drop examples,
   hedges and meeting shorthand. Name the subject.
2. **A house style stated once** rather than per-rule: present tense, active, one testable
   claim, no first person, no "such as".
3. If neither holds, a **second pass** that rewrites statements only — but that costs a
   model call per requirement and cannot be allowed to touch citations.

Do not fix this by relaxing the citation requirement.

**Re-run when:** C1 (wording changes can move span overlap), C2, and E1-S4's Part 2
judgement, which is the only check that can see this at all.

## Lesson

**Everything that could be checked automatically was, and the one field a human reads was
the one field nothing read.** The project's instinct — code decides, the model never
certifies itself — built rigorous machinery around grounding, structure and scoring, and
left the prose to whatever fell out.

A guarantee is not the same as a deliverable. This system can prove every sentence is true
and still hand over a document nobody wants to use.

## Progress — 2026-09-02, and where it stops

**The fix applied (candidate 1 + 2 from this card, together):** a new prompt section stating
the contrast once — *the quote is copied, the statement is written* — followed by a house
style in one place. `47ac49c6330b` → **`4da5ffb95e7d`**.

**Every example in that section is invented.** The first draft used the six real defects,
which are near-verbatim T1 text — the exact contamination BUG-018 was filed about. Caught
before syncing.

### What moved, three runs

| | Before | After |
|---|---|---|
| Statements copied verbatim from the source | **54.7%** | **14.5 / 14.3 / 14.5%** |
| First-person statements | 2 | **0 / 0 / 0** |
| Promoted examples | 1 | **1 / 1 / 1** |
| T1 recall | 86.7 / 86.7 / 80.0 | **80.0 ×3** — exactly on the floor |
| T1 precision | 81.3 / 92.9 / 92.9 | **92.3 ×3** |

Of Vaibhav's six: **two fixed, one improved, three unchanged.** C1 and C2 pass 3 of 3.

### Two failures, neither hidden

- **The promoted example survives all three runs**, identically. The prompt addresses that
  exact case with an invented parallel and the model appends the example anyway. **This is
  the fourth time this project has measured what a prohibition is worth**, and no fifth
  wording is being attempted.
- **T1 recall is exactly 0.80.** Read one by one, two of the three misses predate this change
  entirely, and one of those is a permanent tax: `T1-R02` is extracted correctly and scored
  `wrong_kind` in **all six runs measured**, because the prompt's tie-break calls a platform a
  `constraint` and the key says `nonfunctional` — **BUG-022**, filed, no recommendation
  attached.

### Blocked on Vaibhav — and this card cannot close without it

The mechanical half is done and controlled both ways. The half that found this bug in the
first place is a judgement, and it goes back on a page:

**https://claude.ai/code/artifact/6cb7a848-5172-4eda-8863-b065695be2f1**

Two questions on it. Neither is rhetorical:

1. **Is "Monday morning" an example, or the requirement?** The transcript says thirty-odd
   tickets ask for the Monday report *"before their own leadership meeting"*. The label calls
   the timing an illustration. **The model may be reading the room more literally than the
   answer key does.**
2. **Keep this change, or revert it?** It buys prose and precision and costs the last of T1's
   recall margin.

### Lesson so far

**A number comfortably above its floor hides everything that is losing it points.** T1 recall
sat at 86.7% for weeks carrying a permanently unmatchable label and a deadline it never
found. It took an unrelated change pushing the figure to exactly 0.80 for anyone to read the
misses one by one — which took ten minutes and produced a bug card.

---

## CLOSED — 2026-09-02

**Vaibhav delegated the judgement half** — *"You decide please. Move with your suggestion."*
**Decision: this wording goes in a PRD now.**

| His six defects | |
|---|---|
| first person | **Fixed** |
| meeting shorthand *"flat, not as a minimum"* | **Fixed** |
| promoted example *"such as weekly on Monday morning"* | **Fixed** — by a redirect, after four prohibitions failed |
| truncated purpose *"handed over"* | **Improved** — recipient named, purpose not |
| circular sharing definition | **Unchanged — known limitation** |
| *"Access"* with no subject | **Unchanged — known limitation** |

Also: copied-verbatim **54.7% → ~16%**, first person **0 ×3**, promoted examples **0 ×3**,
and T1 precision **100%** — the first clean extraction in the project's history.

**The two survivors have an owner, not a footnote: E4-S1 is amended** to persist and render
the `subject` field and to re-test both statements against it. The hypothesis is written
there so it can be wrong.

**This card closes on a judgement, not a measurement**, and that is said plainly because
every other claim on it is measured. There is no gate for prose; another prompt iteration
would be tuning until it looks better, and both remaining defects are already named in the
prompt with worked examples that did not take twice.

**What it cost:** two statements ship reading wrong until E4, and M2 will carry those edits
when E8 measures it. That is the right place for them to appear.

---

## The two limitations are permanent — 2026-09-03, tested rather than assumed

This card closed on a judgement with two defects standing and an explicit undertaking about
where they would be picked up. **They were picked up, and the answer is no.**

**BUG-027 stored the `subject` field** — required by the extraction schema since E1-S4 and
discarded until now — which made the one written-down hypothesis testable for the first time:

> *"Access must be scoped by role…"*  ·  `subject: row-level access control`

**The hypothesis was right.** The missing words were in the model's own answer, one field
away. So the redirect this card called for was written, in the shape that has worked twice,
and **it moved the statement in 1 run of 3, by one word** (*"Access control must be…"*).
Reverted; C1–C4 green afterwards.

**Three prompt attempts across two cards. A fourth is not the answer.**

So the honest statement, which replaces the hopeful one:

> **This system writes a requirement that occasionally needs its subject put back by a
> person.** The circular definition is a second, unrelated failure — its subject field is
> perfectly reasonable — and nothing has been shown to move it either.

That is what the review screen's edit control is for. An edit costs a reason, marks the
requirement as the PM's own words, and takes it out of the grounding rate — so the correction
is cheap, recorded, and cannot flatter the numbers.

**The field became a feature when it failed as a fix:** every statement now renders with its
subject beneath it, so the gap is visible in the place where it can be fixed in one click.
