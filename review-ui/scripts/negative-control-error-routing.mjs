// Two controls for E7-S3, and they pull in opposite directions (TC15 and TC16).
//
//   TC16  Take WF4 away, kill the service, run. The queue must stay EMPTY.
//         Without this, "a dead letter appeared" could be something else writing rows.
//
//   TC15  Break the TELEMETRY call instead, with everything else intact. The run must
//         COMPLETE. A product that stops because logging stopped has the rule backwards
//         (docs/traceability.md), and BUG-028 was the same distinction drawn wrongly in the
//         other direction — so both halves get a control on the same day.
//
// Each fault is injected into a clean copy of the workflows, imported, exercised, and then
// the files are restored from the bytes read before anything was touched. n8n is restarted
// four times, which is slow and is the only way to exercise the real path.
//
// TC15 costs one fixture's worth of model calls. TC16 costs none.
//
// Usage:  .\run.cmd review-ui/scripts/negative-control-error-routing.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { spawn, execSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ingest, getDocument } from '../ingest.mjs';
import { takeExclusive } from '../../exclusive.mjs';

// ONE MUTATOR AT A TIME (BUG-054).
// This script rewrites WF0 and WF2, re-imports them, and restarts n8n four times — so a second
// copy of it, or a `check-all` sweep running beside it, interleaves, and each reports the
// other's cleanup as its own defect. Inside a sweep that already holds the lock this is a
// no-op.
takeExclusive('review-ui/scripts/negative-control-error-routing.mjs', {
  files: ['n8n/workflows/WF0-llm-call.json', 'n8n/workflows/WF2-generate-prd.json'],
});

const PORT = process.env.SERVICE_PORT ?? 3000;
const BASE = `http://localhost:${PORT}`;
const INGEST = process.env.N8N_INGEST_WEBHOOK_URL ?? 'http://localhost:5678/webhook/ingest';
const GENERATE = INGEST.replace(/\/ingest$/, '/generate');
const CONTAINER = process.env.N8N_CONTAINER ?? 'n8n-local';
const SERVER = 'review-ui/server.js';

const WF2 = 'n8n/workflows/WF2-generate-prd.json';
const WF0 = 'n8n/workflows/WF0-llm-call.json';

const original = new Map([[WF2, readFileSync(WF2)], [WF0, readFileSync(WF0)]]);
const hash = (b) => createHash('sha256').update(b).digest('hex');
const originalHashes = new Map([...original].map(([f, b]) => [f, hash(b)]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
let checks = 0;
const say = (id, pass, msg, detail = '') => {
  checks++;
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${msg}${detail ? `  — ${detail}` : ''}`);
};

// --- the two processes ----------------------------------------------------------------------
async function serviceUp(deadline = 20000) {
  const until = Date.now() + deadline;
  while (Date.now() < until) {
    try { if ((await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1000) })).ok) return true; }
    catch { /* not up */ }
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
async function startService() {
  const c = spawn(process.execPath, ['--env-file-if-exists=.env', SERVER],
    { stdio: 'ignore', detached: true, windowsHide: true });
  c.unref();
  return serviceUp();
}

async function reimportAndRestart() {
  execFileSync(process.execPath, ['--env-file-if-exists=.env', 'n8n/scripts/import-workflows.mjs'],
    { stdio: 'pipe' });
  execFileSync('docker', ['restart', CONTAINER], { stdio: 'pipe' });
  const until = Date.now() + 180000;
  while (Date.now() < until) {
    try {
      if ((await fetch('http://localhost:5678/healthz', { signal: AbortSignal.timeout(2000) })).ok) break;
    } catch { /* still booting */ }
    await sleep(3000);
  }
  // /healthz greens early — this project has paid for that once already (BUG-005/006/018).
  await sleep(15000);
}

const post = async (url, body, ms = 240000) => {
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(ms),
    });
    return await res.json().catch(() => ({ status: 'error', payload: { reason: 'non-JSON' } }));
  } catch (err) {
    return { status: 'error', payload: { reason: 'no response', missing: [err.message] } };
  }
};

const queueTotal = async () => (await (await fetch(`${BASE}/api/dead-letters?all=1`)).json()).total;

console.log('');
console.log('E7-S3 negative controls — TC16 (no handler) and TC15 (broken telemetry)');
console.log('=======================================================================');
console.log('');

if (!await serviceUp(4000) && !await startService()) {
  console.error('the review service will not start; the controls cannot run');
  process.exit(1);
}

// =============================================================================================
// TC16 — remove the error workflow, and the same kill must produce NOTHING.
// =============================================================================================
{
  console.log('  TC16: removing settings.errorWorkflow from WF2…');
  const wf = JSON.parse(original.get(WF2).toString('utf8'));
  delete wf.settings.errorWorkflow;
  writeFileSync(WF2, `${JSON.stringify(wf, null, 2)}\n`);
  await reimportAndRestart();

  const env = await post(INGEST, {
    product_id: `neg-route-${Date.now()}`, doc_type: 'transcript', title: 'TC16 control',
    raw_text: 'Priya (Eng Lead): Every dashboard must be renamable without breaking a shared link.',
  });
  const before = await queueTotal();
  killService();
  await sleep(1000);
  await post(GENERATE, { doc_id: env.doc_id });
  await startService();
  // The same window the drill allows, so the two are comparable.
  let after = before;
  for (let i = 0; i < 12 && after === before; i++) { await sleep(2000); after = await queueTotal(); }

  say('TC16', after === before,
    'with WF4 unset, the same kill produces NO queue entry',
    `${before} -> ${after} — so the entry the drill sees is WF4's, not something else's`);

  writeFileSync(WF2, original.get(WF2));
  say('TC16b', hash(readFileSync(WF2)) === originalHashes.get(WF2),
    `${WF2} restored byte-for-byte`);
}

// =============================================================================================
// TC15 — break TELEMETRY and the run must finish anyway.
// =============================================================================================
{
  console.log('');
  console.log('  TC15: pointing WF0\'s cost-logging call at a dead port…');
  const wf = JSON.parse(original.get(WF0).toString('utf8'));
  const log = wf.nodes.find((n) => n.name === 'Log the call');
  log.parameters.url = String(log.parameters.url).replace(':3000', ':59999');
  writeFileSync(WF0, `${JSON.stringify(wf, null, 2)}\n`);
  await reimportAndRestart();

  const env = await post(INGEST, {
    product_id: `neg-telem-${Date.now()}`, doc_type: 'transcript', title: 'TC15 control',
    raw_text: 'Priya (Eng Lead): Every dashboard must be renamable without breaking a shared link.\n'
      + 'Dana (Customer Success): And an admin has to be able to revoke a shared link immediately.',
  });
  const beforeQ = await queueTotal();
  const gen = await post(GENERATE, { doc_id: env.doc_id });
  const afterQ = await queueTotal();

  const doc = getDocument(env.doc_id);
  say('TC15', gen.status === 'ok' && gen.payload?.state === 'in_review',
    'a run whose TELEMETRY call is unreachable still completes',
    `${gen.status}/${gen.payload?.state ?? gen.payload?.reason} — ${gen.payload?.grounded ?? '?'}/${gen.payload?.total ?? '?'} grounded`);
  say('TC15b', afterQ === beforeQ,
    'and it does not dead-letter — a logging failure is not an incident',
    `queue ${beforeQ} -> ${afterQ}`);
  say('TC15c', Boolean(doc), 'the document is stored as usual', doc?.doc_id);

  writeFileSync(WF0, original.get(WF0));
  say('TC15d', hash(readFileSync(WF0)) === originalHashes.get(WF0),
    `${WF0} restored byte-for-byte`);
}

// --- put it all back ---------------------------------------------------------------------------
console.log('');
console.log('  restoring both workflows in n8n…');
await reimportAndRestart();

console.log('');
console.log(`${checks - failures}/${checks} controls passed`);
console.log('');
console.log('Both workflows are back to their committed bytes and re-imported. Re-run the drill');
console.log('to confirm the queue works again:');
console.log('  .\\run.cmd review-ui/scripts/drill-service-unreachable.mjs');
if (failures) process.exit(1);
