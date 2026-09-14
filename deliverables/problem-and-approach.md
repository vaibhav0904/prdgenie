# The problem, and why an agent is the right shape for it

**Vaibhav Saraf · 2026-09-01**

*Written against a fictional company, NeuronForge Technologies, whose analytics product
ForgeSight is the subject of every fixture in this repository. No real company, no real
person, no real transcript.*

## The pain point, specifically

The usual complaint is that PMs lose time to meetings, and to turning those meetings into
documents. That is true but too broad to build against. The specific, expensive step is this:

> **A PM leaves a 60-minute requirements call holding a transcript, three Slack threads
> and a stakeholder's write-up, and must produce a PRD that an engineer can build from —
> where every line survives the question "who asked for this, and what exactly did they
> say?"**

The typing is not the expensive part. The expensive parts are:

1. **Reconciliation.** Three sources say overlapping, partly contradictory things. Finding
   the contradictions is manual, and missing one ships a defect into the sprint.
2. **Attribution.** Two weeks later an engineer asks "why is this a requirement?" and the
   PM either remembers, or re-reads the transcript, or guesses.
3. **The second meeting.** Follow-ups don't produce a new PRD; they change an existing
   one. Today that is a manual re-read of the whole document against a new transcript,
   which is why PRDs go stale rather than getting updated.
4. **Knowing what was *not* decided.** The open questions from a call are the highest-value
   output and the first thing lost, because nobody writes down a thing that didn't happen.

Three agentic-AI opportunities exist across this workflow — requirement extraction,
prioritization support, and delta maintenance of a living document. **Extraction with
verifiable attribution is the one to build first**, because the other two are worthless
without it: a prioritization built on requirements nobody trusts is a ranked list of
guesses, and a delta against an untrusted document compounds the problem.

## How an agentic solution addresses it

The loop, stated as perceive → plan → act → learn:

- **Perceive.** Ingest any of four document kinds through one door; normalize to one
  canonical shape so the pipeline never branches on where text came from.
- **Plan.** Decompose into judgment steps that are each small enough to be checked:
  extract requirements → flag ambiguities → cluster into epics and features → draft
  stories → extract prioritization factors.
- **Act.** Assemble a PRD, and stop. The agent's authority ends at `in_review`.
- **Learn.** Every human decision — approve, edit, reject, with a reason — is stored. That
  is the training signal for prompt iteration and the measurement of whether drafts are
  getting better.

The design decision that matters most is **where automation stops**. This is an *augment*,
not an *automate*: the agent does the reconciliation and the typing, which are mechanical
and which it is good at; the human does the deciding, which is judgment and accountability.
That boundary is enforced in storage rather than in policy — a PRD reaches `approved` only
through a human sign-off, and a database trigger refuses every other path, including the
pipeline's own.

The second decision that matters: **every requirement carries a verbatim quote from its
source, and code — not the model — checks that the quote is really there.** A requirement
whose quote cannot be found is marked ungrounded and badged in the review UI. This turns
"trust the AI" into "click the citation", which is the difference between a tool a PM uses
in week three and one they quietly abandon.

## Inputs and outputs

**Inputs:** meeting transcripts; raw PM notes; email threads; stakeholder feature
write-ups. English, plain text, up to ~15k characters. Explicitly not: audio, PDFs,
images, other languages.

**Outputs:**
- A **PRD version** — problem, goals, non-goals, epics → features → stories with
  acceptance criteria.
- **Requirements**, each with kind, stakeholder, confidence, and one or more citations.
- **Open questions** for the PM: conflicts between stakeholders, things asked and never
  answered, and non-functional categories the sources never covered.
- **Prioritization**: model-extracted reach/impact/confidence/effort per feature, with a
  RICE score computed in code — the model supplies judgment, never arithmetic.
- **A delta**, when a follow-up document arrives: what was added, modified, or
  contradicted, with quotes from both the old PRD and the new source.

## Risks

**Ethical.** Meeting transcripts contain people talking candidly; they are among the most
sensitive artifacts a company holds. Contact details and external customer names are
redacted at the door, before storage, and nothing leaves the machine except the model
calls themselves. Internal stakeholder names are deliberately *kept*, because "Priya asked
for this" is the attribution that makes a requirement reviewable — a trade-off recorded
openly rather than resolved silently. A second ethical risk is quieter: a PM who trusts a
generated PRD stops reading transcripts, and the stakeholders whose points the model
consistently drops stop being represented at all. Grounding rate and edit rate are
monitored partly to make that visible.

**Technical.** Three, in order of likelihood. *Plausible-but-wrong requirements* — the
failure mode of any LLM, addressed by code-checked citations and by an automatic eval
failure for any requirement marked grounded whose quote is absent. *Prompt injection* —
this system reads other people's text and writes a document a team builds from; defended
in three layers (delimited data blocks, closed output schemas with nothing an instruction
could usefully set, and an output tripwire) and measured at a 100% floor against labeled
payloads. That figure describes three known payloads and is not a general safety claim.
*Silent quality drift* — prompts change behaviour without code changing, so every model
call logs the prompt version.

**Organizational.** The largest risk is not technical. A PM who feels evaluated by "edits
per requirement" will stop editing. The metric exists to measure the *draft*, and it is
deliberately paired with cycle time so that rubber-stamping shows up as both numbers
falling together rather than as a success. Beyond that: adoption depends on the tool
producing something a PM would have written anyway, so the pilot measures accepted-unedited
rate before it measures time saved — and **no time-saved claim is made at all** until a
real baseline exists, because the only PM available for this pilot has already seen the
test data.
