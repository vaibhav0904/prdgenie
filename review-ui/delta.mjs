// THE DELTA (E6-S1): what a new document changes about a PRD that is already approved.
//
// The model proposes; this file decides. Three decisions live here and none of them is the
// model's:
//
//   WHICH REQUIREMENT   `req_id` is the link between a delta item and the PRD, and a link is
//                       not something a model may invent. An id that is not in the approved
//                       version is REJECTED and the item is thrown away (PRD-E6 decision 5).
//   WHETHER THE EVIDENCE EXISTS  every quote from the new document is located in `raw_text`
//                       by the same matcher a citation goes through. An item whose evidence
//                       cannot be found is DROPPED WITH A REASON — not kept and flagged,
//                       because a delta item is a proposal to change an approved document.
//   WHAT SILENCE MEANS  nothing. A requirement the document does not mention produces no
//                       item of any kind (PRD-E6 decision 2).
//
// Nothing here writes a version. Applying a delta is E6-S2; this is the reading.

import { all, get, tx, logEvent } from './db.mjs';
import { locate } from './grounding.mjs';

/** The kinds, closed. A fifth kind is a decision, not a field. */
export const DELTA_KINDS = ['added', 'modified', 'contradicted', 'removed'];

/** Kinds that name an existing requirement. `added` names nothing — that is what makes it added. */
const NAMES_A_REQUIREMENT = ['modified', 'contradicted', 'removed'];

/**
 * The approved version for a product, and the requirements a delta is computed against.
 *
 * THE APPROVED VERSION, not the latest draft: a draft awaiting review is not what anyone
 * agreed to, and deltaing against it would compound unreviewed output (PRD-E6).
 */
export function approvedVersionFor(productId) {
  const version = get(`SELECT v.prd_version_id, v.prd_id, v.version_no, v.trace_id, v.approved_at
       FROM prd_versions v JOIN prds p ON p.prd_id = v.prd_id
      WHERE p.product_id = ? AND v.state = 'approved'
      ORDER BY v.version_no DESC LIMIT 1`, [productId]);
  if (!version) return null;
  return {
    ...version,
    requirements: all(`SELECT req_id, kind, subject, statement FROM requirements
                        WHERE prd_version_id = ? ORDER BY req_id`, [version.prd_version_id]),
  };
}

/** The same shape the prompt is handed, built here so the workflow cannot reshape it. */
export function requirementsForPrompt(version) {
  return (version?.requirements ?? [])
    .map((r) => `${r.req_id} [${r.kind}] ${r.statement}`)
    .join('\n');
}

/**
 * Check a proposed delta against the approved version and the new document.
 *
 * Returns the delta with every surviving item carrying located spans, plus `dropped` — the
 * ledger of what was refused and why. The ledger is part of the answer: a delta that quietly
 * shrank is a delta nobody can audit.
 */
export function checkDelta({ prd_version_id, doc_id, payload }) {
  const version = get('SELECT prd_version_id, state FROM prd_versions WHERE prd_version_id = ?',
    [prd_version_id]);
  if (!version) return { status: 'error', reason: 'unknown_version', missing: ['prd_version_id'] };

  const doc = get('SELECT doc_id, raw_text FROM source_documents WHERE doc_id = ?', [doc_id]);
  if (!doc) return { status: 'error', reason: 'unknown_document', missing: ['doc_id'] };

  const known = new Set(all('SELECT req_id FROM requirements WHERE prd_version_id = ?',
    [prd_version_id]).map((r) => r.req_id));
  const statements = new Map(all('SELECT req_id, statement FROM requirements WHERE prd_version_id = ?',
    [prd_version_id]).map((r) => [r.req_id, r.statement]));

  const out = { added: [], modified: [], contradicted: [], removed: [], new_open_questions: [] };
  const dropped = [];

  const groundCitations = (item, kind, label) => {
    const cites = (item.citations ?? []).map((c) => ({ quote: c.quote, ...locate(doc.raw_text, c) }));
    const located = cites.filter((c) => c.match_kind !== 'not_found');
    if (!cites.length || !located.length) {
      dropped.push({
        kind,
        item: label,
        why: cites.length ? 'no citation could be located in the new document' : 'no citation at all',
        quotes: cites.map((c) => c.quote?.slice(0, 120)),
      });
      return null;
    }
    return cites;
  };

  for (const kind of DELTA_KINDS) {
    for (const item of payload?.[kind] ?? []) {
      const label = kind === 'added' ? (item.statement ?? '').slice(0, 60) : item.req_id;

      // 1. the link, and it is not the model's to invent
      if (NAMES_A_REQUIREMENT.includes(kind)) {
        if (!item.req_id || !known.has(item.req_id)) {
          dropped.push({
            kind,
            item: item.req_id ?? '(none)',
            why: 'names a req_id that is not in the approved version',
          });
          continue;
        }
      }

      // 2. the evidence, in the new document
      const citations = groundCitations(item, kind, label);
      if (!citations) continue;

      // 3. the PRD side. The req_id is the link; this quote is what a person reads beside it,
      //    so a mismatch is RECORDED rather than fatal — dropping a real change because the
      //    model paraphrased the old sentence would lose the change to protect a caption.
      let prd_quote_match = null;
      if (NAMES_A_REQUIREMENT.includes(kind)) {
        prd_quote_match = locate(statements.get(item.req_id) ?? '', { quote: item.prd_quote ?? '' })
          .match_kind;
      }

      out[kind].push({ ...item, citations, ...(prd_quote_match ? { prd_quote_match } : {}) });
    }
  }

  for (const q of payload?.new_open_questions ?? []) {
    const citations = groundCitations(q, 'new_open_question', (q.question ?? '').slice(0, 60));
    if (citations) out.new_open_questions.push({ ...q, citations });
  }

  const counts = Object.fromEntries(
    [...DELTA_KINDS, 'new_open_questions'].map((k) => [k, out[k].length]),
  );
  return {
    status: 'ok',
    prd_version_id,
    doc_id,
    delta: out,
    dropped,
    counts,
    // The one number this whole prompt is judged on lives one story away (C5, E6-S5); the
    // total is here so a run can be read without it.
    total_items: DELTA_KINDS.reduce((n, k) => n + out[k].length, 0),
  };
}

/**
 * Fields the model may never set. Same rule as everywhere: a model-supplied `grounded` is a
 * schema violation rejected at the boundary, not a value to clean up.
 */
export function assertModelDidNotSetOwnedFields(payload) {
  const OWNED = ['grounded', 'match_kind', 'state', 'prd_version_id', 'approved_at', 'pm_authored'];
  const offenders = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`));
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (OWNED.includes(k)) offenders.push(`${path}.${k}`);
      walk(v, `${path}.${k}`);
    }
  };
  walk(payload, 'delta');
  return offenders;
}

// --- applying it: the next version (E6-S2) --------------------------------------------------
//
// `checkDelta` decided what the delta legitimately says. This turns that into the next
// PRDVersion, and the rules it follows are all about what must NOT change.
//
//   IDENTITY SURVIVES        a modified requirement carries its `origin_req_id` forward. Its
//                            `req_id` cannot survive — it is "<version>-REQ-nnn", a global
//                            primary key, and versions are immutable (ADR 0005) — so identity
//                            lives in its own column. Without it, every carried requirement
//                            looks new: the review decisions taken against the old row stop
//                            resolving, and M2 rises next cycle because the denominator was
//                            replaced rather than because anybody accepted anything.
//
//   SILENCE CHANGES NOTHING  a requirement the delta does not mention is copied across
//                            byte-for-byte, citations included. Not re-extracted, not
//                            re-worded, not re-grounded — the same words, because nothing in
//                            the new document said anything about them.
//
//   A CONTRADICTION IS NOT   `contradicted` and `removed` record a change and leave the
//   AN EDIT                  requirement standing. The new document disagreeing with an
//                            approved requirement is a question for the PM, not a fact about
//                            the product — and E6-S4 is the screen where that choice is made.
//                            Applying it here would be the system settling an argument it was
//                            built to surface.
//
//   AN EMPTY DELTA IS A PARK a version whose changelog is empty is a version nobody needs to
//                            read, and minting one would put a document in the review queue
//                            that says nothing.
export function applyDelta({ prd_version_id, doc_id, payload }) {
  // The delta is re-checked HERE rather than trusted from the caller. A workflow that could
  // hand this function an unchecked payload is a workflow that could bypass grounding.
  const checked = checkDelta({ prd_version_id, doc_id, payload });
  if (checked.status !== 'ok') return checked;

  const base = get(`SELECT prd_version_id, prd_id, version_no, state, content, trace_id
                      FROM prd_versions WHERE prd_version_id = ?`, [prd_version_id]);
  if (base.state !== 'approved') {
    // The baseline is the version somebody agreed to. Applying a delta to a draft would build
    // on something nobody has accepted (docs/contracts.md §10).
    return { status: 'error', reason: 'baseline_not_approved', missing: [], detail: base.state };
  }

  const doc = get('SELECT doc_id, trace_id, product_id FROM source_documents WHERE doc_id = ?', [doc_id]);
  const { delta } = checked;
  const applicable = delta.added.length + delta.modified.length
    + delta.contradicted.length + delta.removed.length;

  if (applicable === 0) {
    logEvent(doc.trace_id, 'delta_empty', 'delta', JSON.stringify({
      doc_id, prd_version_id, dropped: checked.dropped.length,
    }));
    return {
      status: 'needs_review',
      reason: 'delta_empty',
      missing: [],
      prd_version_id: null,
      base_version_id: prd_version_id,
      // What the model DID say, and why none of it survived. A park with no account of what
      // it discarded is a park nobody can argue with.
      dropped: checked.dropped,
      new_open_questions: delta.new_open_questions,
    };
  }

  const modifiedBy = new Map(delta.modified.map((m) => [m.req_id, m]));
  const contradictedBy = new Map(delta.contradicted.map((c) => [c.req_id, c]));
  const removedBy = new Map(delta.removed.map((r) => [r.req_id, r]));

  const carried = all(`SELECT req_id, doc_id, trace_id, kind, statement, subject, stakeholder,
                              confidence, grounded, pm_authored, origin_req_id
                         FROM requirements WHERE prd_version_id = ? ORDER BY req_id`,
  [prd_version_id]);

  // THE NEXT VERSION IS DECIDED BEFORE IT IS WRITTEN.
  //
  // `content` is immutable from insert (ADR 0005) — the database refuses an UPDATE, which it
  // did to the first version of this function. So the whole next version is worked out here,
  // in memory, and written in one insert. Requirement ids inside `content` are the
  // version-independent `REQ-nnn` the assembler uses; the row ids carry the version prefix.
  const changes = [];
  const planned = [];
  let seq = 0;
  const nextSeq = () => `REQ-${String(++seq).padStart(3, '0')}`;

  const citationsOf = (reqId) => all(
    'SELECT quote, start_char, end_char, match_kind FROM citations WHERE req_id = ? ORDER BY citation_id',
    [reqId]);

  for (const r of carried) {
    const mod = modifiedBy.get(r.req_id);
    const con = contradictedBy.get(r.req_id);
    const rem = removedBy.get(r.req_id);
    const ref = nextSeq();

    if (mod) {
      // Rewritten, and now grounded in the NEW document — the sentence comes from there.
      planned.push({
        ref,
        kind: r.kind,
        subject: r.subject,
        statement: mod.statement,
        stakeholder: r.stakeholder,
        confidence: r.confidence,
        grounded: 1,
        pm_authored: r.pm_authored,
        origin_req_id: r.origin_req_id ?? r.req_id,
        doc_id: doc.doc_id,
        trace_id: doc.trace_id,
        citations: (mod.citations ?? []).map((c) => ({
          quote: c.quote, start_char: c.start_char ?? null, end_char: c.end_char ?? null,
          match_kind: c.match_kind ?? 'located',
        })),
      });
      changes.push({ kind: 'modified', ref, old_text: r.statement, new_text: mod.statement,
        citations: JSON.stringify(mod.citations ?? []) });
      continue;
    }

    // Contradicted, removed, or untouched: the words carry across unchanged. The first two are
    // RECORDED and left for a human (E6-S4) — the system does not settle an argument it exists
    // to surface.
    planned.push({
      ref,
      kind: r.kind,
      subject: r.subject,
      statement: r.statement,
      stakeholder: r.stakeholder,
      confidence: r.confidence,
      grounded: r.grounded,
      pm_authored: r.pm_authored,
      origin_req_id: r.origin_req_id ?? r.req_id,
      doc_id: r.doc_id,
      trace_id: r.trace_id,
      citations: citationsOf(r.req_id),
    });
    if (con) {
      changes.push({ kind: 'contradicted', ref, old_text: r.statement,
        new_text: con.statement ?? null, citations: JSON.stringify(con.citations ?? []) });
    } else if (rem) {
      changes.push({ kind: 'removed', ref, old_text: r.statement, new_text: null,
        citations: JSON.stringify(rem.citations ?? []) });
    }
  }

  for (const a of delta.added) {
    const ref = nextSeq();
    planned.push({
      ref,
      kind: a.kind ?? 'functional',
      subject: a.subject ?? null,
      statement: a.statement,
      stakeholder: null,
      confidence: null,
      grounded: 1,
      pm_authored: 0,
      // An addition has no ancestor. Its origin is itself, and it is stamped once the row id
      // exists — the same rule extraction follows.
      origin_req_id: null,
      doc_id: doc.doc_id,
      trace_id: doc.trace_id,
      citations: (a.citations ?? []).map((c) => ({
        quote: c.quote, start_char: c.start_char ?? null, end_char: c.end_char ?? null,
        match_kind: c.match_kind ?? 'located',
      })),
    });
    changes.push({ kind: 'added', ref, old_text: null, new_text: a.statement,
      citations: JSON.stringify(a.citations ?? []) });
  }

  const oldContent = (() => { try { return JSON.parse(base.content); } catch { return {}; } })();
  const content = {
    ...oldContent,
    product_id: doc.product_id,
    // What makes this a version WITH a predecessor. E4-S5's comparison screen reads
    // `prd_changes` to decide the same thing; this is the same fact, in the document.
    derived_from: prd_version_id,
    source_doc_ids: [...new Set([...(oldContent.source_doc_ids ?? []), doc_id])],
    generated_at: new Date().toISOString(),
    requirements: planned.map((p) => ({
      req_id: p.ref,
      kind: p.kind,
      subject: p.subject,
      statement: p.statement,
      stakeholder: p.stakeholder,
      confidence: p.confidence,
      grounded: Boolean(p.grounded),
      citations: p.citations,
    })),
    open_questions: [...(oldContent.open_questions ?? []), ...delta.new_open_questions],
  };

  let newVersionId = null;
  tx((d) => {
    const n = d.prepare('SELECT COALESCE(MAX(version_no),0)+1 AS n FROM prd_versions WHERE prd_id=?')
      .get(base.prd_id).n;
    d.prepare(`INSERT INTO prd_versions (prd_id, version_no, trace_id, state, content)
               VALUES (?,?,?,'in_review',?)`)
      .run(base.prd_id, n, doc.trace_id, JSON.stringify(content));
    newVersionId = d.prepare('SELECT prd_version_id FROM prd_versions WHERE prd_id=? AND version_no=?')
      .get(base.prd_id, n).prd_version_id;

    for (const p of planned) {
      const reqId = `${newVersionId}-${p.ref}`;
      d.prepare(`INSERT INTO requirements
        (req_id, prd_version_id, doc_id, trace_id, kind, statement, subject, stakeholder,
         confidence, grounded, pm_authored, origin_req_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        reqId, newVersionId, p.doc_id, p.trace_id, p.kind, p.statement, p.subject,
        p.stakeholder, p.confidence, p.grounded, p.pm_authored,
        // THE LINE THAT MAKES A MODIFICATION A MODIFICATION rather than a replacement.
        p.origin_req_id ?? reqId);
      for (const c of p.citations) {
        d.prepare(`INSERT INTO citations (req_id, doc_id, quote, start_char, end_char, match_kind)
                   VALUES (?,?,?,?,?,?)`)
          .run(reqId, p.doc_id, c.quote, c.start_char, c.end_char, c.match_kind);
      }
    }

    for (const c of changes) {
      // `doc_id` on every row (E6-S3): the changelog says what happened AND what said so.
      // One delta application has exactly one source document, so it is taken from `doc`
      // rather than carried through four push sites that would all write the same value.
      d.prepare(`INSERT INTO prd_changes (prd_version_id, kind, req_id, old_text, new_text, citations, doc_id)
                 VALUES (?,?,?,?,?,?,?)`)
        .run(newVersionId, c.kind, `${newVersionId}-${c.ref}`, c.old_text, c.new_text, c.citations,
          doc.doc_id);
    }
  });

  logEvent(doc.trace_id, 'delta_applied', 'delta', JSON.stringify({
    doc_id, base_version_id: prd_version_id, prd_version_id: newVersionId,
    counts: checked.counts, carried: carried.length, changes: changes.length,
  }));

  return {
    status: 'ok',
    prd_version_id: newVersionId,
    base_version_id: prd_version_id,
    state: 'in_review',
    carried: carried.length,
    changes: changes.length,
    counts: checked.counts,
    dropped: checked.dropped,
  };
}
