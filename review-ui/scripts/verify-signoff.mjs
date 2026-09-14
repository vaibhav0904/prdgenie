// Verifies E1-S6's server-side half: sign-off is the only path to `approved`, it
// recomputes readiness, and the marker does not leak — re-proven against the endpoint
// that ships, not just the harness (E1-S1's TC7 was against a harness).
//
// Requires the service to be running. Does not create schema (BUG-001).

const BASE = `http://localhost:${process.env.SERVICE_PORT ?? 3000}`;
const results = [];
const ok = (id, desc, pass, detail = '') => results.push({ id, desc, pass, detail });

// Takes an optional `body`, JSON-encoded, so the same helper can post a decision as well as
// read. Added when E4-S3 made sign-off require decisions first.
const api = async (path, init = {}) => {
  const { body, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, body === undefined ? rest : {
    ...rest,
    headers: { 'content-type': 'application/json', ...(rest.headers ?? {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const health = await api('/api/health').catch(() => null);
if (!health || health.status !== 200) {
  console.error('The review service is not running. Start it first:');
  console.error('  .\\run.cmd review-ui/server.js');
  process.exit(1);
}

// --- ITS OWN PRODUCT, and two versions of it (BUG-045) ----------------------------------------
//
// This used to take the first two `in_review` versions `/api/prd-versions` returned — whichever
// they happened to be — and sign one off. On a database where the graded corpus lives, that
// meant approving a real `forgesight` version, on every run, unattended.
//
// Three things were wrong with it, and only the first was obvious:
//
//   1. it approved a version nobody reviewed, into the corpus M1/M2/M5 are computed over;
//   2. it made `verify-delta`'s fixture stale — the approval outranked what that check built,
//      and TC0a went red about somebody else's row (this card);
//   3. since E6-S2 an approved version decides WHICH ROAD the next real document takes. A check
//      could change how the product routes.
//
// So the fixture is built. `verify-review-gate` has done this since E4 and was never a source
// of any of it; this file now follows.
const { ingest: mkDoc, getDocument: getDoc } = await import('../ingest.mjs');
const { assemble: build } = await import('../assemble.mjs');

const PRODUCT = `verify-signoff-${Date.now()}`;
const SRC = 'Marcus (Head of Product): Every dashboard must export to CSV on demand.\n'
  + 'Priya (Eng Lead): And the export finishes inside ten seconds for a year of data.';

const at = (q) => ({ quote: q, start_char: SRC.indexOf(q), end_char: SRC.indexOf(q) + q.length, match_kind: 'exact' });

const mkVersion = () => {
  const env = mkDoc({ doc_type: 'transcript', product_id: PRODUCT, source_channel: 'webhook', raw_text: SRC });
  const built = build(getDoc(env.doc_id), [
    {
      req_id: 'REQ-001', kind: 'functional', statement: 'Every dashboard exports to CSV on demand.',
      stakeholder: 'Marcus (Head of Product)', confidence: 'high', grounded: true,
      citations: [at('Every dashboard must export to CSV on demand')],
    },
    {
      req_id: 'REQ-002', kind: 'nonfunctional',
      statement: 'A CSV export of a year of data finishes within ten seconds.',
      stakeholder: 'Priya (Eng Lead)', confidence: 'high', grounded: true,
      citations: [at('the export finishes inside ten seconds for a year of data')],
    },
  ], null, { document_subject: 'a dashboard product', concerns_product: true }, [], [], {
    epics: [{ epic_id: 'EPIC-001', title: 'Export', summary: null }],
    features: [{ feature_id: 'FEAT-001', epic_id: 'EPIC-001', title: 'CSV export', req_ids: ['REQ-001', 'REQ-002'] }],
    stories: [{
      story_id: 'STORY-001', feature_id: 'FEAT-001', as_a: 'analyst',
      i_want: 'a CSV', so_that: 'I can pivot it',
      acceptance_criteria: [{ criterion: 'The CSV carries every column the dashboard shows.', req_id: 'REQ-001' }],
    }],
    factors: [{ feature_id: 'FEAT-001', reach: 9, impact: 2, confidence: 0.9, effort: 3, rationale: 'x', citations: [], priority_score: 5.4 }],
    unclustered: [],
  });
  if (built.status !== 'ok') {
    console.error(`Could not build a fixture version: ${built.payload?.reason ?? built.status}`);
    process.exit(1);
  }
  return { prd_version_id: built.payload.prd_version_id };
};

// TWO of them, because TC8's whole point is that a marker naming one cannot approve the other.
const A = mkVersion();
const B = mkVersion();

// --- TC10 / TC6: readiness recomputed, then a real sign-off -------------------
// Count the approved events on this trace BEFORE signing (BUG-021). Several versions can
// share one trace_id — `verify-refusal` leaves in_review siblings on the fixture's trace —
// and `events` has no version column, so "exactly one approved event on this trace" was an
// assertion about the whole history rather than about this sign-off. It passed once and
// failed on every later run.
const { all: allBefore } = await import('../db.mjs');
const { body: before } = await api(`/api/prd-versions/${A.prd_version_id}`);
const approvedBefore = allBefore(
  "SELECT name FROM events WHERE trace_id=? AND name='approved'", [before.trace_id]).length;

// THE CONTRACT CHANGED UNDER THIS FILE, on 2026-09-02, and this block is the adjustment.
//
// E4-S3 made sign-off recompute readiness from the rows: every requirement and every story
// must carry a decision. This file was written for E1-S6, when signing off took nothing but
// a version in `in_review` — so it started failing, correctly, the moment the gate it does
// not know about was built.
//
// **This is not a check being softened to make it pass.** The old assertion is intact below;
// what is added is the review the endpoint now requires, performed through the same API a
// person uses. A file that had been "fixed" by removing the readiness check would look
// identical from the outside, which is why the reason is written here rather than in a
// commit message nobody reads next to the code.
const decide = async (versionId) => {
  const { body: review } = await api(`/api/prd-versions/${versionId}/review`);
  for (const u of review.readiness.undecided) {
    const item = u.item_type === 'requirement'
      ? review.requirements.find((r) => r.req_id === u.item_id) : null;
    // An unverified requirement cannot take the plain approve path (E4-S4), so the override
    // is used here — with a reason, because the trigger requires one.
    const decision = item && item.grounded === false ? 'approve_ungrounded' : 'approve';
    await api(`/api/prd-versions/${versionId}/decisions`, {
      method: 'POST',
      body: {
        item_type: u.item_type,
        item_id: u.item_id,
        decision,
        reason: decision === 'approve' ? null : 'verify-signoff.mjs: decided so the gate can be tested',
      },
    });
  }
};
await decide(A.prd_version_id);

const signed = await api(`/api/prd-versions/${A.prd_version_id}/sign-off`, { method: 'POST' });
ok('TC6', 'sign-off transitions the version to approved',
  signed.status === 200 && signed.body?.state === 'approved',
  `${signed.status} ${signed.body?.reason ?? ''}`);

const { body: after } = await api(`/api/prd-versions/${A.prd_version_id}`);
ok('TC6b', 'the stored state really is approved', after?.state === 'approved', after?.state);

// --- TC7 / TC8: the gate holds, and the marker did not leak -------------------
// Import lazily so the script works with the service in another process.
const { run, get, all } = await import('../db.mjs');
let handRun = 'succeeded';
try { run("UPDATE prd_versions SET state='approved' WHERE prd_version_id=?", [B.prd_version_id]); }
catch { handRun = 'refused'; }
ok('TC7', 'a hand-run UPDATE to approved is still refused after a real sign-off',
  handRun === 'refused', handRun);
ok('TC8', 'the marker did not leak: version B is untouched',
  get('SELECT state FROM prd_versions WHERE prd_version_id=?', [B.prd_version_id])?.state === 'in_review');

// --- TC9: signing something that is not in_review -----------------------------
const twice = await api(`/api/prd-versions/${A.prd_version_id}/sign-off`, { method: 'POST' });
ok('TC9', 'signing an already-approved version is refused with a reason',
  twice.status === 409 && twice.body?.reason === 'not_in_review',
  `${twice.status} ${twice.body?.reason}`);

const missing = await api('/api/prd-versions/999999/sign-off', { method: 'POST' });
ok('TC9b', 'signing a nonexistent version 404s rather than throwing', missing.status === 404);

// --- TC11: the approved event ---------------------------------------------------
const evs = all("SELECT name FROM events WHERE trace_id=? AND name='approved'", [after.trace_id]);
ok('TC11', 'this sign-off wrote exactly one approved event on the version trace_id',
  evs.length === approvedBefore + 1, `${approvedBefore} before, ${evs.length} after`);

// --- TC13: negative control -----------------------------------------------------
// A version with no requirements must be refused, so the readiness check is not vacuous.
//
// The test SEEDS its own parked version rather than hoping one exists. Depending on the
// ambient state would make this row pass or fail for reasons unrelated to the code —
// and the first run of it did exactly that (no parked version was available, because
// BUG-004 means even the garbage fixture produces requirements).
const { ingest, getDocument } = await import('../ingest.mjs');
const { assemble } = await import('../assemble.mjs');
const seedEnv = ingest({
  doc_type: 'notes', product_id: `signoff-control-${Date.now()}`,
  source_channel: 'webhook', raw_text: 'nothing here resembles a product requirement',
});
const parkEnv = assemble(getDocument(seedEnv.doc_id), []);
const parkedId = get('SELECT prd_version_id FROM prd_versions WHERE trace_id=? AND park_reason IS NOT NULL',
  [seedEnv.trace_id])?.prd_version_id;

const r = parkedId
  ? await api(`/api/prd-versions/${parkedId}/sign-off`, { method: 'POST' })
  : { status: 0, body: null };
ok('TC13', 'a parked version cannot be signed off',
  parkEnv.status === 'needs_review' && r.status === 409,
  `park=${parkEnv.payload?.reason}, signoff=${r.status} ${r.body?.reason ?? ''}`);

// --- TC14: coverage --------------------------------------------------------------
const PLANNED = 8;
ok('TC14', 'coverage asserted: every planned assertion ran',
  results.length === PLANNED, `${results.length}/${PLANNED}`);

const width = Math.max(...results.map((r) => r.desc.length));
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(6)} ${r.desc.padEnd(width)}${r.detail ? '  ' + r.detail : ''}`);
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.error('SIGN-OFF VERIFICATION FAILED'); process.exit(1); }
console.log('Sign-off verified: the endpoint is the only path to approved, and the marker does not leak.');
