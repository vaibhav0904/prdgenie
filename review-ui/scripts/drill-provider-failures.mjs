// THE DRILL for E7-S4: a timeout parks, it never guesses.
//
// `docs/architecture.md` has promised since E1 that a model failure degrades to a visible
// park and never to a confident half-answer. BUG-011 and BUG-012 were both found in this
// territory by a REAL outage rather than by a test, and the honest reading of that is that
// the promise had never been exercised on purpose.
//
// It is exercised at the provider boundary. WF0 is not edited into a test shape: `Build
// request`, the retry, `Parse or park`, the classifier, the park and the version row all run
// unchanged. The single change is the address the HTTP node dials, which for the length of
// the drill is `fake-provider.mjs` — a local process with no credentials that either never
// answers or answers with prose where JSON was required.
//
// The assertion is not "it parked". It is **"it parked and there is nothing else"**: no
// second version, no requirements, no epics, and a document still intact.
//
// Usage:  .\run.cmd review-ui/scripts/drill-provider-failures.mjs
//
// Costs no real model call — every call goes to the stand-in. Takes ~5 minutes, most of it
// spent waiting for two real 60-second timeouts, twice.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { all, get } from '../db.mjs';
import { takeExclusive } from '../../exclusive.mjs';

// ONE MUTATOR AT A TIME (BUG-054).
// This script mutates the provider binding on WF0 — so a second copy of it, or a `check-all`
// sweep running beside it, interleaves, and each reports the other's cleanup as its own defect.
// Inside a sweep that already holds the lock this is a no-op.
takeExclusive('review-ui/scripts/drill-provider-failures.mjs', {
  files: ['n8n/workflows/WF0-llm-call.json'],
});

const WF0 = 'n8n/workflows/WF0-llm-call.json';
const CONTAINER = process.env.N8N_CONTAINER ?? 'n8n-local';
const FAKE_PORT = Number(process.env.FAKE_PROVIDER_PORT ?? 3999);
const FAKE_LOCAL = `http://localhost:${FAKE_PORT}`;
// n8n is in Docker; from inside the container the host is host.docker.internal (ADR 0010).
const FAKE_FROM_N8N = `http://host.docker.internal:${FAKE_PORT}/v1/chat/completions`;

const original = readFileSync(WF0);
const originalHash = createHash('sha256').update(original).digest('hex');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
let checks = 0;
const say = (id, pass, msg, detail = '') => {
  checks++;
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(7)} ${msg}${detail ? `  — ${detail}` : ''}`);
};

// --- the stand-in ---------------------------------------------------------------------------
let stub = null;
async function startStub() {
  stub = spawn(process.execPath, ['--env-file-if-exists=.env', 'review-ui/scripts/fake-provider.mjs',
    String(FAKE_PORT)], { stdio: 'ignore', detached: false });
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    try { if ((await fetch(`${FAKE_LOCAL}/__health`, { signal: AbortSignal.timeout(800) })).ok) return true; }
    catch { /* not up */ }
    await sleep(250);
  }
  return false;
}
const setMode = async (mode) => (await fetch(`${FAKE_LOCAL}/__mode`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode }),
})).json();
const stubServed = async () => (await (await fetch(`${FAKE_LOCAL}/__mode`)).json()).served.length;

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

// --- one run through the REAL producer, into its own manifest ---------------------------------
//
// `produce.mjs --manifest=` exists so a verification run can exercise the producer without
// destroying the manifest describing the run currently being graded. The manifest is also
// where BUG-017's requirement lives — a park has to be addressable by version id — so using
// the real producer is what makes that assertion mean anything.
const runFixture = (fixture, manifest) => {
  try {
    execFileSync(process.execPath, ['--env-file-if-exists=.env', 'evals/harness/produce.mjs',
      fixture, `--manifest=${manifest}`], { stdio: 'pipe', timeout: 600000 });
  } catch { /* a parked run exits non-zero; the manifest is what we read */ }
  return JSON.parse(readFileSync(manifest, 'utf8')).runs[fixture] ?? null;
};

/** Everything the database holds for one run. The "and there is nothing else" half. */
function aftermath(traceId) {
  const versions = all(`SELECT prd_version_id, state, park_reason, degraded
                        FROM prd_versions WHERE trace_id=? ORDER BY prd_version_id`, [traceId]);
  const ids = versions.map((v) => v.prd_version_id);
  const q = ids.length ? ids.map(() => '?').join(',') : "''";
  return {
    versions,
    doc: get('SELECT doc_id FROM source_documents WHERE trace_id=?', [traceId]),
    requirements: get(`SELECT COUNT(*) n FROM requirements WHERE prd_version_id IN (${q})`, ids).n,
    epics: get(`SELECT COUNT(*) n FROM epics WHERE prd_version_id IN (${q})`, ids).n,
    features: get(`SELECT COUNT(*) n FROM features WHERE prd_version_id IN (${q})`, ids).n,
    events: all('SELECT name FROM events WHERE trace_id=? ORDER BY event_id', [traceId]).map((e) => e.name),
  };
}

console.log('');
console.log('E7-S4 DRILL — force a timeout and a malformed response at the provider boundary');
console.log('===============================================================================');
console.log('');

if (!await startStub()) { console.error('the stand-in provider would not start'); process.exit(1); }
console.log(`  stand-in listening on ${FAKE_LOCAL}`);

// --- point WF0 at it ---------------------------------------------------------------------------
{
  const wf = JSON.parse(original.toString('utf8'));
  const node = wf.nodes.find((n) => n.name === 'OpenAI gpt-4.1-mini');
  const realUrl = node.parameters.url;
  node.parameters.url = FAKE_FROM_N8N;
  writeFileSync(WF0, `${JSON.stringify(wf, null, 2)}\n`);
  console.log(`  WF0 provider URL: ${realUrl}`);
  console.log(`                 -> ${FAKE_FROM_N8N}   (nothing else in WF0 changes)`);
  await reimportAndRestart();
}

const results = {};
const dir = mkdtempSync(join(tmpdir(), 'e7s4-'));

try {
  for (const round of [1, 2]) {
    console.log('');
    console.log(`  --- round ${round} of 2 (BUG-021: run it twice, require the same answer) ---`);

    // === the timeout ===========================================================================
    await setMode('timeout');
    const before = await stubServed();
    console.log('  mode=timeout — waiting out two real 60-second timeouts…');
    const t = runFixture('G1', `${dir}/timeout-${round}.json`);
    const tAfter = aftermath(t?.trace_id);

    say(`TC1.${round}`, t?.park_reason === 'llm_timeout',
      'a forced provider timeout parks as llm_timeout', `${t?.generate_status}/${t?.park_reason}`);
    say(`TC2.${round}`, Boolean(tAfter.doc), 'the source document is intact', tAfter.doc?.doc_id);
    say(`TC3.${round}`, tAfter.versions.length === 1 && tAfter.versions[0].park_reason
      && tAfter.versions[0].degraded === 1,
      'exactly ONE version, and it is the park row',
      tAfter.versions.map((v) => `${v.prd_version_id}:${v.state}/${v.park_reason ?? 'none'}`).join(' '));
    say(`TC4.${round}`, tAfter.requirements === 0 && tAfter.epics === 0 && tAfter.features === 0,
      'and nothing else — no requirements, no epics, no features',
      `${tAfter.requirements}/${tAfter.epics}/${tAfter.features}`);
    say(`TC5.${round}`, Number.isInteger(t?.prd_version_id),
      'the park is addressable by version id IN THE RUN MANIFEST (BUG-017)', String(t?.prd_version_id));
    const tries = (await stubServed()) - before;
    say(`TC6.${round}`, tries >= 2,
      'the HTTP node really did retry before giving up', `${tries} requests reached the stand-in`);

    results[`timeout-${round}`] = { reason: t?.park_reason, versions: tAfter.versions.length, events: tAfter.events };

    // === the malformed response ================================================================
    await setMode('malformed');
    console.log('  mode=malformed — HTTP 200, OpenAI-shaped, content is prose…');
    const m = runFixture('G1', `${dir}/malformed-${round}.json`);
    const mAfter = aftermath(m?.trace_id);

    say(`TC7.${round}`, m?.park_reason === 'llm_malformed_json',
      'a forced malformed response parks as llm_malformed_json', `${m?.generate_status}/${m?.park_reason}`);
    say(`TC8.${round}`, Boolean(mAfter.doc) && mAfter.versions.length === 1
      && mAfter.requirements === 0 && mAfter.epics === 0,
      'same guarantees: the document survives, one park row, nothing else',
      `${mAfter.versions.length} version(s), ${mAfter.requirements} requirement(s)`);
    say(`TC9.${round}`, Number.isInteger(m?.prd_version_id),
      'and it is addressable by version id', String(m?.prd_version_id));

    results[`malformed-${round}`] = { reason: m?.park_reason, versions: mAfter.versions.length, events: mAfter.events };

    // === the empty balance (BUG-036) ===========================================================
    //
    // The condition a real outage produced, injected rather than remembered: OpenAI's own 429
    // body for "no credits remaining". The wrong answers are specific — llm_error says nobody
    // recognised it, llm_rate_limited says wait for something that never passes — so the
    // assertion is the exact code, not "it parked".
    await setMode('no_credit');
    console.log('  mode=no_credit — the 429 the balance actually produced…');
    const c = runFixture('G1', `${dir}/no-credit-${round}.json`);
    const cAfter = aftermath(c?.trace_id);

    say(`TC13.${round}`, c?.park_reason === 'llm_no_credit',
      'an exhausted balance parks as llm_no_credit — not llm_error, not llm_rate_limited',
      `${c?.generate_status}/${c?.park_reason}`);
    say(`TC14.${round}`, Boolean(cAfter.doc) && cAfter.versions.length === 1
      && cAfter.requirements === 0 && cAfter.epics === 0,
      'same guarantees: the document survives, one park row, nothing else',
      `${cAfter.versions.length} version(s), ${cAfter.requirements} requirement(s)`);

    results[`no-credit-${round}`] = { reason: c?.park_reason, versions: cAfter.versions.length };

    // === the control ===========================================================================
    //
    // Without this the drill proves only that a stand-in provider breaks things. `ok` mode
    // returns a valid, minimal response through exactly the same path.
    await setMode('ok');
    console.log('  mode=ok — the control: the same stand-in, answering properly…');
    const o = runFixture('G1', `${dir}/ok-${round}.json`);
    say(`TC10.${round}`, o?.generate_status === 'needs_review' && o?.park_reason === 'no_requirements_found',
      'CONTROL: the same stand-in answering properly parks for the RIGHT reason, not a model one',
      `${o?.generate_status}/${o?.park_reason}`);
  }
} finally {
  // --- put it back, whatever happened -----------------------------------------------------------
  console.log('');
  console.log('  restoring WF0 and re-importing…');
  writeFileSync(WF0, original);
  await reimportAndRestart();
  if (stub) stub.kill();
  rmSync(dir, { recursive: true, force: true });
}

const restored = createHash('sha256').update(readFileSync(WF0)).digest('hex') === originalHash;
say('TC11', restored, `${WF0} restored byte-for-byte`);

// Same answer twice, or the drill has measured noise.
const same = results['timeout-1']?.reason === results['timeout-2']?.reason
  && results['malformed-1']?.reason === results['malformed-2']?.reason
  && results['no-credit-1']?.reason === results['no-credit-2']?.reason;
say('TC12', same, 'both rounds gave the same answer (BUG-021)',
  `timeout: ${results['timeout-1']?.reason}/${results['timeout-2']?.reason} · `
  + `malformed: ${results['malformed-1']?.reason}/${results['malformed-2']?.reason} · `
  + `no_credit: ${results['no-credit-1']?.reason}/${results['no-credit-2']?.reason}`);

console.log('');
console.log(`${checks - failures}/${checks} checks passed`);
console.log('');
console.log('WHAT THIS DOES NOT SHOW: the malformed case does not exercise the HTTP NODE\'s retry,');
console.log('because HTTP 200 is not a failure. Since E2-S4 the WORKFLOW retries a bad answer');
console.log('once instead, and both attempts write their own llm_calls row — that is drilled by');
console.log('drill-retry-attempts.mjs. Two guards: transport at the node, content in the workflow.');
if (failures) process.exit(1);
