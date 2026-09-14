// Verifies E1-S2's criteria by running them. Repeatable; used by the UAT and re-run
// whenever the door or the redaction rules change.
//
// Does NOT create schema — setup and verification are separate commands (BUG-001).

import { all, get, run, tx, open } from '../db.mjs';
import { ingest } from '../ingest.mjs';
import { normalize, redact, segment } from '../normalize.mjs';

assertSchema();

const results = [];
const ok = (id, desc, pass, detail = '') => results.push({ id, desc, pass, detail });

function assertSchema() {
  try {
    const t = new Set(all("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.name));
    const missing = ['source_documents', 'events', 'products'].filter((x) => !t.has(x));
    if (missing.length) throw new Error(`missing tables: ${missing.join(', ')}`);
  } catch (err) {
    console.error(`Cannot verify: ${err.message}`);
    console.error('Run this first — it verifies, it does not create:');
    console.error('  .\\run.cmd review-ui/scripts/init-db.mjs');
    process.exit(1);
  }
}

const PRODUCT = `verify-ingest-${Date.now()}`;
const EMAIL = 'dana.wu@northwind.example';
const PHONE = '+1 415 555 0142';
const TRANSCRIPT = [
  'Priya (Eng Lead): We need PNG export on every chart, no exceptions.',
  'Marcus (Head of Product): Agreed. Ping me at ' + EMAIL + ' or ' + PHONE + '.',
  'Priya (Eng Lead): Dashboards must load in under two seconds at p95.',
].join('\n');

// --- TC1, TC2, TC3, TC8: canonical shape, one trace_id, segments -------------
const env = ingest({
  doc_type: 'transcript', product_id: PRODUCT, source_channel: 'form', raw_text: TRANSCRIPT,
});
ok('TC1a', 'ingest returns an ok envelope', env.status === 'ok', JSON.stringify(env.payload?.reason ?? ''));

const CANONICAL = ['doc_type', 'title', 'received_at', 'source_channel', 'raw_text',
  'segments', 'pii_redactions', 'target_prd_id'];
const stored = get('SELECT * FROM source_documents WHERE doc_id=?', [env.doc_id]);
ok('TC1b', 'every canonical field is stored',
  CANONICAL.every((f) => stored && stored[f] !== undefined),
  CANONICAL.filter((f) => !stored || stored[f] === undefined).join(', '));

const evts = all("SELECT * FROM events WHERE trace_id=? AND name='ingested'", [env.trace_id]);
ok('TC2', 'trace_id joins the document and its ingested event',
  stored?.trace_id === env.trace_id && evts.length === 1);

const traces = new Set([stored?.trace_id, ...evts.map((e) => e.trace_id)]);
ok('TC3', 'exactly one trace_id for the run', traces.size === 1, [...traces].join(', '));

const segs = JSON.parse(stored.segments);
const segsIndexCorrectly = segs.length === 3 && segs.every(
  (s) => stored.raw_text.slice(s.start_char, s.end_char).includes(s.speaker)
);
ok('TC8', 'speaker segments exist and index into raw_text',
  segsIndexCorrectly, `${segs.length} segments`);

// --- TC4, TC5, TC6: redaction before storage ---------------------------------
ok('TC4a', 'email is absent from stored raw_text', !stored.raw_text.includes(EMAIL));
ok('TC4b', 'phone is absent from stored raw_text', !stored.raw_text.includes(PHONE));
const red = JSON.parse(stored.pii_redactions);
ok('TC4c', 'redactions are recorded with kind and count',
  red.some((r) => r.kind === 'email') && red.some((r) => r.kind === 'phone'),
  JSON.stringify(red));

const anyAddress = all('SELECT raw_text FROM source_documents')
  .filter((r) => /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(r.raw_text));
ok('TC5', 'no address-shaped string in any stored document', anyAddress.length === 0,
  `${anyAddress.length} rows`);

ok('TC6', 'internal stakeholder names are kept', stored.raw_text.includes('Priya (Eng Lead)'));

// --- TC7: raw_text immutable --------------------------------------------------
let refused = false;
try { run('UPDATE source_documents SET raw_text=? WHERE doc_id=?', ['x', env.doc_id]); }
catch { refused = true; }
ok('TC7', 'raw_text is immutable after insert', refused);

// --- TC9: no speakers is not a failure ---------------------------------------
const notesEnv = ingest({
  doc_type: 'notes', product_id: PRODUCT, source_channel: 'form',
  raw_text: '- export charts as png\n- p95 under 2s\n- sso, probably okta',
});
const notesSegs = notesEnv.status === 'ok'
  ? JSON.parse(get('SELECT segments FROM source_documents WHERE doc_id=?', [notesEnv.doc_id]).segments)
  : null;
ok('TC9', 'a document with no speakers succeeds with empty segments',
  notesEnv.status === 'ok' && Array.isArray(notesSegs) && notesSegs.length === 0);

// --- TC10: empty is refused and stores nothing -------------------------------
const before = get('SELECT COUNT(*) AS n FROM source_documents').n;
const emptyEnv = ingest({ doc_type: 'transcript', product_id: PRODUCT, source_channel: 'form', raw_text: '   \n  ' });
const after = get('SELECT COUNT(*) AS n FROM source_documents').n;
ok('TC10', 'empty source refused with a machine-readable reason, nothing stored',
  emptyEnv.status === 'error' && emptyEnv.payload.reason === 'empty_source' && before === after,
  JSON.stringify(emptyEnv.payload));

// --- TC11: the two doors are interchangeable ---------------------------------
const viaWebhook = ingest({
  doc_type: 'transcript', product_id: PRODUCT, source_channel: 'webhook', raw_text: TRANSCRIPT,
});
const a = get('SELECT * FROM source_documents WHERE doc_id=?', [env.doc_id]);
const b = get('SELECT * FROM source_documents WHERE doc_id=?', [viaWebhook.doc_id]);
const ALLOWED_DIFFS = new Set(['doc_id', 'trace_id', 'created_at', 'source_channel', 'received_at']);
const diffs = Object.keys(a).filter((k) => !ALLOWED_DIFFS.has(k) && a[k] !== b[k]);
ok('TC11', 'form and webhook doors store identical documents', diffs.length === 0,
  diffs.length ? `differ on: ${diffs.join(', ')}` : 'only ids/timestamps/channel differ');

// --- TC13: negative control — the redaction check can actually fail ----------
// Prove the assertion is capable of going red, rather than trusting that it would.
const leaked = redact('no contact details here at all').text;
const controlWouldPass = !leaked.includes('@');
const unredacted = `reach me at ${EMAIL}`;
const controlCatchesLeak = unredacted.includes(EMAIL) && redact(unredacted).text.includes(EMAIL) === false;
ok('TC13', 'the PII assertion distinguishes redacted from unredacted text',
  controlWouldPass && controlCatchesLeak);

// --- cleanup ------------------------------------------------------------------
tx((d) => {
  d.prepare('DELETE FROM events WHERE trace_id IN (SELECT trace_id FROM source_documents WHERE product_id=?)').run(PRODUCT);
  d.prepare('DELETE FROM source_documents WHERE product_id=?').run(PRODUCT);
  d.prepare('DELETE FROM products WHERE product_id=?').run(PRODUCT);
});

// --- report -------------------------------------------------------------------
const width = Math.max(...results.map((r) => r.desc.length));
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(6)} ${r.desc.padEnd(width)}${r.detail ? '  ' + r.detail : ''}`);
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.error('INGEST VERIFICATION FAILED'); process.exit(1); }
console.log('Ingest verified: canonical shape, one trace_id, PII redacted before storage.');
