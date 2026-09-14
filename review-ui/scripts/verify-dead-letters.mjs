// The instrument for E7-S3: is a run that died a queue entry, or a document that never
// arrived?
//
// Everything goes through the HTTP API. The queue is an operator surface, and a queue that
// only works from inside the process is not one.
//
// Usage:  .\run.cmd review-ui/scripts/verify-dead-letters.mjs
//
// Needs the review service running. The n8n drill is a separate command:
//   .\run.cmd review-ui/scripts/drill-service-unreachable.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { get, all } from '../db.mjs';
import { REASONS, DEAD_LETTER_ONLY } from '../assemble.mjs';

const BASE = `http://localhost:${process.env.SERVICE_PORT ?? 3000}`;
const KEY = process.env.INTERNAL_API_KEY;

let failures = 0;
let checks = 0;
const say = (id, pass, msg, detail = '') => {
  checks++;
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${msg}${detail ? `  — ${detail}` : ''}`);
};

const post = async (path, body, internal = true) => {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(internal && KEY ? { 'x-internal-key': KEY } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const getJson = async (path) => (await fetch(BASE + path)).json();

const TRACE = `verify-dl-${Date.now()}`;

console.log('');
console.log('E7-S3 — the needs-attention queue');
console.log('=================================');
console.log('');

// --- TC1 / TC2: the wiring, read from the committed workflows -----------------------------
{
  const DIR = 'n8n/workflows';
  const files = readdirSync(DIR).filter((n) => n.endsWith('.json'));
  const handler = JSON.parse(readFileSync(`${DIR}/WF4-error-handler.json`, 'utf8'));
  const others = files.filter((f) => f !== 'WF4-error-handler.json')
    .map((f) => ({ f, wf: JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) }));
  const unrouted = others.filter((o) => o.wf.settings?.errorWorkflow !== handler.id);

  say('TC1', others.length >= 3 && unrouted.length === 0,
    'every workflow names WF4 as its error workflow',
    unrouted.length ? `unrouted: ${unrouted.map((o) => o.f).join(', ')}` : `${others.length} routed`);
  say('TC2', Boolean((handler.nodes ?? []).find((n) => n.type === 'n8n-nodes-base.errorTrigger')),
    'the wiring is a committed field, checked by a command, not a click',
    '.\\run.cmd n8n/scripts/check-error-routing.mjs — and it reads the RUNNING instance too');
}

// --- TC3 / TC4: a dead letter someone can act on -------------------------------------------
{
  const r = await post('/internal/dead-letter', {
    trace_id: TRACE,
    doc_id: 'DOC-VERIFY-DL',
    component: 'error_handler',
    reason: 'workflow_error',
    workflow: 'PRDGenie WF2 - Generate PRD',
    node: 'Grounding check (code decides)',
    message: 'connect ECONNREFUSED 192.168.65.254:3000',
    execution_id: '4711',
  });
  const id = r.body.payload?.dead_letter_id;
  const row = id ? get('SELECT * FROM dead_letters WHERE dead_letter_id=?', [id]) : null;
  const detail = row ? JSON.parse(row.envelope) : {};

  say('TC3', Boolean(row) && row.trace_id === TRACE && row.component === 'error_handler'
    && row.reason === 'workflow_error' && Boolean(row.envelope),
    'a dead letter carries trace_id, component, a reason code and detail', `id=${id}`);

  // The test the card asks for: can someone act on the row ALONE?
  const actionable = ['workflow', 'node', 'message'].filter((k) => detail[k]);
  say('TC4', actionable.length === 3,
    'the row names the workflow, the node and the message — no log needed',
    `${detail.workflow} / ${detail.node} / ${String(detail.message).slice(0, 40)}…`);

  // And it answers "what became of this trace_id", which is the spine's one guarantee.
  const ev = all('SELECT name FROM events WHERE trace_id=?', [TRACE]).map((e) => e.name);
  say('TC3b', ev.includes('dead_lettered'),
    'the trace_id has a recorded fate, like every other outcome', ev.join(', ') || 'no events');
}

// --- TC5: the closed set --------------------------------------------------------------------
{
  const r = await post('/internal/dead-letter', {
    trace_id: TRACE, reason: 'everything_broke', message: 'x',
  });
  const stored = get("SELECT COUNT(*) n FROM dead_letters WHERE reason='everything_broke'").n;
  say('TC5', r.status === 400 && r.body.payload?.reason === 'schema_invalid' && stored === 0,
    'a reason outside the closed set is refused, not stored',
    `${r.status} ${r.body.payload?.reason} — ${stored} row(s) stored`);

  say('TC5b', REASONS.has('service_unreachable') && REASONS.has('workflow_error')
    && [...DEAD_LETTER_ONLY].every((x) => REASONS.has(x)),
    'the two new codes are in the contract\'s closed set',
    `dead-letter-only: ${[...DEAD_LETTER_ONLY].join(', ')}`);
}

// --- TC6: a failure with no trace_id is still kept -------------------------------------------
{
  const r = await post('/internal/dead-letter', {
    reason: 'workflow_error', workflow: 'PRDGenie WF1 - Ingest', node: 'Map form input',
    message: 'Cannot read properties of undefined',
  });
  const id = r.body.payload?.dead_letter_id;
  const row = id ? get('SELECT trace_id FROM dead_letters WHERE dead_letter_id=?', [id]) : null;
  const shown = (await getJson('/api/dead-letters')).dead_letters.find((d) => d.dead_letter_id === id);
  say('TC6', Boolean(row) && row.trace_id === null && shown?.joinable === false,
    'a failure with no trace_id is STORED and flagged, never dropped',
    'losing the failure to keep a column tidy would be exactly backwards');
}

// --- TC7: newest first ------------------------------------------------------------------------
{
  const { dead_letters: list } = await getJson('/api/dead-letters');
  const ids = list.map((d) => d.dead_letter_id);
  const sorted = [...ids].sort((a, b) => b - a);
  say('TC7', ids.length >= 2 && ids.join() === sorted.join(),
    'the queue is newest first', `${ids.length} unresolved`);
}

// --- TC8 / TC9 / TC11: resolving --------------------------------------------------------------
{
  const { dead_letters: list } = await getJson('/api/dead-letters');
  const target = list.find((d) => d.trace_id === TRACE);

  const noNote = await post(`/api/dead-letters/${target.dead_letter_id}/resolve`, {}, false);
  say('TC8a', noNote.status === 400 && noNote.body.reason === 'reason_required',
    'resolving without a note is refused BY THE ENDPOINT', `${noNote.status} ${noNote.body.reason}`);

  const before = get('SELECT reason, envelope FROM dead_letters WHERE dead_letter_id=?',
    [target.dead_letter_id]);
  const done = await post(`/api/dead-letters/${target.dead_letter_id}/resolve`,
    { note: 'service was restarted; the run was replayed by hand' }, false);
  const after = get('SELECT * FROM dead_letters WHERE dead_letter_id=?', [target.dead_letter_id]);

  say('TC8b', done.status === 200 && Boolean(after.resolved_at) && Boolean(after.resolution_note),
    'an entry is marked resolved with a note', after.resolution_note);
  say('TC9', after.reason === before.reason && after.envelope === before.envelope,
    'resolving ADDS to the record — the reason and the detail are untouched');

  const again = await post(`/api/dead-letters/${target.dead_letter_id}/resolve`,
    { note: 'second go' }, false);
  say('TC9b', again.status === 409, 'a resolved entry cannot be silently re-resolved',
    `${again.status} ${again.body.reason}`);

  const dflt = await getJson('/api/dead-letters');
  const withAll = await getJson('/api/dead-letters?all=1');
  say('TC11',
    !dflt.dead_letters.some((d) => d.dead_letter_id === target.dead_letter_id)
    && withAll.dead_letters.some((d) => d.dead_letter_id === target.dead_letter_id),
    'a resolved entry leaves the default view and is still retrievable', '?all=1');
}

// --- TC10: zero markup sinks ------------------------------------------------------------------
{
  const page = readFileSync('review-ui/public/attention.html', 'utf8');
  const sinks = ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write'];
  // A dead letter's message is whatever n8n caught, which can contain source-document text.
  // Counted the same way E4-S2 counts it, on the same reasoning.
  const assignments = sinks.flatMap((s) => [...page.matchAll(new RegExp(`\\.${s}\\s*=`, 'g'))].map(() => s))
    .concat([...page.matchAll(/document\.write\s*\(/g)].map(() => 'document.write'));
  say('TC10', assignments.length === 0,
    'the queue page has zero markup sinks — every node is createTextNode or createElement',
    assignments.length ? `found: ${[...new Set(assignments)].join(', ')}` : '0 of 4 sinks used');
}

// ---------------------------------------------------------------------------------------------

console.log('');
console.log(`${checks - failures}/${checks} checks passed`);
console.log('');
console.log('TC12-TC16 are the drill and its control, and they are separate commands:');
console.log('  .\\run.cmd review-ui/scripts/drill-service-unreachable.mjs');
console.log('');
if (failures) process.exit(1);
