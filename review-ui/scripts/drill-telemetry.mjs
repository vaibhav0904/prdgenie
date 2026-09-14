// THE OBSERVABILITY DRILL for E8-S4: telemetry may fail; the product may not.
//
// `/internal/llm-call` failures are caught and logged rather than raised, and WF0's `Log the
// call` node is a declared MAY_SWALLOW ("cost accounting must never be able to stop a run").
// Both of those are intentions until something kills the logging path DURING a run and the
// run finishes anyway. This drill is that something.
//
// The fault goes in on the real path, by the one move the provider drill already established
// as legitimate: WF0 is not edited into a test shape — the single change is the ADDRESS the
// telemetry node dials, which for the length of the drill is a local pass-through proxy in
// front of the real service. The proxy is killed AFTER the run's first model call has logged
// and BEFORE its last, so the amputation lands mid-run and the trace's own llm_calls rows
// show it: some rows, then silence.
//
// Everything else is real: real n8n, real provider, real fixture (E1), real money (~a cent
// per round). Runs the amputation twice (BUG-021) around a control with the proxy healthy.
//
// Usage:  .\run.cmd review-ui/scripts/drill-telemetry.mjs

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { all, get } from '../db.mjs';
import { takeExclusive } from '../../exclusive.mjs';

// ONE MUTATOR AT A TIME (BUG-054).
// This script points WF0 at a stand-in provider — so a second copy of it, or a `check-all`
// sweep running beside it, interleaves, and each reports the other's cleanup as its own defect.
// Inside a sweep that already holds the lock this is a no-op.
takeExclusive('review-ui/scripts/drill-telemetry.mjs', {
  files: ['n8n/workflows/WF0-llm-call.json'],
});

const WF0 = 'n8n/workflows/WF0-llm-call.json';
const CONTAINER = process.env.N8N_CONTAINER ?? 'n8n-local';
const SERVICE = 'http://localhost:3000';
const PROXY_PORT = Number(process.env.TELEMETRY_PROXY_PORT ?? 3998);
const REAL = 'host.docker.internal:3000/internal/llm-call';
const VIA_PROXY = `host.docker.internal:${PROXY_PORT}/internal/llm-call`;

const original = readFileSync(WF0);
const originalHash = createHash('sha256').update(original).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let checks = 0; let failures = 0;
const say = (id, pass, msg, detail = '') => {
  checks++;
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(7)} ${msg}${detail ? `  — ${detail}` : ''}`);
};

// --- the proxy: forwards everything, counts what it forwarded, dies on command -----------------

let proxy = null;
let forwarded = 0;
function startProxy() {
  return new Promise((resolve, reject) => {
    proxy = createServer((req, res) => {
      const up = request({ host: 'localhost', port: 3000, path: req.url, method: req.method,
        headers: req.headers }, (upRes) => {
        res.writeHead(upRes.statusCode, upRes.headers);
        upRes.pipe(res);
        forwarded++;
      });
      up.on('error', () => { res.writeHead(502); res.end(); });
      req.pipe(up);
    });
    proxy.on('error', reject);
    proxy.listen(PROXY_PORT, () => resolve());
  });
}
function killProxy() {
  if (!proxy) return;
  proxy.closeAllConnections?.();
  proxy.close();
  proxy = null;
}

// --- WF0 plumbing --------------------------------------------------------------------------------

async function reimportAndRestart() {
  execFileSync(process.execPath, ['--env-file-if-exists=.env', 'n8n/scripts/import-workflows.mjs'],
    { stdio: 'pipe' });
  execFileSync('docker', ['restart', CONTAINER], { stdio: 'pipe' });
  const until = Date.now() + 180000;
  while (Date.now() < until) {
    try {
      if ((await fetch('http://localhost:5678/healthz', { signal: AbortSignal.timeout(2000) })).ok) break;
    } catch { /* booting */ }
    await sleep(3000);
  }
  await sleep(15000); // /healthz greens early (BUG-005/006/018)
}

function pointTelemetryAt(target) {
  const s = readFileSync(WF0, 'utf8');
  const from = target === 'proxy' ? REAL : VIA_PROXY;
  const to = target === 'proxy' ? VIA_PROXY : REAL;
  if (!s.includes(from)) throw new Error(`WF0 does not dial ${from} — refusing to guess`);
  writeFileSync(WF0, s.split(from).join(to));
}

// --- one run, with an optional mid-run amputation --------------------------------------------------

const maxCallId = () => get('SELECT COALESCE(MAX(rowid), 0) AS n FROM llm_calls').n;
const callsSince = (mark) => all('SELECT trace_id, component FROM llm_calls WHERE rowid > ?', [mark]);

async function runE1({ amputate, manifest }) {
  const mark = maxCallId();
  const child = spawn(process.execPath, ['--env-file-if-exists=.env', 'evals/harness/produce.mjs',
    'E1', `--manifest=${manifest}`], { stdio: 'ignore' });
  const done = new Promise((resolve) => child.on('exit', resolve));

  let killedAt = null;
  if (amputate) {
    // Wait for the run's FIRST telemetry row, then kill the proxy: the amputation must land
    // after logging has demonstrably worked for this very run, or "mid-run" is a claim.
    const until = Date.now() + 240000;
    while (Date.now() < until) {
      if (callsSince(mark).length >= 1) { killedAt = callsSince(mark).length; killProxy(); break; }
      await sleep(1500);
    }
  }
  await done;
  const run = JSON.parse(readFileSync(manifest, 'utf8')).runs.E1 ?? null;
  const rows = run ? all('SELECT component FROM llm_calls WHERE trace_id = ?', [run.trace_id]) : [];
  return { run, logged: rows.length, killedAt };
}

const aftermath = (traceId) => ({
  versions: all('SELECT state, park_reason FROM prd_versions WHERE trace_id = ?', [traceId]),
  deadLetters: get('SELECT COUNT(*) AS n FROM dead_letters WHERE trace_id = ?', [traceId]).n,
});

// --- the drill --------------------------------------------------------------------------------------

console.log('THE TELEMETRY DRILL — the logging path dies mid-run, and the run must not notice.\n');
const dir = mkdtempSync(join(tmpdir(), 'telemetry-drill-'));
const results = {};

try {
  pointTelemetryAt('proxy');
  await reimportAndRestart();
  await startProxy();

  // === the control: the proxy is healthy, so this measures the FULL call count ================
  console.log('  control — telemetry through a healthy proxy…');
  const control = await runE1({ amputate: false, manifest: `${dir}/control.json` });
  const cAfter = aftermath(control.run?.trace_id);
  say('TC11', control.run?.state === 'in_review' && control.logged >= 3 && forwarded >= control.logged,
    'CONTROL: through the healthy proxy, the run logs every call',
    `${control.logged} call(s) logged, ${forwarded} forwarded, state=${control.run?.state}`);
  results.control = control.logged;

  // === two amputation rounds ===================================================================
  for (const round of [1, 2]) {
    if (!proxy) await startProxy();
    console.log(`  round ${round} — the proxy dies after the run's first logged call…`);
    const r = await runE1({ amputate: true, manifest: `${dir}/round-${round}.json` });
    const after = aftermath(r.run?.trace_id);

    say(`TC6.${round}`, r.run?.state === 'in_review'
      && after.versions.length === 1 && after.versions[0].state === 'in_review'
      && after.deadLetters === 0,
      'telemetry died mid-run and the run reached in_review — no park, no dead letter',
      `state=${r.run?.state}, versions=${after.versions.length}, dead_letters=${after.deadLetters}`);
    say(`TC7.${round}`, r.logged >= 1 && r.logged < results.control,
      'the amputation is visible: fewer calls logged than the control made',
      `${r.logged} logged vs ${results.control} in the control (killed after ${r.killedAt})`);
    say(`TC8.${round}`, r.run?.grounded === control.run?.grounded && r.run?.total === control.run?.total,
      'the PRODUCT outcome is indistinguishable from the control',
      `${r.run?.grounded}/${r.run?.total} grounded, control ${control.run?.grounded}/${control.run?.total}`);

    results[`round${round}`] = { logged: r.logged, state: r.run?.state };
  }
} finally {
  console.log('\n  restoring WF0 and re-importing…');
  killProxy();
  writeFileSync(WF0, original);
  await reimportAndRestart();
  rmSync(dir, { recursive: true, force: true });
}

const restored = createHash('sha256').update(readFileSync(WF0)).digest('hex') === originalHash;
say('TC9', restored, `${WF0} restored byte-for-byte`);
say('TC10', results.round1?.state === results.round2?.state
  && results.round1?.state === 'in_review',
  'both rounds gave the same answer (BUG-021)',
  `round1=${results.round1?.state}/${results.round1?.logged} logged · round2=${results.round2?.state}/${results.round2?.logged} logged`);

console.log(`\n${checks - failures}/${checks} checks passed`);
console.log('\nWHAT THIS DOES NOT SHOW: nothing here proves the missing rows are RECOVERABLE — they');
console.log('are gone, and that is the accepted price of "telemetry may never stop a run". The');
console.log('cost figures for a drilled trace understate it forever, which is one more reason M5');
console.log('marks itself provisional while verification traces are in its population.');
if (failures) process.exitCode = 1;
