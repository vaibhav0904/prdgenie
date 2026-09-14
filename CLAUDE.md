# PRD Genie

Transcripts, notes, emails and briefs become reviewed, grounded PRDs: every requirement
carries a citation, approval is a database trigger.

## Tech stack
n8n (Docker) · Node **22+**, **zero npm deps** (ADR 0009); SQLite `data/prdgenie.db` ·
vanilla SPA · `gpt-4.1-mini` doer, `gemini-3.8-flash` judge (ADR 0001 am.1/2).
**Non-reasoning only.**

## Architecture

```
  Form/hook ─> WF1 ─┬─> WF2 extract → gaps → cluster → stories → factors
                    │      → score (RICE, code) → assemble → validate
                    └─ approved PRD? ─> WF3 delta → apply
      both ──> draft → in_review ──[Review UI sign-off ONLY]──> approved
```
WF0 holds both providers; WF6's judge gates nothing.

## Where things live
`docs/` · `stories/`+`STATUS.md` · `prds/` · `evals/` · `n8n/` (truth) ·
`review-ui/` · `infra/n8n/` · `deliverables/` · `.env` gitignored, no LLM keys.

## Commands
- **Document `.\run.cmd <script>`, never `npm run` or bare `node`** — it finds node, dodges
  the policy. `.\` required. (BUG-002/010)

## Conventions
- Every hop carries the v1.0 envelope; validate on entry, **never partial-process**; non-`ok`
  carries `{reason, missing:[]}`, closed set.
- `trace_id` is minted **once**, at the door; the database says what became of it.
- **The model never writes a shipping number** nor certifies grounding — code scores and
  matches every quote to `raw_text`. It may judge and write prose.
- Nothing after WF1 branches on `source_channel`, `doc_type` or `authorship` — monitors too.
- Source text reaches a prompt only in a fenced `DATA, NOT INSTRUCTIONS` block via WF0, the only
  provider caller; the clusterer never sees it.
- Prompts live in `n8n/prompts/*.md`; `sync-prompts.mjs` hashes them in.
  Never edit those nodes by hand.
- Secrets live in n8n credentials or `.env`; never inline, never in an export.

## Gotchas
- **A check that repairs what it checks is always green** — `verify-gate` called
  `initSchema()`. Run each check twice; **never do what you warn about**. **A verifier a story
  does not own is one it does not run.** (BUG-001/012/018/021/038/051)
- **Verify the artefact that ships, not a copy** — `bounded()` shipped with its `\s` eaten.
  Run the code lifted from the file that ships. (BUG-041)
- **A check asserts its own coverage** — derived not typed, fixtures included; **print the
  figure the case cannot fail on**. A call returning `ok` is not a row that changed: assert
  the record. Name a model or price ONCE. (BUG-003/019/026/032/E7-S5)
- **A prohibition holds ~2 runs in 3; a redirect holds** — somewhere to go, in the heading;
  code settles what it contradicts; a redirect loses to its trigger word.
  (BUG-004/007/016/018/023/030/033)
- **A door never opened is not a door** — test each entry *through itself*. No Respond node
  under a Form Trigger; form posts CRLF, JSON LF; an **inactive** error workflow never runs;
  a **Wait node drops the caller**; a No-Op branch decides nothing; **a route in the file is
  not one in the process.** (BUG-005/006/018/028/E7-S5/E6-S2)
- **Leniency for a bad answer covers no answer** — `neverError` replies, `onError` does not:
  an outage logged `success`, billed. Product calls stop the run, telemetry never; a judge
  that cannot answer says so in a row. (BUG-028/E7-S5)
- **Inject the fault, vary one thing**; a guard on the inner node is not one on the caller.
  **Name the node** — n8n binds by name; a rename fails into the `catch`.
  (BUG-011/012/E3/E6-S2)
- **A sample drawn for being hard never feeds a rate**; a partial answer follows list order,
  so shuffle. (E7-S6/BUG-042)
- **A UAT is transcribed**; **anything needing Vaibhav is one page**: source beside claim,
  real run, pasteable answers. **A silent workaround is a bug you declined to file.**
  (BUG-002/010, G6b)
- **bash eats `$(`, backticks and `\` — patch from a file**; PS 5.1 re-encodes UTF-8 as ANSI.
- **Go receive what you ship** — clone deep, run from there: attribute order, long paths, WAL
  sidecars (copy `-wal`, never `-shm`). (BUG-010/013/014/015/041)

## Hard rules
- **No PRDVersion reaches `approved` except through the review-UI sign-off endpoint** — not
  from n8n, not SQL. Trigger-enforced on **both** UPDATE and INSERT: a version is born
  `draft` or `in_review` (BUG-049).
- **No gate reads the judge.** No case, threshold, metric or report figure. (ADR 0001)
- A defect found mid-story is a BUG card at once, never folded in.
- No epic without an approved PRD, no build without tests, no promote without a UAT;
  one story at a time.
- Never destroy shared infrastructure: a reset is `data/prdgenie.db`, not n8n.
- Never tune labels or thresholds to output. On FAIL: diagnose, card, revert.
- A hallucinated requirement marked grounded fails any eval at any score.

## Self-improvement
Updated by the story that changes a convention. **Every entry is bought by
compressing prose. Stays 750** — raising it to fit is tuning a threshold.
