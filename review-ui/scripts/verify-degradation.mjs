// The instrument for BUG-011 and BUG-012: does a failed run tell the truth, and does it
// leave a trace?
//
// Both bugs were found by a real outage rather than by a test, and `evals/README.md`'s
// coverage matrix had carried the row that named them as **NONE — pending** since before
// any code existed. An outage nobody asserted on is evidence, not a test. This is the
// assertion.
//
// Two halves, and they fail for different reasons:
//
//   1. THE REASON CODE.  `classifyProviderError` exists in llm-errors.mjs and, once per
//      node that needs it, copied into the workflows -- a Code node cannot import. EVERY
//      copy is FOUND BY SEARCHING and run over the same table here; a disagreement fails.
//      A table that exercised only the module would prove nothing about what n8n runs.
//   2. THE RECORD.  A model-failure park must leave a `prd_versions` row and a `parked`
//      event, exactly like an assembly park. The property in one sentence: for every
//      trace_id that enters the door, the database can say what became of it.
//
// This file does NOT need n8n. The end-to-end proof — a real provider failure through the
// real workflow — is the fault injection recorded on BUG-012's card, because a fault
// injection that runs on every invocation would need a broken credential lying around.
//
// Usage:  .\run.cmd review-ui/scripts/verify-degradation.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { classifyProviderError, PROVIDER_REASONS } from '../llm-errors.mjs';
import { REASONS, parkRun, getVersion } from '../assemble.mjs';
import { ingest, getDocument } from '../ingest.mjs';
import { all, get } from '../db.mjs';

let failures = 0;
let checks = 0;
const say = (id, pass, msg) => {
  checks++;
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${msg}`);
};

// --- lift every workflow copy out and make it callable -------------------------------------
//
// Extracted from the shipped JSON, not from a fixture of it: the point is to test the bytes
// n8n runs.
// EVERY copy, found by searching, not by a list. A second copy that this file does not
// know about is exactly the drift it exists to catch, so the search is the check.
const copies = [];
for (const file of readdirSync('n8n/workflows').filter((f) => f.endsWith('.json'))) {
  const wf = JSON.parse(readFileSync(`n8n/workflows/${file}`, 'utf8'));
  for (const node of wf.nodes ?? []) {
    const jsCode = node.parameters?.jsCode ?? '';
    const start = jsCode.indexOf('function classifyProviderError');
    if (start < 0) continue;
    const end = jsCode.indexOf('\n}', start);
    // eslint-disable-next-line no-new-func
    const fn = new Function(`${jsCode.slice(start, end + 2)}\nreturn classifyProviderError;`)();
    copies.push({ where: `${file.replace('.json', '')} / ${node.name}`, fn });
  }
}
say('TC1', copies.length >= 2,
  `${copies.length} copies of the classifier found in the workflows: ${copies.map((c) => c.where).join('; ')}`);

// --- TC2: the table, run through the module and through every workflow copy -----------------------------------------------
//
// Every case is a shape a provider or n8n actually produces. The outage case is the first
// one, and it is the reason this card exists.
const CASES = [
  ['n8n has no credential for the node', { message: 'Node does not have any credentials set' }, 'llm_unauthorized'],
  ['a dangling credential reference', { message: 'Credentials could not be found' }, 'llm_unauthorized'],
  ['HTTP 401', { status: 401, message: 'Unauthorized' }, 'llm_unauthorized'],
  ['HTTP 403', { status: 403, message: 'Forbidden' }, 'llm_unauthorized'],
  ['a revoked key', { code: 'invalid_api_key', message: 'Incorrect API key provided' }, 'llm_unauthorized'],
  ['HTTP 429', { status: 429, message: 'Too Many Requests' }, 'llm_rate_limited'],
  // CHANGED 2026-09-03 by BUG-036, and the old expectation was the defect: this asserted
  // `llm_rate_limited`, which tells an operator to wait for something that never passes.
  ['a quota error with no status', { code: 'insufficient_quota', message: 'You exceeded your current quota' }, 'llm_no_credit'],
  // The message the real outage produced, verbatim. It carries no `insufficient_quota` code
  // and no word this classifier used to look for — which is how it reached `llm_error`.
  ['the balance actually running out', { status: 429, message: 'You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.' }, 'llm_no_credit'],
  // CONTROL: a genuine rate limit is still rate limiting. Without this the fix could have
  // swallowed the code it was carved out of.
  ['a genuine rate limit', { status: 429, message: 'Rate limit reached for gpt-4.1-mini' }, 'llm_rate_limited'],
  ['a real timeout', { code: 'ETIMEDOUT', message: 'socket hang up after 60000ms' }, 'llm_timeout'],
  ['an aborted request', { message: 'The operation was aborted due to timeout' }, 'llm_timeout'],
  ['HTTP 408', { status: 408, message: 'Request Timeout' }, 'llm_timeout'],
  // BUG-029. n8n's OWN wording for a client-side timeout, copied from a park row rather than
  // imagined. It contains no "timeout", no errno and no status - the three things the cases
  // above all have - which is why they were green while a real 60-second timeout was being
  // filed as llm_error.
  ['n8n\'s real timeout message', { name: 'NodeApiError', message: 'The connection was aborted, perhaps the server is offline' }, 'llm_timeout'],
  // And its near neighbour, which must NOT move: the far end refusing is not us giving up.
  ['n8n\'s real refusal message', { name: 'NodeApiError', message: 'The service refused the connection - perhaps it is offline' }, 'llm_error'],
  ['a document too long for the model', { code: 'context_length_exceeded', message: 'maximum context length' }, 'llm_malformed_json'],
  ['HTTP 500 from the provider', { status: 500, message: 'Internal server error' }, 'llm_error'],
  ['a bare unknown failure', { message: 'something went wrong' }, 'llm_error'],
  ['nothing at all', undefined, 'llm_error'],
];

for (const [name, err, expected] of CASES) {
  const mine = classifyProviderError(err);
  say('TC2', mine === expected, `${name} -> ${mine}`);
  for (const c of copies) {
    const theirs = c.fn(err);
    say('TC3', mine === theirs,
      `${c.where} agrees (${theirs})${mine === theirs ? '' : ' <-- THE FILE AND THE WORKFLOW DISAGREE'}`);
  }
}

// --- TC4: the ordering that the old code got wrong ------------------------------------------
//
// Every one of these used to be `llm_timeout`, and only the last one was true.
const oldBehaviour = (err) => (err?.code === 'context_length_exceeded' ? 'llm_malformed_json' : 'llm_timeout');
const nowDistinguished = CASES.filter(([, err, expected]) => oldBehaviour(err) !== expected);
// Derived, not typed: it is every case whose truth is neither of the two codes the old
// mapping could produce. A hand-written number here would need editing each time a case is
// added, and would be wrong quietly rather than loudly.
const shouldDiffer = CASES.filter(([, , e]) => e !== 'llm_timeout' && e !== 'llm_malformed_json').length;
say('TC4', nowDistinguished.length === shouldDiffer,
  `${nowDistinguished.length} of ${CASES.length} cases were called "llm_timeout" before this fix and are now named`);
say('TC4', classifyProviderError({ status: 401, message: 'timeout while authenticating' }) === 'llm_unauthorized',
  'a 401 whose message contains "timeout" is still an auth failure — the ordering is load-bearing');

// --- TC5: every code the classifier can return is in the contract ---------------------------
//
// Derived, not typed. A code the classifier invents and the contract has never heard of is a
// park nobody can query, and the closed set exists to prevent exactly that.
const returned = new Set(CASES.map(([, err]) => classifyProviderError(err)));
const contract = readFileSync('docs/contracts.md', 'utf8');
for (const r of PROVIDER_REASONS) {
  say('TC5', REASONS.has(r) && contract.includes(`\`${r}\``),
    `${r} is in assemble.mjs's REASONS and named in docs/contracts.md`);
}
say('TC5', [...returned].every((r) => PROVIDER_REASONS.includes(r)),
  `the classifier returned only declared codes (${[...returned].sort().join(', ')})`);
say('TC5', PROVIDER_REASONS.every((r) => returned.has(r)),
  `and every declared code is exercised by a case above (${returned.size} of ${PROVIDER_REASONS.length})`);

// --- TC6: a model-failure park leaves a row, an event and a reason --------------------------
//
// This is BUG-012 itself. Before the fix there was no version, no `parked` event and no
// dead letter for this path — only an envelope that looked exactly like the one the
// assembly park returns.
const PRODUCT = `verify-degradation-${Date.now()}`;
const env = ingest({
  doc_type: 'transcript', product_id: PRODUCT, source_channel: 'webhook',
  raw_text: 'Marcus (Head of Product): The export must finish inside a minute.',
});
const doc = getDocument(env.doc_id);

const before = all('SELECT prd_version_id FROM prd_versions WHERE trace_id=?', [doc.trace_id]).length;
const parked = parkRun({
  doc, trace_id: doc.trace_id, reason: 'llm_unauthorized', component: 'extractor',
  detail: 'Node does not have any credentials set',
});

say('TC6', parked.status === 'needs_review' && parked.payload.reason === 'llm_unauthorized',
  `the envelope is a park naming the real reason (${parked.payload.reason})`);
say('TC6', Number.isInteger(parked.payload.prd_version_id),
  `it returns the version it created (${parked.payload.prd_version_id}) — BUG-017's lesson, on the second park path`);

const rows = all('SELECT prd_version_id, state, park_reason, degraded FROM prd_versions WHERE trace_id=?',
  [doc.trace_id]);
say('TC6', rows.length === before + 1,
  `the database has exactly one new version row for this trace (${rows.length})`);
say('TC6', rows[0]?.state === 'draft' && rows[0]?.park_reason === 'llm_unauthorized' && rows[0]?.degraded === 1,
  `and it is a degraded draft carrying the reason (state=${rows[0]?.state}, reason=${rows[0]?.park_reason})`);

const events = all("SELECT name, component, detail FROM events WHERE trace_id=? AND name='parked'",
  [doc.trace_id]);
say('TC6', events.length === 1, `there is exactly one parked event (${events.length})`);
say('TC6', events[0]?.component === 'extractor',
  `and it names the stage that failed, not the assembler (component=${events[0]?.component})`);
say('TC6', String(events[0]?.detail ?? '').includes('credentials'),
  'the provider\'s own message is kept beside the code, so the reason is diagnostic');

const version = getVersion(parked.payload.prd_version_id);
say('TC6', version && version.content?.parked === true && (version.content?.requirements ?? []).length === 0,
  'the parked version is readable and carries no requirements');

// --- TC7: what became of every trace ---------------------------------------------------------
//
// The property, asserted rather than described: a document that entered the door and a
// database that cannot say what happened to it is the bug, whatever the response said.
const fate = get(`SELECT
    (SELECT COUNT(*) FROM source_documents WHERE trace_id=?) AS doc,
    (SELECT COUNT(*) FROM prd_versions   WHERE trace_id=?) AS version,
    (SELECT COUNT(*) FROM events         WHERE trace_id=? AND name='parked') AS parked`,
  [doc.trace_id, doc.trace_id, doc.trace_id]);
say('TC7', fate.doc === 1 && fate.version >= 1 && fate.parked === 1,
  `for this trace_id the database can say what became of it (doc=${fate.doc}, versions=${fate.version}, parked=${fate.parked})`);

// --- TC8: the closed set is enforced where the record is written ------------------------------
//
// The first version of this check called `parkRun({ reason: 'llm_confused' })` to prove the
// code was not policed there. It worked, and it wrote a version row carrying a reason the
// contract does not have — which turned `verify-assembly`'s "every park reason is in the
// closed set" red on the next run, against a database this file had dirtied. That is
// BUG-021 exactly, committed by the check written to prevent its cousin. **A verifier may
// not leave a row behind that another verifier will read as a defect**, so the invalid
// reason is never written at all and the enforcement is read where it lives.
const endpointSource = readFileSync('review-ui/server.js', 'utf8');
say('TC8', /REASONS\.has\(reason\)/.test(endpointSource) && /schema_invalid/.test(endpointSource),
  'the closed set is enforced at /internal/park, not inside parkRun');
say('TC8', /REASONS\.has\(reason\)/.test(endpointSource),
  '/internal/park refuses a reason outside the closed set with schema_invalid');

// --- coverage ---------------------------------------------------------------------------------
console.log();
console.log(`Provider-failure cases exercised: ${CASES.length}, through ${copies.length} workflow copies of the classifier.`);
console.log(`Reason codes declared: ${PROVIDER_REASONS.length}. Exercised: ${returned.size}.`);
console.log();
if (failures) {
  console.error(`FAILED — ${failures} of ${checks} checks.`);
} else {
  console.log(`${checks}/${checks} passed. A provider failure now names what happened, every`);
  console.log('copy of the classifier agrees, and the park it produces leaves a row, an event');
  console.log('and a reason behind it.');
}
process.exitCode = failures ? 1 : 0;
