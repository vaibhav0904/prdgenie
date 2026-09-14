# E5-S3: Three documents, one PRD

**As a** PM
**I want** to hand over the transcript, the email thread and my own brief at once and get one document back
**So that** reconciling three sources is the system's job, which is the job I actually have

## Acceptance criteria

- [ ] One ingest accepts **several documents** and produces **one** PRDVersion drawing on
      all of them (decided 2026-09-01).
- [ ] Each document keeps its **own `doc_id`**; each citation names the document it came
      from; the run carries **one `trace_id`** across all of them, because a `trace_id`
      names a run through the pipeline and one ingest is one run.
- [ ] `prd_versions.content.source_doc_ids` lists every contributing document.
- [ ] Clicking a citation opens the **correct** source document in the pane (E4-S2).
- [ ] A run of three documents of three different types produces citations resolving into
      three different `doc_id`s — verified by clicking, not by reading the JSON.
- [ ] One document failing to ingest does not silently drop it from a run that then looks
      complete: the version records what it was built from, and a missing source is visible.

## Depends on
- E5-S2, E4-S2

## Eval gate
- **C1** per document type (E5-S4). **C3** (E3-S5) re-run: `source_doc_ids` is new structure
  and every link must still resolve.

## Technical notes

- **This is the schema-affecting decision, which is why it was settled before building.**
  One trace across several documents, rather than several traces joined to one version,
  keeps `trace_id`'s meaning intact — it has always named a run, and `source_documents`
  already permits several rows to share one.
- **Accretion is explicitly not built here.** A version growing as documents arrive over
  days is a real feature and it overlaps E6's delta machinery; it should reuse that, not
  duplicate it. Building both mechanisms would leave two ways to add a source to a PRD and
  no reason to prefer either.
- Deduplication is a non-goal (PRD-E5): ingest the same email twice and you get it twice.
  Say so in the Outcome rather than half-solving it.
- The demo value here is high and worth protecting: reconciliation in one gesture is the
  single most convincing thing this system does, and it is what E9's video should show.

---

## NOT BUILT — 2026-09-03. The design, and why it was not half-built

E5-S1, S2 and S4 shipped; this one did not. **It is the only story in the epic that needs a
change to how WF2 is shaped**, and shaping it wrong would put a green four-case spine at risk
for a partially-working feature.

### What it actually requires

The spine has two kinds of stage, and multi-document splits them:

| Stage | Runs |
|---|---|
extract, ground, detect gaps | **once per document** — each citation must resolve into its own `raw_text` |
cluster, stories, factors, assemble | **once per run** — over the union, producing one version |

n8n fans out naturally on items, so the per-document half is close to free: `Fetch document`
returns N items and the stages after it run N times. The per-run half then needs a collecting
node, and the five generated Build nodes need `$('Node').item` rather than `.first()` — they
currently take the first item, which is correct for one document and silently wrong for three.

**The awkward part is the `About the product?` branch** (BUG-019). It is per document, and its
false side currently jumps to the assembly body — which, after collection, is downstream of a
node that has not run yet for the other documents. That is the piece that needs designing
rather than typing.

### The service half, which is the part that must be right

- one ingest, N documents, **one `trace_id`** — a `trace_id` names a run, and one ingest is
  one run;
- each document keeps its own `doc_id`, and each citation grounds against **its own**
  `raw_text` (the grounding call is already per document, so this falls out);
- `prd_versions.content.source_doc_ids` lists every contributing document;
- a document that fails to ingest is **visible**, not silently dropped from a run that then
  looks complete.

### Why it is a card and not a half-finished path

A multi-document path that assembles one version per document, or drops the third source
quietly, is worse than not having one — it would look like the feature and would put a
wrong `source_doc_ids` in front of a PM. **The deck can honestly say "one source per run
today"; it cannot honestly say "three sources, one PRD" while the third is dropped.**

Sequenced after E6, which needs the same per-document fan-out for delta analysis and would
pay for the design twice if this were built first in a different shape.
