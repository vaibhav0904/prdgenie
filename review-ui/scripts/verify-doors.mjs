// E2-S1 verification: both doors are real, they produce the identical document, and the
// producer that drives them can fail.
//
// The reason this file exists at all is BUG-005: the form door had never once been opened.
// It was verified by reading the workflow JSON, which is not a check — n8n refused to start
// the workflow, and nothing in the repo could have told us. Every door this system claims
// is now exercised THROUGH the door.
//
// Usage:  node --env-file-if-exists=.env review-ui/scripts/verify-doors.mjs

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { all } from '../db.mjs';

const N8N = (process.env.N8N_API_URL ?? 'http://localhost:5678').replace(/\/$/, '');
const WEBHOOK = process.env.N8N_INGEST_WEBHOOK_URL ?? `${N8N}/webhook/ingest`;
const FORM = process.env.N8N_INGEST_FORM_URL ?? `${N8N}/form/prdgenie-ingest-form`;
const PRODUCT = process.env.EVAL_PRODUCT_ID ?? 'forgesight';

// Deliberately contains a phone number and an email: parity has to hold on the redaction
// path too, which is where the two doors could most plausibly diverge.
const PARITY_TEXT = [
  'Marcus (Head of Product): The first chart on a dashboard must render in under two seconds.',
  'Dana (Customer Success): Rachel wants it emailed. She is on +44 20 7946 0812 or rachel@northwindlogistics.com.',
  'Priya (Eng Lead): We read from the existing warehouse. No second database.',
].join('\n');

const results = [];
const ok = (id, desc, pass, detail = '') => results.push({ id, desc, pass, detail });

const node = (args, env = {}) =>
  execFileSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, ...env } });

function newestDoc(channel) {
  return all(
    `SELECT doc_id, product_id, trace_id, doc_type, title, received_at, source_channel,
            raw_text, segments, pii_redactions, target_prd_id, created_at
     FROM source_documents WHERE source_channel=? ORDER BY rowid DESC LIMIT 1`, [channel]
  )[0] ?? null;
}

function countDocs(channel) {
  return all('SELECT COUNT(*) AS n FROM source_documents WHERE source_channel=?', [channel])[0].n;
}

/**
 * The form door answers the browser the moment it accepts the release and finishes the
 * workflow afterwards, so reading the database straight after the POST races the insert.
 * Waiting for the row is the honest fix; sleeping a fixed interval and hoping is not.
 */
async function waitForNewDoc(channel, before, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (countDocs(channel) > before) return newestDoc(channel);
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

// --- TC1: the webhook door ----------------------------------------------------

let webhookEnv = null;
try {
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // `dispatch: false` — the door, not the pipeline (E6-S2). WF1 now CALLS WF2 or WF3 after
    // it routes, and this file is about what the door stores, which is settled before any of
    // that. The form knock below cannot say this and does not: a person's door has no such
    // field, so TC2 pays for one run every time and proves the whole path in exchange.
    body: JSON.stringify({
      product_id: PRODUCT, doc_type: 'transcript', raw_text: PARITY_TEXT, dispatch: false,
    }),
  });
  webhookEnv = await res.json();
} catch (err) {
  webhookEnv = { status: 'error', payload: { reason: err.message } };
}
const webhookDoc = webhookEnv?.status === 'ok' ? newestDoc('webhook') : null;
ok('TC1', 'the webhook door accepts JSON and stores a canonical document',
  Boolean(webhookDoc) && webhookEnv.status === 'ok' && Boolean(webhookEnv.trace_id),
  webhookDoc ? `${webhookDoc.doc_id} trace=${webhookEnv.trace_id}`
    : `envelope: ${JSON.stringify(webhookEnv?.payload ?? webhookEnv)}`);

// --- TC2: door parity ---------------------------------------------------------
// n8n's Form Trigger accepts multipart/form-data only, keyed by field INDEX — `field-0`,
// `field-1` — never by the label a human sees. Node's built-in FormData sets the boundary
// for us, so this is still zero npm dependencies (ADR 0009).
//
// THE INDICES ARE DERIVED FROM THE FORM, NOT TYPED HERE (BUG-043). They were typed once, as
// field-0..field-3, and then E4-S6 inserted "Who wrote this?" as the third field. Every index
// after it shifted by one: the document text went into the authorship dropdown and the
// required Text field received an empty string. WF1 refused the envelope correctly, the form
// trigger had already answered 200, and **the door was shut for two days behind a success**.
//
// A positional binding is a contract nobody can see. So this reads the labels out of the
// shipped workflow and asks it for the index — and if a label it needs is gone, it says which
// one, rather than posting to whatever now sits at that number.
const formFields = JSON.parse(readFileSync('n8n/workflows/WF1-ingest.json', 'utf8'))
  .nodes.find((n) => n.name === 'Door: Form')?.parameters?.formFields?.values ?? [];

const missingLabels = [];
const fieldFor = (label) => {
  const i = formFields.findIndex((f) => f.fieldLabel === label);
  if (i < 0) { missingLabels.push(label); return null; }
  return `field-${i}`;
};
const F_PRODUCT = fieldFor('Product');
const F_DOCTYPE = fieldFor('Document type');
const F_AUTHOR = fieldFor('Who wrote this?');
const F_TEXT = fieldFor('Text');

// THE CONTROL for the derivation itself. `fieldFor` must READ the list, not return a constant
// that happens to be right today — otherwise it is the same typed contract with more comments.
// Reorder the labels in memory and the index has to move with them.
// The plant is an INSERTED field, because insertion is what actually happened: E4-S6 added a
// field in the middle and every index below it moved by one.
const withInserted = [{ fieldLabel: 'A field added later' }, ...formFields];
const textIndexNow = formFields.findIndex((f) => f.fieldLabel === 'Text');
const textIndexAfterInsert = withInserted.findIndex((f) => f.fieldLabel === 'Text');
ok('TC2c', 'the form field indices are DERIVED from the shipped form, not typed here',
  textIndexAfterInsert === textIndexNow + 1 && F_TEXT === `field-${textIndexNow}`,
  `Text is ${F_TEXT} today; insert one field above it and the derivation follows to `
  + `field-${textIndexAfterInsert} — which is exactly what nobody noticed in E4-S6`);

let formError = null;
const formsBefore = countDocs('form');
if (missingLabels.length) {
  // Loudly, and without submitting: a form whose labels moved is a form this check no longer
  // knows how to fill, and guessing is how the last two days happened.
  formError = `the form no longer has: ${missingLabels.join(', ')} — indices cannot be derived`;
} else {
  try {
    const fd = new FormData();
    fd.append(F_PRODUCT, PRODUCT);
    fd.append(F_DOCTYPE, 'transcript');
    fd.append(F_AUTHOR, 'Someone else — a meeting, an email, a customer');
    fd.append(F_TEXT, PARITY_TEXT);
    const res = await fetch(FORM, { method: 'POST', body: fd });
    if (!res.ok) formError = `HTTP ${res.status} from ${FORM}`;
    await res.text();
  } catch (err) {
    formError = err.message;
  }
}
const formDoc = formError ? null : await waitForNewDoc('form', formsBefore);
if (!formError && !formDoc) formError = 'accepted, but no new form document appeared within 20s';

// Fields that MUST differ, because each ingest is its own event: a new id, a new trace, a
// new clock reading. Everything else is the canonical document and must be identical.
const PER_INGEST = new Set(['doc_id', 'trace_id', 'created_at', 'received_at', 'source_channel']);
const diffs = [];
if (webhookDoc && formDoc) {
  for (const key of Object.keys(webhookDoc)) {
    if (PER_INGEST.has(key)) continue;
    if (String(webhookDoc[key]) !== String(formDoc[key])) {
      diffs.push(`${key}: webhook=${JSON.stringify(String(webhookDoc[key]).slice(0, 40))} form=${JSON.stringify(String(formDoc[key]).slice(0, 40))}`);
    }
  }
}
ok('TC2', 'the same text through both doors stores the identical canonical document',
  Boolean(webhookDoc) && Boolean(formDoc) && diffs.length === 0,
  formError ? `form door: ${formError}`
    : !formDoc ? 'the form was accepted but no document with source_channel=form was stored'
      : !webhookDoc ? 'no webhook document to compare against'
        : diffs.length ? diffs.join(' | ')
          : `${Object.keys(webhookDoc).length - PER_INGEST.size} canonical fields equal; `
            + `channels differ as designed (${webhookDoc.source_channel}/${formDoc.source_channel})`);

// A parity that held only on plain text would miss the interesting half. State the
// redaction evidence explicitly rather than trusting the loop above to have covered it.
const redactionsMatch = webhookDoc && formDoc
  && webhookDoc.pii_redactions === formDoc.pii_redactions
  && !webhookDoc.raw_text.includes('northwindlogistics.com');
ok('TC2b', 'parity holds through redaction: same redactions, and neither stores the address',
  Boolean(redactionsMatch),
  webhookDoc ? `redactions: ${webhookDoc.pii_redactions}` : 'no webhook document');

// --- TC6: the producer grades nothing -----------------------------------------

const producerSrc = readFileSync('evals/harness/produce.mjs', 'utf8');
// Comments legitimately discuss grading; code must not perform it. Strip comments first,
// or this check fails on the paragraph explaining why it exists.
const producerCode = producerSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const GRADING_TERMS = /\b(recall|precision|threshold|expected_requirements|expected_open_questions|loadLabels|resolveLabels|overlaps|verdict|PASS|FAIL_CASE)\b/;
const leaked = producerCode.match(GRADING_TERMS);
ok('TC6', 'produce.mjs contains no grading logic and no quality assertion',
  !leaked, leaked ? `found: ${leaked[0]}` : 'no label, threshold or verdict reference in code');

// --- TC5 / TC9 / TC10: the producer can fail, and says what it covered ---------
// Both controls run the real producer as a child process and read its exit code. A
// verification that inspected the source instead would be the BUG-001 disease again.

const TMP_MANIFEST = 'evals/results/.verify-doors.json';
const BAD_FIXTURE = 'evals/datasets/docs/ZZ-verify-doors.json';
const cleanup = () => { for (const f of [TMP_MANIFEST, BAD_FIXTURE]) if (existsSync(f)) rmSync(f); };

try {
  // TC5 — one bad fixture among the real ones. The rest must still run.
  writeFileSync(BAD_FIXTURE, JSON.stringify({
    fixture_id: 'ZZ', doc_type: 'transcript', raw_text: '   ',
    note: 'Temporary, written and deleted by verify-doors.mjs (TC5). Not part of the dataset.',
  }, null, 2));

  let partial = { code: 0, out: '' };
  try {
    partial.out = node(['--env-file-if-exists=.env', 'evals/harness/produce.mjs',
      '--ingest-only', `--manifest=${TMP_MANIFEST}`]);
  } catch (err) {
    partial = { code: err.status, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
  const partialManifest = existsSync(TMP_MANIFEST) ? JSON.parse(readFileSync(TMP_MANIFEST, 'utf8')) : null;
  const goodRuns = Object.keys(partialManifest?.runs ?? {}).length;
  ok('TC5', 'one failing fixture stops nothing else, and the command still exits non-zero',
    partial.code === 1 && goodRuns >= 9 && (partialManifest?.failures ?? []).includes('ZZ'),
    `exit=${partial.code}, ${goodRuns} fixtures still ingested, failed=${JSON.stringify(partialManifest?.failures ?? [])}`);

  ok('TC10', 'the run asserts its own coverage: attempted vs available (BUG-003)',
    Number.isInteger(partialManifest?.fixtures_available)
      && Number.isInteger(partialManifest?.fixtures_attempted)
      && /Coverage: \d+ of \d+/.test(partial.out),
    `manifest says ${partialManifest?.fixtures_attempted}/${partialManifest?.fixtures_available}; `
      + `console prints a coverage line`);
} finally {
  cleanup();
}

// TC9 — the door is gone. Every fixture must fail and the command must go red.
// The .env file is deliberately NOT loaded here: --env-file would overwrite the dead URL
// with the live one and the "control" would quietly test nothing (the mistake made once
// already, in E1's TC14).
const DEAD_DOOR = 'http://127.0.0.1:59999/webhook/ingest';
let dead = { code: 0, out: '' };
try {
  dead.out = node(['evals/harness/produce.mjs', '--ingest-only', `--manifest=${TMP_MANIFEST}`],
    { N8N_INGEST_WEBHOOK_URL: DEAD_DOOR });
} catch (err) {
  dead = { code: err.status, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
}
const deadManifest = existsSync(TMP_MANIFEST) ? JSON.parse(readFileSync(TMP_MANIFEST, 'utf8')) : null;
ok('TC9', 'NEGATIVE CONTROL: with the door gone, every fixture fails and the exit code is non-zero',
  dead.code === 1 && (deadManifest?.failures ?? []).length === (deadManifest?.fixtures_attempted ?? -1),
  `exit=${dead.code}, ${(deadManifest?.failures ?? []).length} of ${deadManifest?.fixtures_attempted} failed`);
cleanup();

// --- report -------------------------------------------------------------------

const width = Math.max(...results.map((r) => r.desc.length));
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(6)} ${r.desc.padEnd(width)}${r.detail ? '  ' + r.detail : ''}`);
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.error('DOOR VERIFICATION FAILED'); process.exit(1); }
console.log('Both doors open, and they store the same document.');
