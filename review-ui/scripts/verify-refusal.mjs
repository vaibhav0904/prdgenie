// BUG-004: does a document that is not about the product yield nothing?
//
// The interesting half is not "did G1 come back empty this time". G1's count was 16, 15, 14
// and 14 across four earlier prompt versions, so a single zero proves very little. What this
// script checks is that the MECHANISM works and can be shown to fail: `concerns_product` is
// the model's judgement, and code — not the model — decides what follows from it.
//
// It drives `/internal/assemble` directly rather than the whole pipeline, so the controls can
// force a judgement the model would not produce.
//
// Usage:  .\run.cmd review-ui/scripts/verify-refusal.mjs

import { readFileSync } from 'node:fs';
import { get, all } from '../db.mjs';

const BASE = process.env.SERVICE_BASE_URL ?? 'http://localhost:3000';
const KEY = process.env.INTERNAL_API_KEY ?? '';

let failed = 0;
const rows = [];
const ok = (id, name, pass, evidence = '') => {
  rows.push({ id, name, pass, evidence });
  if (!pass) failed++;
};

async function assemble(body) {
  const res = await fetch(`${BASE}/internal/assemble`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(KEY ? { 'x-internal-key': KEY } : {}) },
    body: JSON.stringify(body),
  });
  return { code: res.status, env: await res.json().catch(() => ({})) };
}

// BUG-021. Read the CURRENT run, and address versions by id.
//
// This used to read a manifest frozen at BUG-004 — written before `park()` returned its
// version id, so its `prd_version_id` was null and there was nothing to address by. The
// fallback was "the newest version sharing this trace", and the cases further down this
// file create more versions on that same trace: a contradiction park, and an assembly with
// the judgement forced true. So the second invocation read the third invocation's leftovers
// and reported that the refusal had stopped working, on a run where it had not.
//
// Run this file twice. The answer must be the same both times.
const manifest = JSON.parse(readFileSync('evals/results/.last-run.json', 'utf8'));
const G1 = manifest.runs?.G1;
const T1 = manifest.runs?.T1;
if (!G1 || !T1) {
  console.error('No G1/T1 in the current run. Produce one first:');
  console.error('  .\\run.cmd evals/harness/produce.mjs');
  process.exit(1);
}

// By id. Not "the newest row that shares this trace" — that is a guess, and the guess is
// wrong as soon as anything else writes to the trace, including this file (BUG-021).
const versionById = (id) => (id == null ? null : get(
  'SELECT prd_version_id, state, park_reason, content FROM prd_versions WHERE prd_version_id=?', [id]));

// --- TC1: G1 through the real pipeline -------------------------------------------------
const g1v = versionById(G1.prd_version_id);
const g1c = g1v ? JSON.parse(g1v.content) : {};
ok('TC1', 'G1 parks with no requirements, through the whole pipeline',
  g1v?.park_reason === 'no_requirements_found' && (g1c.requirements ?? []).length === 0,
  g1v ? `park_reason=${g1v.park_reason}, kept=${(g1c.requirements ?? []).length}` : 'no version');

// --- The model's own judgement, which is the point ------------------------------------
ok('TC1b', 'The model named the subject and judged it not a product document',
  g1c.concerns_product === false && typeof g1c.document_subject === 'string' && g1c.document_subject.trim() !== '',
  `document_subject=${JSON.stringify(g1c.document_subject)}, concerns_product=${g1c.concerns_product}`);

// --- TC4/TC5: T1 is not damaged --------------------------------------------------------
const t1reqs = T1.prd_version_id ? all('SELECT req_id FROM requirements WHERE prd_version_id=?', [T1.prd_version_id]) : [];
ok('TC4', 'T1 still produces a PRD, not a park',
  T1.state === 'in_review' && t1reqs.length > 0,
  `state=${T1.state}, ${t1reqs.length} requirements`);

// --- TC2: code decides, not the model --------------------------------------------------
// A response that says "not a product document" AND lists requirements anyway. The gate
// must discard the list. This is the case the model will not produce on demand, which is
// exactly why it is driven through the endpoint.
const fakeReqs = [{
  req_id: 'REQ-001', kind: 'functional', statement: 'A user can do a thing.',
  stakeholder: null, confidence: 'high', grounded: true,
  citations: [{ quote: 'x', start_char: 0, end_char: 1, match_kind: 'exact' }],
}];
const contradiction = await assemble({
  doc_id: G1.doc_id, trace_id: G1.trace_id, requirements: fakeReqs,
  document_subject: 'staff parking', concerns_product: false,
});
ok('TC2', 'A contradictory response is refused: the judgement wins, the list is discarded',
  contradiction.env?.status === 'needs_review'
    && contradiction.env?.payload?.reason === 'no_requirements_found',
  `status=${contradiction.env?.status}, reason=${contradiction.env?.payload?.reason}`);

// --- TC3: the park keeps the work -------------------------------------------------------
// The version TC2 just created, named by the id TC2 got back. It shares G1's trace with
// several others, and picking "the newest" is what BUG-021 was.
const kept = versionById(contradiction.env?.payload?.prd_version_id);
const keptContent = kept ? JSON.parse(kept.content) : {};
ok('TC3', 'The discarded requirements are still stored on the parked version, for audit',
  (keptContent.requirements ?? []).length === fakeReqs.length
    && keptContent.concerns_product === false,
  `${(keptContent.requirements ?? []).length} requirement(s) kept under parked:true`);

// --- TC7: absent is not false, and not true either ---------------------------------------
for (const [what, body] of [
  ['concerns_product', { doc_id: G1.doc_id, requirements: [], document_subject: 'x' }],
  ['document_subject', { doc_id: G1.doc_id, requirements: [], concerns_product: true }],
  ['both', { doc_id: G1.doc_id, requirements: [] }],
  ['empty document_subject', { doc_id: G1.doc_id, requirements: [], concerns_product: true, document_subject: '   ' }],
]) {
  const r = await assemble(body);
  ok(`TC7:${what}`, `A response missing ${what} is refused as schema_invalid`,
    r.code === 400 && r.env?.payload?.reason === 'schema_invalid',
    `HTTP ${r.code}, reason=${r.env?.payload?.reason}, missing=${JSON.stringify(r.env?.payload?.missing ?? [])}`);
}

// --- TC8: NEGATIVE CONTROL — the gate can be bypassed -------------------------------------
// Force the judgement to true on G1's own document with a real requirement attached. If the
// gate is what does the work, this must now assemble rather than park.
const bypass = await assemble({
  doc_id: G1.doc_id, trace_id: G1.trace_id, requirements: fakeReqs,
  document_subject: 'staff parking', concerns_product: true,
});
ok('TC8', 'NEGATIVE CONTROL: with concerns_product=true the same payload assembles',
  bypass.env?.status === 'ok',
  `status=${bypass.env?.status}, reason=${bypass.env?.payload?.reason ?? '-'} — proves the gate, not something else, is doing the work`);

// --- TC9: NEGATIVE CONTROL — the gate can fire wrongly ------------------------------------
const misfire = await assemble({
  doc_id: T1.doc_id, trace_id: T1.trace_id, requirements: fakeReqs,
  document_subject: 'an analytics dashboard product', concerns_product: false,
});
ok('TC9', 'NEGATIVE CONTROL: a false judgement on T1 parks it — the failure mode is real',
  misfire.env?.status === 'needs_review' && misfire.env?.payload?.reason === 'no_requirements_found',
  `status=${misfire.env?.status} — which is why TC4 and C1 exist`);

// --- report ---------------------------------------------------------------------------
const w = Math.max(...rows.map((r) => r.name.length));
for (const r of rows) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(22)} ${r.name.padEnd(w)}  ${r.evidence}`);
}
console.log(`\n${rows.length - failed}/${rows.length} passed`);
if (failed) {
  console.error('REFUSAL VERIFICATION FAILED');
  process.exitCode = 1;
} else {
  console.log('A document that is not about the product yields nothing, and code is what decides that.');
}
