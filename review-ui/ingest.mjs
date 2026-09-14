// The ingest path: normalize -> store -> event. Called by both doors.
//
// trace_id is minted HERE and only here (docs/contracts.md §1). Nothing downstream mints
// another; every row from this document through to its approval carries this one value.

import { randomUUID } from 'node:crypto';
import { tx, get, logEvent, run } from './db.mjs';
import { normalize } from './normalize.mjs';
import { approvedVersionFor } from './delta.mjs';

const ENVELOPE_VERSION = '1.0';

export function envelope({ product_id = null, doc_id = null, trace_id = null,
  component, status, payload = {} }) {
  return { envelope_version: ENVELOPE_VERSION, product_id, doc_id, trace_id, component, status, payload };
}

function nextDocId(d) {
  const year = new Date().getFullYear();
  const row = d.prepare(
    "SELECT COUNT(*) AS n FROM source_documents WHERE doc_id LIKE ?"
  ).get(`DOC-${year}-%`);
  return `DOC-${year}-${String(row.n + 1).padStart(4, '0')}`;
}

/**
 * @param {object} input  raw door input (see normalize())
 * @returns envelope, status ok | error
 */
export function ingest(input) {
  const result = normalize(input);
  if (!result.ok) {
    // Machine-readable failure, never a bare one.
    return envelope({
      product_id: input.product_id ?? null,
      component: 'door',
      status: 'error',
      payload: { reason: result.reason, missing: result.missing },
    });
  }

  const doc = result.document;
  const trace_id = randomUUID();

  const doc_id = tx((d) => {
    // The product is control-plane data. Auto-registering on first sight keeps the demo
    // one step shorter; it is still config, and nothing branches on its identity.
    d.prepare('INSERT OR IGNORE INTO products (product_id, name) VALUES (?,?)')
      .run(doc.product_id, doc.product_id);

    const id = nextDocId(d);
    d.prepare(`INSERT INTO source_documents
      (doc_id, product_id, trace_id, doc_type, title, received_at, source_channel,
       raw_text, segments, pii_redactions, target_prd_id, authorship)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, doc.product_id, trace_id, doc.doc_type, doc.title, doc.received_at,
      doc.source_channel, doc.raw_text, JSON.stringify(doc.segments),
      JSON.stringify(doc.pii_redactions), doc.target_prd_id, doc.authorship
    );
    return id;
  });

  logEvent(trace_id, 'ingested', 'door',
    JSON.stringify({ doc_id, doc_type: doc.doc_type, chars: doc.raw_text.length,
      redactions: doc.pii_redactions.length }));

  // THE ROUTING DECISION, taken here and recorded (E6-S2).
  //
  // It is taken from PRODUCT STATE, never from what the submitter typed. Until now it read
  // `target_prd_id` — the optional "Update an existing PRD" box on the form — which meant a
  // PM who left it blank got a brand new PRD for a product that already had an approved one,
  // and a PM who filled it in decided the road. **The PM does not route; the database does.**
  //
  // Recorded as an event rather than inferred later from which workflow ran: a decision you
  // have to reconstruct is a decision nobody can audit (contracts §4, §5).
  const routing = routeFor(doc.product_id);
  logEvent(trace_id, 'routed', 'door', JSON.stringify({ doc_id, ...routing }));

  return envelope({
    product_id: doc.product_id,
    doc_id,
    trace_id,
    component: 'door',
    status: 'ok',
    payload: {
      doc_type: doc.doc_type,
      title: doc.title,
      received_at: doc.received_at,
      source_channel: doc.source_channel,
      authorship: doc.authorship,
      chars: doc.raw_text.length,
      segments: doc.segments.length,
      pii_redactions: doc.pii_redactions,
      // Kept and returned because a PM's stated intent is worth recording. It is NOT what
      // routes the document, and nothing downstream reads it to decide a road.
      target_prd_id: doc.target_prd_id,
      // Routing input for WF1: computed, never a stored flag (docs/contracts.md §4).
      ...routing,
    },
  });
}

/**
 * Which road a document takes, decided from the product's own state.
 *
 * `delta` when this product already has an approved PRD version — a follow-up document
 * updates the thing that was agreed, rather than starting a rival draft beside it. `generate`
 * otherwise, which is every product's first document and every document that arrives while
 * the first PRD is still in review.
 *
 * **The reason travels with the decision.** "It went to WF2" is an outcome; "it went to WF2
 * because this product has no approved version yet" is something a reader can check.
 */
export function routeFor(productId) {
  // The SAME function the delta path uses to find its baseline (E6-S1). Two queries answering
  // "is there an approved version" is two answers that can disagree, and they would disagree
  // exactly when it mattered: at the moment a version is approved.
  const approved = approvedVersionFor(productId);
  return approved
    ? {
      has_approved_version: true,
      route: 'delta',
      approved_prd_version_id: approved.prd_version_id,
      route_reason: `product ${productId} has an approved version (${approved.prd_version_id})`,
    }
    : {
      has_approved_version: false,
      route: 'generate',
      approved_prd_version_id: null,
      route_reason: `product ${productId} has no approved version yet`,
    };
}

export function getDocument(docId) {
  const row = get('SELECT * FROM source_documents WHERE doc_id=?', [docId]);
  if (!row) return null;
  return { ...row, segments: JSON.parse(row.segments), pii_redactions: JSON.parse(row.pii_redactions) };
}
