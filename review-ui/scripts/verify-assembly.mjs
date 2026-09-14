// Verifies E1-S5: a draft appears, or the run parks and says why.
// Does not create schema; asserts its own coverage (BUG-001, BUG-003).

import { all, get, tx } from '../db.mjs';
import { ingest, getDocument } from '../ingest.mjs';
import { assemble, validatePrd, REASONS } from '../assemble.mjs';

const results = [];
const ok = (id, desc, pass, detail = '') => results.push({ id, desc, pass, detail });

const PRODUCT = `verify-assembly-${Date.now()}`;
const TEXT = 'Priya (Eng Lead): Charts must export as PNG.\nMarcus (Head of Product): And p95 under two seconds.';

const env = ingest({ doc_type: 'transcript', product_id: PRODUCT, source_channel: 'webhook', raw_text: TEXT });
const doc = getDocument(env.doc_id);

const req = (id, quote, grounded) => ({
  req_id: id, kind: 'functional', statement: `statement for ${id}`,
  stakeholder: 'Priya (Eng Lead)', confidence: 'high', grounded,
  citations: [{ quote, start_char: TEXT.indexOf(quote), end_char: TEXT.indexOf(quote) + quote.length, match_kind: grounded ? 'exact' : 'not_found' }],
});

// --- TC1 / TC2: validation ----------------------------------------------------
const goodContent = { product_id: PRODUCT, title: 't', requirements: [req('R1', 'Charts must export as PNG', true)] };
ok('TC1', 'a well-formed version validates', validatePrd(goodContent).valid === true);

const badContent = { product_id: PRODUCT, title: 't', requirements: [{ req_id: 'R1', kind: 'nope' }] };
const badCheck = validatePrd(badContent);
ok('TC2', 'an invalid version is refused and names what is missing',
  badCheck.valid === false && badCheck.missing.length > 0, badCheck.missing.slice(0, 3).join(', '));

// --- TC3 / TC4: the happy path ------------------------------------------------
const okEnv = assemble(doc, [req('R1', 'Charts must export as PNG', true), req('R2', 'p95 under two seconds', true)]);
ok('TC3a', 'a valid run returns ok with a version id',
  okEnv.status === 'ok' && Number.isInteger(okEnv.payload.prd_version_id), okEnv.payload?.reason ?? '');
const stored = get('SELECT state FROM prd_versions WHERE prd_version_id=?', [okEnv.payload.prd_version_id]);
ok('TC3b', 'the version ends in in_review', stored?.state === 'in_review', stored?.state);

const evNames = all('SELECT name FROM events WHERE trace_id=? ORDER BY event_id', [doc.trace_id]).map((e) => e.name);
ok('TC4', 'draft_created and in_review events share the document trace_id',
  evNames.includes('draft_created') && evNames.includes('in_review'), evNames.join(' -> '));

// --- TC5: zero grounded parks, and creates NO draft ---------------------------
const beforeDrafts = get("SELECT COUNT(*) AS n FROM prd_versions WHERE state='draft' AND park_reason IS NULL").n;
const env2 = ingest({ doc_type: 'transcript', product_id: PRODUCT, source_channel: 'webhook', raw_text: TEXT });
const doc2 = getDocument(env2.doc_id);
const parkEnv = assemble(doc2, [req('R1', 'not present in the text', false)]);
const afterDrafts = get("SELECT COUNT(*) AS n FROM prd_versions WHERE state='draft' AND park_reason IS NULL").n;
ok('TC5a', 'zero grounded requirements parks with grounding_below_floor',
  parkEnv.status === 'needs_review' && parkEnv.payload.reason === 'grounding_below_floor',
  `${parkEnv.status}/${parkEnv.payload?.reason}`);
ok('TC5b', 'and creates NO unparked draft version', beforeDrafts === afterDrafts,
  `${beforeDrafts} -> ${afterDrafts}`);

// --- TC6 / TC7: no requirements at all ----------------------------------------
const env3 = ingest({ doc_type: 'notes', product_id: PRODUCT, source_channel: 'webhook', raw_text: 'parking permits and the coffee machine' });
const doc3 = getDocument(env3.doc_id);
const emptyEnv = assemble(doc3, []);
ok('TC6a', 'a requirement-free document parks with no_requirements_found',
  emptyEnv.status === 'needs_review' && emptyEnv.payload.reason === 'no_requirements_found',
  emptyEnv.payload?.reason);
ok('TC6b', 'the source document survives the park', Boolean(getDocument(env3.doc_id)));
ok('TC7', 'a park keeps the work and records its reason (not an error, nothing discarded)',
  Boolean(get('SELECT 1 AS x FROM prd_versions WHERE trace_id=? AND park_reason IS NOT NULL', [doc3.trace_id])));

// --- TC8: readiness is computed -----------------------------------------------
const cols = all('PRAGMA table_info(prd_versions)').map((c) => c.name);
ok('TC8', 'readiness is computed, not stored',
  !cols.some((c) => /ready|is_valid/i.test(c)), cols.filter((c) => /ready/i.test(c)).join(', '));

// --- TC9: one query answers the question --------------------------------------
const traced = {
  document: get('SELECT doc_id FROM source_documents WHERE trace_id=?', [doc.trace_id]),
  requirements: all('SELECT req_id FROM requirements WHERE trace_id=?', [doc.trace_id]),
  versions: all('SELECT prd_version_id FROM prd_versions WHERE trace_id=?', [doc.trace_id]),
  events: all('SELECT name FROM events WHERE trace_id=?', [doc.trace_id]),
};
ok('TC9', 'one trace_id joins document, requirements, version and events',
  Boolean(traced.document) && traced.requirements.length === 2
    && traced.versions.length === 1 && traced.events.length >= 3,
  `${traced.requirements.length} reqs, ${traced.versions.length} versions, ${traced.events.length} events`);

// --- TC10: reason codes come from the closed set ------------------------------
const usedReasons = all('SELECT DISTINCT park_reason AS r FROM prd_versions WHERE park_reason IS NOT NULL')
  .map((x) => x.r);
ok('TC10', 'every park reason is in the closed set from the contract',
  usedReasons.every((r) => REASONS.has(r)), usedReasons.join(', '));

// --- TC11: negative control ---------------------------------------------------
ok('TC11', 'the validator can fail — a version missing grounded is refused',
  validatePrd({ product_id: 'p', title: 't', requirements: [{ req_id: 'R', kind: 'functional', statement: 's', citations: [{ quote: 'q' }] }] }).valid === false);

// --- TC12: coverage ------------------------------------------------------------
const PLANNED = 14;
ok('TC12', 'coverage asserted: every planned assertion ran',
  results.length === PLANNED, `${results.length}/${PLANNED}`);

// --- cleanup -------------------------------------------------------------------
tx((d) => {
  d.prepare("DELETE FROM citations WHERE req_id IN (SELECT req_id FROM requirements WHERE trace_id IN (SELECT trace_id FROM source_documents WHERE product_id=?))").run(PRODUCT);
  d.prepare("DELETE FROM requirements WHERE trace_id IN (SELECT trace_id FROM source_documents WHERE product_id=?)").run(PRODUCT);
  d.prepare("DELETE FROM prd_versions WHERE prd_id=?").run(`PRD-${PRODUCT}`);
  d.prepare("DELETE FROM prds WHERE prd_id=?").run(`PRD-${PRODUCT}`);
  d.prepare("DELETE FROM events WHERE trace_id IN (SELECT trace_id FROM source_documents WHERE product_id=?)").run(PRODUCT);
  d.prepare("DELETE FROM source_documents WHERE product_id=?").run(PRODUCT);
  d.prepare("DELETE FROM products WHERE product_id=?").run(PRODUCT);
});

const width = Math.max(...results.map((r) => r.desc.length));
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(6)} ${r.desc.padEnd(width)}${r.detail ? '  ' + r.detail : ''}`);
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.error('ASSEMBLY VERIFICATION FAILED'); process.exit(1); }
console.log('Assembly verified: a draft reaches in_review, or the run parks and says why.');
