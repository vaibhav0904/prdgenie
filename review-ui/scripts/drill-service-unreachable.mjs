// THE DRILL for E7-S3: kill the review service mid-run and see what the operator gets.
//
// `docs/architecture.md` has promised since E1 that a failure lands somewhere visible. This
// is the first time that promise is made to happen rather than described, and the drill is
// deliberately the cheap half of E7-S4's: the service dies, not the provider, so it costs no
// model call and can be run as often as anyone likes.
//
// The sequence, and every step matters:
//
//   1. ingest a document through the real door, service UP  — so there is a run to kill
//   2. KILL the review service
//   3. trigger WF2 for that document                        — the run dies mid-flight
//   4. restart the service and read the queue
//
// What is asserted is not "something failed". It is that a person looking at one screen can
// see WHICH run died, WHERE, and WHY, without opening n8n.
//
// Usage:  .\run.cmd review-ui/scripts/drill-service-unreachable.mjs
//
// Leaves the review service running. Costs no model call unless WF2 gets far enough to make
// one, which is itself part of what the drill reports.

import { spawn, execSync } from 'node:child_process';
import { get } from '../db.mjs';
import { takeExclusive } from '../../exclusive.mjs';

// ONE MUTATOR AT A TIME (BUG-054).
// This script stops the review service — so a second copy of it, or a `check-all` sweep running
// beside it, interleaves, and each reports the other's cleanup as its own defect. Inside a
// sweep that already holds the lock this is a no-op.
takeExclusive('review-ui/scripts/drill-service-unreachable.mjs', {
  files: ['review-ui/server.js (the process)'],
});

const PORT = process.env.SERVICE_PORT ?? 3000;
const BASE = `http://localhost:${PORT}`;
const INGEST = process.env.N8N_INGEST_WEBHOOK_URL ?? 'http://localhost:5678/webhook/ingest';
const GENERATE = INGEST.replace(/\/ingest$/, '/generate');
const SERVER = 'review-ui/server.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
let checks = 0;
const say = (id, pass, msg, detail = '') => {
  checks++;
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${msg}${detail ? `  — ${detail}` : ''}`);
};

async function healthy(deadlineMs = 20000) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    try {
      if ((await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1000) })).ok) return true;
    } catch { /* not up */ }
    await sleep(300);
  }
  return false;
}

function killService() {
  try {
    const lines = execSync('netstat -ano', { encoding: 'utf8' }).split('\n')
      .filter((l) => l.includes('LISTENING') && l.includes(`:${PORT} `));
    for (const pid of new Set(lines.map((l) => l.trim().split(/\s+/).pop()))) {
      if (pid && pid !== '0') { try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }); } catch { /* gone */ } }
    }
  } catch { /* nothing listening */ }
}

let child = null;
async function startService() {
  child = spawn(process.execPath, ['--env-file-if-exists=.env', SERVER],
    { stdio: 'ignore', detached: true, windowsHide: true });
  child.unref();
  return healthy();
}

const post = async (url, body, ms = 180000) => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    });
    return await res.json().catch(() => ({ status: 'error', payload: { reason: 'non-JSON' } }));
  } catch (err) {
    return { status: 'error', payload: { reason: 'no response', missing: [err.message] } };
  }
};

console.log('');
console.log('E7-S3 DRILL — kill the review service mid-run');
console.log('=============================================');
console.log('');

// --- 1. a run to kill ----------------------------------------------------------------------
if (!await healthy(5000) && !await startService()) {
  console.error('the review service will not start; the drill cannot begin');
  process.exit(1);
}

const before = (await (await fetch(`${BASE}/api/dead-letters?all=1`)).json()).total;

const env = await post(INGEST, {
  product_id: `drill-${Date.now()}`,
  doc_type: 'transcript',
  title: 'E7-S3 drill',
  raw_text: 'Priya (Eng Lead): Every dashboard must be renamable without breaking a shared link.\n'
    + 'Dana (Customer Success): And an admin has to be able to revoke a link immediately.',
});
if (env.status !== 'ok') {
  console.error(`the door refused before the drill started: ${JSON.stringify(env.payload ?? env)}`);
  process.exit(1);
}
console.log(`  ingested ${env.doc_id}  trace=${env.trace_id}`);
console.log('');

// --- 2 & 3. kill it, then run ---------------------------------------------------------------
console.log('  killing the review service, then triggering WF2 against a dead service…');
killService();
await sleep(1000);
const gen = await post(GENERATE, { doc_id: env.doc_id });
console.log(`  WF2 answered: ${gen.status ?? 'nothing'} ${gen.payload?.reason ?? ''}`);
console.log('');

// --- 4. restart and look at the queue --------------------------------------------------------
if (!await startService()) {
  console.error('the review service would not come back; cannot read the queue');
  process.exit(1);
}

// WF4 retries five times, three seconds apart, precisely because the service it needs is the
// one that just died. Give it the room it was configured for rather than reading too early —
// "/healthz greens early" is a lesson this project already paid for (BUG-005/006/018).
let queue = null;
for (let i = 0; i < 12; i++) {
  queue = await (await fetch(`${BASE}/api/dead-letters?all=1`)).json();
  if (queue.total > before) break;
  await sleep(2000);
}

const fresh = queue.dead_letters.filter((d) => d.trace_id === env.trace_id);
const anyNew = queue.total - before;

say('TC12', anyNew > 0,
  'killing the service mid-run produces a visible dead letter',
  `${anyNew} new entr${anyNew === 1 ? 'y' : 'ies'} in the queue`);

const it = fresh[0];
say('TC13', Boolean(it) && it.reason === 'service_unreachable'
  && Boolean(it.envelope?.node) && it.trace_id === env.trace_id,
  'the entry names the reason, the node and the trace_id of the run that died',
  it ? `${it.reason} at ${it.envelope?.node} — ${String(it.envelope?.message ?? '').slice(0, 60)}` : 'no entry for this trace');

const doc = get('SELECT doc_id FROM source_documents WHERE trace_id=?', [env.trace_id]);
const version = get('SELECT prd_version_id, state, park_reason FROM prd_versions WHERE trace_id=?',
  [env.trace_id]);
say('TC14', Boolean(doc),
  'the source document survives the death of the run', doc?.doc_id ?? 'GONE');

// Stated rather than asserted: whether a version exists depends on how far WF2 got before the
// service went away, and both answers are legitimate. What is NOT legitimate is a version in
// `in_review` — a PRD assembled during an outage would be the confident wrong answer the
// architecture forbids.
say('TC14b', !version || version.state !== 'in_review',
  'no PRD reached in_review during the outage',
  version ? `version ${version.prd_version_id}: ${version.state}/${version.park_reason ?? 'no reason'}`
    : 'no version at all, which is the expected shape');

console.log('');
console.log('  Queue after the drill:');
for (const d of queue.dead_letters.slice(0, 4)) {
  console.log(`    #${d.dead_letter_id}  ${d.reason.padEnd(20)} ${d.envelope?.workflow ?? '?'} / ${d.envelope?.node ?? '?'}`);
  console.log(`             trace=${d.trace_id ?? '(none)'}  ${String(d.envelope?.message ?? '').slice(0, 70)}`);
}

console.log('');
console.log(`${checks - failures}/${checks} checks passed`);
console.log('');
console.log('The review service is running again. Nothing was reset; the drill left its own');
console.log('document, its own run and its own queue entries behind, which is the point.');
if (failures) process.exit(1);
