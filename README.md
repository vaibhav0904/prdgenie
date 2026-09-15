# PRD Genie

**Meetings become requirement documents you can check, sentence by sentence.**

You paste a transcript, your notes, or an email into a form. Out comes a list of requirements,
and beside every one is the sentence somebody actually said — which you can click. Everything up
to that point is the AI's draft. Nothing after it happens without a person: you check each line,
you sign, and only then is the document approved. When there is a second meeting, it does not
write a second document. It updates this one.

I built this because the tools that already do this lose their users in about three weeks.

---

## The problem I was actually solving

There are plenty of tools that turn a meeting into a requirements document. Week one they save
you an hour. Week three people quietly stop opening them. The reason is always the same: one
line in the document was never said in the meeting. Once that happens once, you have to read the
transcript anyway — and the tool has become a slower way to do the job you were already doing.

So the expensive part was never the typing. It is **knowing who asked for what, and what exactly
they said.** Three specific costs sit underneath that:

- **Reconciliation.** Three sources say overlapping, partly contradictory things, and missing one
  contradiction ships a defect into the sprint.
- **Attribution.** Two weeks later an engineer asks "why is this a requirement?" and you either
  remember, re-read, or guess.
- **The second meeting.** Follow-ups do not produce a new document; they change an existing one.
  Doing that by hand is why requirement documents go stale instead of getting updated.

This project takes the position that a generated requirement is worthless unless the person
reading it can verify it in one click, and that no amount of model quality substitutes for that.

---

## How it works

```
  Form / webhook ─> WF1 ─┬─> WF2  extract → gaps → cluster → stories → factors
                         │        → score (RICE, in code) → assemble → validate
                         └─ approved PRD already exists? ─> WF3  delta → apply

      both ──> draft → in_review ──[ Review UI sign-off ONLY ]──> approved
```

Five ideas carry the whole design:

**1. Code checks the citations, not the model.** Every requirement carries a quote. A
deterministic matcher looks for that quote in the source text, character for character. If it is
not there, the requirement is flagged amber and says so instead of hiding it. **96.91% of 8,763
stored requirements have their exact sentence**; the rest are marked, not silently kept.

**2. Approval is a database trigger, not a convention.** No version can reach `approved` except
through the review UI's sign-off endpoint — not from n8n, not from SQL, not from me. The trigger
guards both `UPDATE` and `INSERT`, so a row cannot even be *born* approved. There is a script
that tries to go around the whole application and prints the trigger's own refusal:

```
.\run.cmd review-ui/scripts/prove-the-gate.mjs
```

**3. The model never writes a shipping number.** RICE scores are arithmetic in code. A second
model from a different vendor judges quality after the fact and **gates nothing** — no
threshold, no test, no figure on any slide reads the judge. A grader that is also the doer is
marking its own work.

**4. Source text is data, never instructions.** Anything that reads a stranger's text and acts on
it needs this. Meeting text reaches a prompt only inside a fenced `DATA, NOT INSTRUCTIONS` block,
through the single workflow that is allowed to call a provider. A transcript with three hidden
prompt injections in it gets **zero of three obeyed**, and the document stays waiting for a
person.

**5. The second meeting produces a change list.** Added, modified, contradicted — with the
document's sentence and the room's new sentence on screen together, each linked to its own
source. The old version is never edited and never lost.

---

## Honest limitations, before you go looking for them

- **No authentication and no multi-tenancy.** Anyone who can reach `localhost:3000` can approve a
  document, and every approval is recorded against one hardcoded reviewer. The gate proves the
  *pipeline* cannot approve anything. It proves nothing about *who* the approving human is.
- **Extraction passes two runs in three, not three.** Run the eval three times and one fixture
  drops below its floor about one run in three. It is filed (BUG-068) rather than fixed by
  lowering the floor, because tuning a threshold to make a run pass is how a number stops meaning
  anything.
- **The change list is not yet under test.** In one week it missed a real contradiction once and
  invented one once. The case that would catch it is named in the eval README and not built.
- **No baseline.** Nobody hand-wrote one of these documents and timed it, so there is no
  "hours saved" figure anywhere in this repository. A comparison against a number I made up is
  worse than no comparison.

**24 open bug cards**, all written down in `stories/backlog/`. None were folded into a story to
make a run look finished. Everything this project does *not* claim is in one place:
[`docs/assumptions.md`](docs/assumptions.md), biggest gap first.

---

## Run it yourself

Twenty minutes, on your machine. You need Docker, Node 22+, and your own OpenAI and Gemini keys,
which you type into n8n once — **there are deliberately no model keys in this repository**, and
none in `.env` either.

- **[`deliverables/RUN-IT-YOURSELF.md`](deliverables/RUN-IT-YOURSELF.md)** — setup in order, then
  the demo in the order it is worth seeing.
- **[`deliverables/SETUP.md`](deliverables/SETUP.md)** — the same thing when n8n is hosted (n8n
  Cloud, or a server), including a one-command deploy through the n8n API.

On Windows it is two double-clicks: `1-START-HERE.cmd`, then `2-SET-UP-THE-DEMO.cmd`.

**Before you clone, on Windows:** `git config --global core.longpaths true`. The story cards have
descriptive filenames — the longest path here is 103 characters — and Windows' 260-character
limit means a clone into a deep folder fails at checkout with `Filename too long`. A target under
about 150 characters works without the setting (BUG-083).

```
.\run.cmd                             preflight: Node, sqlite, .env, both services, all five doors
.\run.cmd evals/harness/grade.mjs C6  what the system refuses to do
.\run.cmd check-all.mjs               every standing check, one verdict
```

---

## How I know it works

- **The answer key was written by hand first.** Ten meetings for a fictional analytics product,
  labelled before the model ever ran, and never edited to make a test pass. They ship, in
  `evals/datasets/`, so every number on every slide can be recomputed by you.
- **73 automatic checks run in one command.** 32 of the 51 checkers have a *negative control* — a
  script that breaks the thing on purpose and requires the checker to go red. A check that has
  never failed has not been tested. **19 checkers still have no control**, and they are named on
  every run rather than quietly counted as passing.
- **Nothing here was tuned to output.** On a failing check the rule is diagnose, write a card,
  revert. `CLAUDE.md` is the constitution the whole build ran under, and it is in the repository
  because a rule you cannot check is a preference.

---

## The deck and the film are generated too

Both the nine-slide deck and the six-minute demo video in this project are **produced entirely by
AI, end to end** — the slides, the script, the voiceover and the footage. My part was review:
checking the content, going through the script, and watching the final cut. That is not a
footnote; it is part of the point.

**Watch it:** [the demo film](https://vaibhav0904.github.io/prdgenie/deliverables/deck/prd-genie-demo.mp4) (6:25), and click through [the nine slides](https://vaibhav0904.github.io/prdgenie/deliverables/deck/presentation.html)
it was made from — both open in the browser. The files are in [`deliverables/deck/`](deliverables/deck/).

- The deck is not a slide file. It is [`deliverables/deck/slides.mjs`](deliverables/deck/slides.mjs)
  — one source that builds both the presentation and the presenter's run sheet, with a guard that
  refuses to publish if a count on a slide disagrees with what is actually in the repository.
- The film is generated from that same run sheet by a sibling project,
  **[prdgenie-video](https://github.com/vaibhav0904/prdgenie-video)**: a synthetic narrator reads
  the presenter's lines, and a headless browser drives the *live application* to film every
  product moment. Nothing is screen-recorded by hand and nothing on screen is a mock-up.
- Because the deck is the single source for both, the narration cannot describe a button the
  screen does not have. The one time it tried, that was a bug with a card.

The whole application was built the same way: one story at a time, a test plan before any code,
and every defect found mid-story written up as its own card instead of being folded into the
work. **115 stories done, 10 recorded decisions, 67 bug cards closed, 24 open.** The record is in
[`stories/`](stories/) and [`stories/STATUS.md`](stories/STATUS.md), including the parts that went
badly.

---

## Where things live

| | |
|---|---|
| The rules the build ran under | [`CLAUDE.md`](CLAUDE.md) |
| Architecture, and why | [`docs/architecture.md`](docs/architecture.md) · [`docs/adr/`](docs/adr/) |
| Every simplification, biggest first | [`docs/assumptions.md`](docs/assumptions.md) |
| The AI product principles behind it, each linked to where it is enforced | [`docs/ai-product-principles.md`](docs/ai-product-principles.md) |
| Metrics, each with the SQL that computes it | [`docs/metrics.md`](docs/metrics.md) |
| The problem, and the shape of the answer | [`deliverables/problem-and-approach.md`](deliverables/problem-and-approach.md) |
| Program charter | [`deliverables/program-charter.md`](deliverables/program-charter.md) |
| The workflows, credential-free | [`n8n/workflows/`](n8n/workflows/) |
| Prompts — the source of truth, hashed into the workflows | [`n8n/prompts/`](n8n/prompts/) |
| Fixtures and their labels | [`evals/datasets/`](evals/datasets/) |
| The nine slides, live | [open the slides](https://vaibhav0904.github.io/prdgenie/deliverables/deck/presentation.html) · source: [`deliverables/deck/slides.mjs`](deliverables/deck/slides.mjs) |

**Stack:** n8n in Docker for orchestration · Node 22+ with **zero npm dependencies** · SQLite via
`node:sqlite` · a vanilla-JS review UI, no framework · `gpt-4.1-mini` as the doer and
`gemini-3.8-flash` as the judge, both non-reasoning by decision (ADR 0001).

**The data is invented.** ForgeSight, NeuronForge, Northwind, Meridian and everyone in the
transcripts are fictional. No real company, no real person, no real meeting.

---

Built by [Vaibhav Saraf](https://github.com/vaibhav0904). MIT licensed — see [LICENSE](LICENSE).
