// Assembly: grounded requirements become a PRDVersion in `in_review`, or the run parks.
//
// The E1 PRD is deliberately a flat requirement list. Epics, features, stories and
// priority arrive in E3 (PRD-E1 non-goals) — structure built before the gate was proven
// would have risked building it twice.

import { randomUUID } from 'node:crypto';
import { tx, get, all, run, logEvent } from './db.mjs';
import { envelope } from './ingest.mjs';

// Closed set, from docs/contracts.md §1. Adding one means editing the contract, which is
// the intended friction.
//
// **What this set governs, and what it does not (BUG-050).** These are the codes a COMPONENT
// answers with, carried on a v1.0 envelope's non-`ok` payload, and every one of them is a run
// that got somewhere and stopped. The codes a DOOR answers with — the caller asked about
// something that does not exist, asked twice, or did not present the key — are a different
// vocabulary and live in `DOOR_REASONS` below. Both are closed; they are deliberately
// disjoint, and `check-reason-codes.mjs` fails if they ever overlap.
//
// Merging them was the obvious fix and it is the wrong one: everything in this set is
// park-able, and a park is a version row. `unknown_version` cannot mint a version to record
// that the version is unknown.
//
// `low_confidence` was removed on 2026-09-05. It was in the set from the day it was written
// and nothing ever emitted it, in any workflow, in any module — a code for a model
// self-reporting its own certainty, which this project forbids on a different page
// (CLAUDE.md: the model never writes a shipping number). A closed set that only ever grows
// is a glossary.
export const REASONS = new Set([
  'envelope_invalid', 'schema_invalid', 'empty_source', 'no_requirements_found',
  'llm_timeout', 'llm_malformed_json', 'llm_unauthorized', 'llm_rate_limited',
  'llm_no_credit', 'llm_error',
  'no_approved_version',
  // E6-S2. A delta that found nothing to change. Not an error and not a failure — the new
  // document simply said nothing about this PRD — but a version whose changelog is empty is
  // a version nobody needs to read, so nothing is minted and the reason says why.
  'delta_empty', 'baseline_not_approved',
  'injection_detected', 'grounding_below_floor',
  // Failures that happen AROUND a component rather than inside one, and therefore only ever
  // reach a dead letter, never a park (E7-S3, docs/contracts.md §1).
  'service_unreachable', 'workflow_error',
]);

/**
 * The subset a PARK may name. A park is a run that stopped honestly and left its work
 * behind; a workflow that threw left no work and no version to attach one to, so these two
 * belong in the dead-letter queue and nowhere else.
 *
 * Kept as a subtraction rather than a second list: a new reason is in scope for parks unless
 * someone says otherwise, which is the direction that fails safe.
 */
export const DEAD_LETTER_ONLY = new Set(['service_unreachable', 'workflow_error']);

/**
 * The second closed set: what a **door** answers when the call itself could not be answered
 * (BUG-050, docs/contracts.md §1).
 *
 * These never travel on an envelope, are never a park and are never a dead letter. They are
 * the reply an endpoint sends and the run stops — the caller named a row that does not exist,
 * asked for something already in flight, tried a transition the state forbids, or arrived
 * without the key.
 *
 * The set exists because fifteen of these were emitted by shipped code and declared nowhere:
 * `verify-routing`'s TC17 found two of them because it asked the delta path, and a check that
 * covers one module is a claim about one module. They are collected here rather than added to
 * `REASONS` for the reason written above that set — everything in `REASONS` is park-able, and
 * a park mints a `prd_versions` row, which is nonsense for "there is no such version".
 *
 * `internal_error` is the one member that is not a refusal: it is the 500 an unhandled throw
 * becomes. It is here rather than in `REASONS` because it is answered by the door with no
 * component behind it, which is the property this set is about.
 */
export const DOOR_REASONS = new Set([
  // the key
  'unauthorized',
  // the caller named something that is not there
  'unknown_version', 'unknown_document', 'unknown_sweep', 'unknown_dead_letter', 'unknown_route',
  'unknown_prd',
  // the caller asked at a moment the state forbids
  'sweep_in_flight', 'sweep_not_in_flight', 'not_in_review', 'already_resolved',
  // the caller left out something the endpoint will not proceed without
  'reason_required', 'ungrounded_requires_override',
  // the product gate said no — readiness is computed, and this is what it answers with
  'signoff_refused', 'items_undecided', 'nothing_to_review',
  // not a refusal: an unhandled throw, answered by the door because nothing else is left
  'internal_error',
]);

/**
 * Validate an assembled PRD version. Deterministic, and callable by the eval harness —
 * which is why it is an endpoint rather than logic inside a Code node (ADR 0004).
 */
export function validatePrd(content) {
  const missing = [];
  if (!content || typeof content !== 'object') return { valid: false, missing: ['content'] };
  if (!content.product_id) missing.push('product_id');
  if (!content.title) missing.push('title');
  if (!Array.isArray(content.requirements)) missing.push('requirements[]');
  else {
    content.requirements.forEach((r, i) => {
      if (!r.req_id) missing.push(`requirements[${i}].req_id`);
      if (!r.statement) missing.push(`requirements[${i}].statement`);
      if (!['functional', 'nonfunctional', 'constraint'].includes(r.kind)) {
        missing.push(`requirements[${i}].kind`);
      }
      if (!Array.isArray(r.citations) || r.citations.length === 0) {
        missing.push(`requirements[${i}].citations`);
      }
      // The model may not set this; by assembly time code must have.
      if (typeof r.grounded !== 'boolean') missing.push(`requirements[${i}].grounded`);
    });
  }
  return { valid: missing.length === 0, missing };
}

/**
 * Readiness, computed from the rows at call time. Never a stored flag — derived state
 * goes stale (docs/contracts.md §4).
 *
 * The floor is "at least one grounded requirement", deliberately not a percentage: any
 * percentage would be a number chosen to make the fixtures pass.
 */
function readiness(requirements, extraction = null) {
  // BUG-004. A document that is not about the product yields nothing, whatever the model
  // listed underneath its own judgement.
  //
  // Three prompt iterations of increasingly explicit refusal language moved G1 — an
  // all-hands about parking permits and a coffee machine — from 16 requirements to 14.
  // That is noise, not a trend, and it is the same shape as BUG-007: **suppression is the
  // wrong kind of instruction.** A model asked to notice something and then say nothing
  // about it will mention it anyway.
  //
  // So the model is no longer asked to withhold. It is asked to NAME what the document is
  // about — a positive act with a required field — and this line decides what follows.
  // Same division as grounding: the model may judge, the code decides. A model that says
  // `concerns_product: false` and then lists fourteen requirements does not get the
  // benefit of the doubt; the judgement wins and the list is discarded.
  //
  // Absent is not false. An extraction with no judgement at all is a schema violation and
  // is rejected upstream, never silently treated as "yes".
  if (extraction && extraction.concerns_product === false) {
    return { ready: false, reason: 'no_requirements_found', discarded: requirements.length };
  }
  if (!requirements.length) return { ready: false, reason: 'no_requirements_found' };
  if (!requirements.some((r) => r.grounded)) return { ready: false, reason: 'grounding_below_floor' };
  return { ready: true, reason: null };
}

/**
 * Write open questions for a version, inside whatever transaction is already open.
 *
 * Shared by the draft path and the park path deliberately: a park that stored its
 * requirements but dropped its open questions would lose precisely the half of a
 * requirement-free document that still had value.
 *
 * `grounded` has no column — it is derivable from the citations' `match_kind`, and a stored
 * copy of derived state goes stale (docs/contracts.md §4). It travels in the version
 * `content`, where the screen that will render it (E4) reads it. No migration here: one
 * structural change per attempt.
 */
function insertOpenQuestions(d, versionId, trace_id, openQuestions) {
  for (const q of openQuestions ?? []) {
    d.prepare(`INSERT INTO open_questions (prd_version_id, trace_id, kind, question, citations)
               VALUES (?,?,?,?,?)`)
      .run(versionId, trace_id, q.kind, q.question, JSON.stringify(q.citations ?? []));
  }
}


/**
 * Write the structure for a version, inside whatever transaction is already open.
 *
 * IDS ARE REWRITTEN, exactly as requirements are: the model's `FEAT-001` becomes
 * `<versionId>-FEAT-001`, because those ids are unique within one response and nothing else.
 * The rewrite happens here, once, so nothing downstream has to remember which namespace it is
 * holding.
 *
 * REQUIREMENT REFERENCES ARE PRUNED, and the pruning is reported. Clustering runs BEFORE
 * assembly, and assembly is where a requirement can still disappear — BUG-007's reconciliation
 * withdraws any requirement the extractor also called an unsettled position. A feature holding
 * a withdrawn id is not a clusterer error; it is two stages disagreeing about a list that
 * changed between them, and the count says so rather than a dangling row saying nothing.
 */
function insertStructure(d, versionId, structure, keptReqIds) {
  const rid = (id) => `${versionId}-${id}`;
  const pruned = [];

  for (const e of structure.epics ?? []) {
    d.prepare('INSERT INTO epics (epic_id, prd_version_id, title, summary) VALUES (?,?,?,?)')
      .run(rid(e.epic_id), versionId, e.title, e.summary ?? null);
  }
  for (const f of structure.features ?? []) {
    const keep = (f.req_ids ?? []).filter((id) => {
      if (keptReqIds.has(id)) return true;
      pruned.push({ feature_id: f.feature_id, req_id: id });
      return false;
    });
    const factors = (structure.factors ?? []).find((x) => x.feature_id === f.feature_id);
    d.prepare(`INSERT INTO features (feature_id, epic_id, prd_version_id, title, req_ids, priority_score)
               VALUES (?,?,?,?,?,?)`)
      .run(rid(f.feature_id), rid(f.epic_id), versionId, f.title,
        JSON.stringify(keep.map(rid)), factors ? factors.priority_score : null);
    if (factors) {
      d.prepare(`INSERT INTO priority_factors (feature_id, reach, impact, confidence, effort, rationale, citations)
                 VALUES (?,?,?,?,?,?,?)`)
        .run(rid(f.feature_id), factors.reach, factors.impact, factors.confidence, factors.effort,
          factors.rationale ?? null, JSON.stringify((factors.citations ?? []).map(rid)));
    }
  }
  for (const st of structure.stories ?? []) {
    d.prepare(`INSERT INTO stories (story_id, feature_id, prd_version_id, as_a, i_want, so_that, acceptance_criteria)
               VALUES (?,?,?,?,?,?,?)`)
      .run(rid(st.story_id), rid(st.feature_id), versionId, st.as_a, st.i_want, st.so_that,
        JSON.stringify((st.acceptance_criteria ?? [])
          .filter((c) => keptReqIds.has(c.req_id))
          .map((c) => ({ criterion: c.criterion, req_id: rid(c.req_id) }))));
  }
  return pruned;
}

function park({
  doc, trace_id, reason, requirements, extraction = null, openQuestions = [],
  unsettledPositions = [], component = 'assembler', detail = null,
}) {
  // A park keeps the work, names the reason, and is visible. It is not an error, and
  // nothing is discarded (docs/contracts.md §3).
  //
  // That matters most on the BUG-004 path, where the requirements being set aside were
  // confidently extracted and correctly cited. They stay here, alongside the model's own
  // statement of what the document was about, so a PM who disagrees with the refusal can
  // see exactly what was refused rather than being told nothing was found.
  const prd_id = `PRD-${doc.product_id}`;
  const content = {
    parked: true,
    requirements,
    open_questions: openQuestions,
    unsettled_positions: unsettledPositions,
    document_subject: extraction?.document_subject ?? null,
    concerns_product: extraction?.concerns_product ?? null,
  };
  // The version id is RETURNED, not just written. A park creates a prd_versions row like
  // any other outcome, and a caller that cannot name it cannot check it: the eval harness
  // recorded `prd_version_id: null` for every park, so C2's refusal rule — which counts
  // requirements on a version — could not recognise a correct refusal and would have failed
  // the case for behaving properly (BUG-017).
  const versionId = tx((d) => {
    d.prepare('INSERT OR IGNORE INTO prds (prd_id, product_id) VALUES (?,?)').run(prd_id, doc.product_id);
    const n = d.prepare('SELECT COALESCE(MAX(version_no),0)+1 AS n FROM prd_versions WHERE prd_id=?').get(prd_id).n;
    d.prepare(`INSERT INTO prd_versions (prd_id, version_no, trace_id, state, content, park_reason, degraded)
               VALUES (?,?,?,?,?,?,1)`)
      .run(prd_id, n, trace_id, 'draft', JSON.stringify(content), reason);
    const id = d.prepare('SELECT prd_version_id FROM prd_versions WHERE prd_id=? AND version_no=?')
      .get(prd_id, n).prd_version_id;
    insertOpenQuestions(d, id, trace_id, openQuestions);
    return id;
  });
  logEvent(trace_id, 'parked', component,
    extraction?.concerns_product === false
      ? `${reason} — document_subject: ${extraction.document_subject ?? '(none given)'}`
      : [reason, detail].filter(Boolean).join(' — '));
  return envelope({
    product_id: doc.product_id, doc_id: doc.doc_id, trace_id,
    component, status: 'needs_review',
    payload: {
      reason,
      missing: [],
      prd_version_id: versionId,
      state: 'draft',
      total: requirements.length,
      requirements_kept: requirements.length,
      open_questions: openQuestions.length,
      unsettled_positions: unsettledPositions.length,
      document_subject: content.document_subject,
      ...(detail ? { detail } : {}),
    },
  });
}

/**
 * Park a run that never reached assembly (BUG-012).
 *
 * There were two park paths and only one of them wrote anything. The assembly park —
 * `no_requirements_found`, `grounding_below_floor` — goes through `park()` above and leaves
 * a version, a reason and an event. **The model-failure park did not reach this file at
 * all**: WF2 tagged the item in a Code node and returned it, so the reason travelled to
 * whoever made the HTTP call and to nobody else. A PM ingesting through the form door saw
 * n8n's completion page, and the document sat in the inbox with no version, no reason and
 * no error anywhere.
 *
 * Both paths returned a correctly-shaped `needs_review` envelope with a valid reason code,
 * so every check that looked at the RESPONSE saw identical, correct behaviour. The
 * difference was entirely in what they persisted.
 *
 * The property this exists to make true, and it is one sentence:
 * **for every `trace_id` that enters the door, the database can say what became of it.**
 *
 * The dead-letter row and the needs-attention queue are still E7-S3's. A park is not a dead
 * letter: it is a run that stopped honestly and left its work behind.
 */
export function parkRun({ doc, trace_id, reason, component = 'assembler', detail = null }) {
  return park({ doc, trace_id, reason, requirements: [], component, detail });
}

/**
 * @param doc            stored SourceDocument
 * @param requirements   grounded requirements (grounding_check has already run)
 */
export function assemble(doc, requirements, traceId = null, extraction = null, openQuestions = [],
  unsettledPositions = [], structure = null) {
  const trace_id = traceId ?? doc.trace_id ?? randomUUID();

  const gate = readiness(requirements, extraction);
  if (!gate.ready) {
    // No draft version is created on this path. A partially-assembled draft from an
    // ungrounded run is the confident-wrong-answer failure the architecture forbids.
    //
    // The open questions still travel: a park names a reason and loses nothing
    // (docs/contracts.md §3). What the room failed to settle is often the most useful thing
    // in a document the extractor could make nothing of.
    return park({
      doc, trace_id, reason: gate.reason, requirements, extraction, openQuestions,
      unsettledPositions,
    });
  }

  const prd_id = `PRD-${doc.product_id}`;
  const content = {
    product_id: doc.product_id,
    title: doc.title,
    source_doc_ids: [doc.doc_id],
    generated_at: new Date().toISOString(),
    requirements,
    // Open questions ACCOMPANY the PRD. They are never an input to readiness and never a
    // reason to park (E3-S4, decided 2026-09-01): the most valuable thing a meeting leaves
    // behind must not be able to stop the document it belongs to.
    open_questions: openQuestions,
    // The same rule, and the same reason, for what the room argued about and never closed
    // (BUG-007). Stored in the version content rather than in a table of their own: the
    // screen that would query them is E4's, and a table nothing reads is a schema change
    // pretending to be a feature. Named here so the limitation is visible rather than
    // discovered.
    unsettled_positions: unsettledPositions,
    // Structure ACCOMPANIES the requirements and never gates them, for the reason open
    // questions do not: a clusterer having an off day must not cost a document the work that
    // was already checked. A PRD with requirements and no epics is a worse document; a PRD
    // held back because the grouping failed is no document at all.
    epics: structure?.epics ?? [],
    features: structure?.features ?? [],
    stories: structure?.stories ?? [],
    unclustered: structure?.unclustered ?? [],
  };

  const check = validatePrd(content);
  if (!check.valid) {
    return envelope({
      product_id: doc.product_id, doc_id: doc.doc_id, trace_id,
      component: 'validator', status: 'error',
      payload: { reason: 'schema_invalid', missing: check.missing },
    });
  }

  // Which requirements actually survived to this point. Clustering ran before BUG-007's
  // reconciliation, so a feature can legitimately name an id that no longer exists.
  const keptReqIds = new Set(requirements.map((r) => r.req_id));
  const pruned = [];

  const versionId = tx((d) => {
    d.prepare('INSERT OR IGNORE INTO prds (prd_id, product_id) VALUES (?,?)').run(prd_id, doc.product_id);
    const n = d.prepare('SELECT COALESCE(MAX(version_no),0)+1 AS n FROM prd_versions WHERE prd_id=?').get(prd_id).n;
    d.prepare(`INSERT INTO prd_versions (prd_id, version_no, trace_id, state, content)
               VALUES (?,?,?,'draft',?)`).run(prd_id, n, trace_id, JSON.stringify(content));
    const id = d.prepare('SELECT prd_version_id FROM prd_versions WHERE prd_id=? AND version_no=?')
      .get(prd_id, n).prd_version_id;

    for (const r of requirements) {
      // E4-S6: a requirement extracted from a document the PM wrote themselves is marked
      // pm_authored, exactly as an edited one is — and is therefore excluded from M1. Being
      // quoted back to yourself is not corroboration, and a grounding rate that counted it
      // would rise for the wrong reason.
      d.prepare(`INSERT INTO requirements
        (req_id, prd_version_id, doc_id, trace_id, kind, statement, subject, stakeholder,
         confidence, grounded, pm_authored, origin_req_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        `${id}-${r.req_id}`, id, doc.doc_id, trace_id, r.kind, r.statement,
        r.subject ?? null,
        r.stakeholder ?? null, r.confidence ?? null, r.grounded ? 1 : 0,
        // spine-ok: stamps provenance onto a row; no stage behaves differently because of it
        doc.authorship === 'first_party' ? 1 : 0,
        // A requirement extracted from a document is the FIRST of its line, so it is its own
        // origin. Only `applyDelta` carries an origin forward from an earlier version.
        `${id}-${r.req_id}`);
      for (const c of r.citations ?? []) {
        d.prepare(`INSERT INTO citations (req_id, doc_id, quote, start_char, end_char, match_kind)
                   VALUES (?,?,?,?,?,?)`)
          .run(`${id}-${r.req_id}`, doc.doc_id, c.quote, c.start_char, c.end_char, c.match_kind);
      }
    }
    insertOpenQuestions(d, id, trace_id, openQuestions);
    if (structure) pruned.push(...insertStructure(d, id, structure, keptReqIds));
    return id;
  });

  logEvent(trace_id, 'draft_created', 'assembler', `prd_version_id=${versionId}`);

  // draft -> in_review. The trigger allows this transition; it is the one into `approved`
  // that no code path but sign-off may make (ADR 0006).
  run("UPDATE prd_versions SET state='in_review' WHERE prd_version_id=?", [versionId]);
  logEvent(trace_id, 'in_review', 'assembler', `prd_version_id=${versionId}`);

  const grounded = requirements.filter((r) => r.grounded).length;
  return envelope({
    product_id: doc.product_id, doc_id: doc.doc_id, trace_id,
    component: 'assembler', status: 'ok',
    payload: {
      prd_version_id: versionId, prd_id, state: 'in_review',
      total: requirements.length, grounded,
      grounding_rate: requirements.length ? grounded / requirements.length : 0,
      open_questions: openQuestions.length,
      unsettled_positions: unsettledPositions.length,
      epics: structure?.epics?.length ?? 0,
      features: structure?.features?.length ?? 0,
      stories: structure?.stories?.length ?? 0,
      // Never a bare count of what worked. A requirement in no feature and a reference to a
      // withdrawn requirement are both things a reader has to be able to see.
      unclustered: structure?.unclustered?.length ?? 0,
      req_refs_pruned: pruned.length,
      review_url: `http://localhost:${process.env.SERVICE_PORT ?? 3000}/review/${versionId}`,
    },
  });
}

export function getVersion(versionId) {
  const v = get('SELECT * FROM prd_versions WHERE prd_version_id=?', [versionId]);
  if (!v) return null;
  const reqs = all('SELECT * FROM requirements WHERE prd_version_id=?', [versionId]);
  for (const r of reqs) {
    r.grounded = Boolean(r.grounded);
    r.citations = all('SELECT quote, start_char, end_char, match_kind FROM citations WHERE req_id=?', [r.req_id]);
  }
  return { ...v, content: JSON.parse(v.content), requirements: reqs };
}
