// E2-S4. The retry, and the two rows it must leave behind.
//
// `docs/traceability.md` has said since E1 that every model call records `attempt` (1 or 2)
// and that **the attempt-2 rate is the drift signal** for a model returning malformed JSON
// more often. Until this story that number could not move: an unparseable answer parked on
// the spot, and the only retry in the system was n8n's at the HTTP node — which fires when
// nothing answers, is invisible to `llm_calls`, and cannot see a 200 carrying prose.
//
// So the retry now lives in the workflow, and this drill is the reason to believe it:
//
//   round A   a bad answer, then a good one   -> TWO rows (attempt 1, attempt 2), run CONTINUES
//   round B   a bad answer twice              -> TWO rows, and the run parks with the reason
//                                                it would always have parked with
//   round C   THE CONTROL: no answer at all (an empty balance) -> ONE row, no retry. Asking
//             again would spend money on a condition that cannot pass.
//
// The fault goes in at the provider boundary: WF0's URL points at the stand-in and nothing
// else about the workflow changes. Restored byte-for-byte in a `finally`, asserted by hash.
//
// Usage:  .\run.cmd review-ui/scripts/drill-retry-attempts.mjs

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { all, get } from '../db.mjs';
import { takeExclusive } from '../../exclusive.mjs';

// ONE MUTATOR AT A TIME (BUG-054).
// This script points WF0 at a stand-in provider — so a second copy of it, or a `check-all`
// sweep running beside it, interleaves, and each reports the other's cleanup as its own defect.
// Inside a sweep that already holds the lock this is a no-op.
takeExclusive('review-ui/scripts/drill-retry-attempts.mjs', {
  files: ['n8n/workflows/WF0-llm-call.json'],
});

const WF0 = 'n8n/workflows/WF0-llm-call.json';
const CONTAINER = process.env.N8N_CONTAINER ?? 'n8n-local';
const FAKE_PORT = Number(process.env.FAKE_PROVIDER_PORT ?? 3999);
const FAKE_LOCAL = `http://localhost:${FAKE_PORT}`;
const FAKE_FROM_N8N = `http://host.docker.internal:${FAKE_PORT}/v1/chat/completions`;

const original = readFileSync(WF0);
const originalHash = createHash('sha256').update(original).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let checks = 0; let failures = 0;
const say = (id, pass, msg, detail = '') => {
  checks++;
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(7)} ${msg}${detail ? `  — ${detail}` : ''}`);
};

let stub = null;
async function startStub() {
  stub = spawn(process.execPath, ['--env-file-if-exists=.env', 'review-ui/scripts/fake-provider.mjs',
    String(FAKE_PORT)], { stdio: 'ignore' });
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    try { if ((await fetch(`${FAKE_LOCAL}/__health`, { signal: AbortSignal.timeout(800) })).ok) return true; }
    catch { /* not up yet */ }
    await sleep(250);
  }
  return false;
}
const setMode = async (mode) => (await fetch(`${FAKE_LOCAL}/__mode`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode }),
})).json();

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

const dir = mkdtempSync(join(tmpdir(), 'retry-drill-'));

// One fixture through the REAL producer, into its own manifest, so the run that is measured
// is a run that happened (E2-S1).
function runFixture(fixture, manifest) {
  try {
    execFileSync(process.execPath, ['--env-file-if-exists=.env', 'evals/harness/produce.mjs',
      fixture, `--manifest=${manifest}`], { stdio: 'pipe', timeout: 600000 });
  } catch { /* a parked run exits non-zero; the manifest is what we read */ }
  return JSON.parse(readFileSync(manifest, 'utf8')).runs[fixture] ?? null;
}

/** The extraction call's rows for one trace, in the order they were written. */
const extractionRows = (traceId) => all(
  `SELECT attempt, outcome, prompt_name, model, prompt_tokens, completion_tokens, cost_usd
     FROM llm_calls WHERE trace_id = ? AND component = 'extractor' ORDER BY call_id`, [traceId]);

console.log('THE RETRY DRILL — one retry, for one kind of failure, and a row for each try.\n');

const results = {};
try {
  if (!await startStub()) { console.error('the stand-in provider would not start'); process.exit(1); }

  {
    const wf = JSON.parse(original.toString('utf8'));
    const node = wf.nodes.find((n) => n.name === 'OpenAI gpt-4.1-mini');
    console.log(`  WF0 provider URL: ${node.parameters.url}\n                 -> ${FAKE_FROM_N8N}`);
    node.parameters.url = FAKE_FROM_N8N;
    writeFileSync(WF0, `${JSON.stringify(wf, null, 2)}\n`);
    await reimportAndRestart();
  }

  // --- A: a bad answer, then a good one ------------------------------------------------------
  for (const round of [1, 2]) {
    await setMode('malformed_then_ok');
    console.log(`  round A${round} — the first answer will not parse; the second will…`);
    const run = runFixture('G1', `${dir}/a${round}.json`);
    const rows = extractionRows(run?.trace_id);

    say(`TC6.${round}`, rows.length === 2,
      'a retried call writes TWO rows, not one merged row', `${rows.length} row(s)`);
    say(`TC6a.${round}`, rows[0]?.attempt === 1 && rows[1]?.attempt === 2,
      'and they are attempt 1 and attempt 2, in that order',
      rows.map((r) => `${r.attempt}:${r.outcome}`).join(' '));
    // G1's correct outcome is a park either way — it is the garbage fixture. What the retry
    // has to show is that the run got PAST the provider: it does not park on the failure the
    // retry recovered from.
    say(`TC8.${round}`, rows[1]?.outcome === 'ok' && run?.park_reason !== 'llm_malformed_json',
      'when the second attempt parses, the run continues past the provider and does NOT park on the bad answer',
      `attempt2=${rows[1]?.outcome}, park=${run?.park_reason ?? '(none)'}`);
    results[`a${round}`] = rows.map((r) => `${r.attempt}${r.outcome}`).join('/');
  }

  // --- B: a bad answer twice -----------------------------------------------------------------
  await setMode('malformed');
  console.log('  round B — nothing it returns will ever parse…');
  const b = runFixture('G1', `${dir}/b.json`);
  const bRows = extractionRows(b?.trace_id);
  say('TC9a', bRows.length === 2 && bRows[1]?.attempt === 2,
    'a second failure still writes its own row', `${bRows.length} row(s)`);
  say('TC9b', b?.generate_status === 'needs_review' && b?.park_reason === 'llm_malformed_json',
    'and the run parks with the reason it would always have parked with — the retry adds an '
    + 'attempt, never a different answer', `${b?.generate_status}/${b?.park_reason}`);

  // --- C: THE CONTROL — no answer at all -----------------------------------------------------
  await setMode('no_credit');
  console.log('  round C (control) — an empty balance: an answer that cannot improve…');
  const c = runFixture('G1', `${dir}/c.json`);
  const cRows = extractionRows(c?.trace_id);
  say('TC7a', cRows.length === 1,
    'CONTROL: a call that got NO answer is not retried — one row', `${cRows.length} row(s)`);
  say('TC7b', cRows[0]?.attempt === 1 && c?.park_reason === 'llm_no_credit',
    'and it parks on the reason it earned, immediately',
    `attempt=${cRows[0]?.attempt}, reason=${c?.park_reason}`);
} finally {
  console.log('\n  restoring WF0 and re-importing…');
  try { stub?.kill(); } catch { /* already gone */ }
  writeFileSync(WF0, original);
  await reimportAndRestart();
  rmSync(dir, { recursive: true, force: true });
}

const restored = createHash('sha256').update(readFileSync(WF0)).digest('hex') === originalHash;
say('TC10a', restored, `${WF0} restored byte-for-byte`);
say('TC10b', results.a1 === results.a2, 'both rounds of A gave the same answer (BUG-021)',
  `${results.a1} · ${results.a2}`);

console.log(`\n${checks - failures}/${checks} checks passed`);
console.log('\nWHAT THIS DOES NOT SHOW: that a retry usually helps. At temperature 0 a second');
console.log('ask is not a fresh sample — it buys the small non-determinism the provider has');
console.log('left, and the stand-in here is rigged to recover. The durable value of these rows');
console.log('is the ATTEMPT-2 RATE over many real runs, not the second answer in any one of them.');
if (failures) process.exitCode = 1;
