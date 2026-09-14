// THE DRILL for E7-S5: Gemini is made unavailable on purpose, and the sweep must SAY SO.
//
// The acceptance criterion is not "it does not crash". It is four things at once, and only
// the first is obvious:
//
//   1. the sweep is RECORDED as skipped, with a reason from the closed set and the provider's
//      own words beside it — not silently, and not as a clean sweep with nothing to report;
//   2. NOTHING FALLS BACK TO THE DOER. A second opinion from the vendor that wrote the thing
//      is not a second opinion, so the drill asserts no OpenAI call was made for that sweep;
//   3. no scores are invented to fill the gap;
//   4. the lock is released — a sweep that died holding it would block every later one.
//
// THE FAULT IS AN ADDRESS CHANGE, the one move the provider drill already established as
// legitimate (E7-S4): WF0's judge node dials a local server instead of Google. The credential
// is untouched and never read; the workflow is otherwise the file that ships, and it is
// restored byte-for-byte in a `finally`, asserted by hash.
//
// THE CONTROL DIALS THE SAME LOCAL SERVER, ANSWERING. That is deliberate: it varies exactly
// one thing — whether the judge replies — where a control against the live provider would
// vary the address, the vendor, the network and the day's quota all at once, and would go red
// for reasons that have nothing to do with what is being tested. **What the live provider
// does is evidenced separately**, by real sweeps recorded in `docs/traceability.md`.
//
// Run twice (BUG-021).
//
// Usage:  .\run.cmd review-ui/scripts/drill-judge-unavailable.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { all, get, run } from '../db.mjs';
import { takeExclusive } from '../../exclusive.mjs';

// ONE MUTATOR AT A TIME (BUG-054).
// This script mutates WF0 and re-imports it — so a second copy of it, or a `check-all` sweep
// running beside it, interleaves, and each reports the other's cleanup as its own defect.
// Inside a sweep that already holds the lock this is a no-op.
takeExclusive('review-ui/scripts/drill-judge-unavailable.mjs', {
  files: ['n8n/workflows/WF0-llm-call.json'],
});

// Every sweep this drill causes is marked, in the record, as not a real second opinion.
const DRILL_NOTE = 'produced by drill-judge-unavailable.mjs: the judge\'s address was a '
  + 'stand-in server, so any score here was written by the drill and is not an opinion '
  + 'anybody held';
const stamp = (id) => run('UPDATE judge_sweeps SET note = ? WHERE sweep_id = ?', [DRILL_NOTE, id]);

const WF0 = 'n8n/workflows/WF0-llm-call.json';
const CONTAINER = process.env.N8N_CONTAINER ?? 'n8n-local';
const DOOR = process.env.N8N_JUDGE_WEBHOOK_URL ?? 'http://localhost:5678/webhook/judge-sweep';
const SERVICE = process.env.SERVICE_URL ?? 'http://localhost:3000';
const PORT = Number(process.env.FAKE_GEMINI_PORT ?? 3997);
const REAL_HOST = 'https://generativelanguage.googleapis.com';
const FAKE_HOST = `http://host.docker.internal:${PORT}`;

const original = readFileSync(WF0);
const originalHash = createHash('sha256').update(original).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let checks = 0; let failures = 0;
const say = (id, pass, msg, detail = '') => {
  checks++;
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(8)} ${msg}${detail ? `  — ${detail}` : ''}`);
};

// --- the stand-in provider: refuses, or answers ------------------------------------------------

let mode = 'refuse';
let seen = 0;

const ANSWER = {
  verdict: 'supported',
  faithfulness: 0.9,
  completeness: 0.8,
  clarity: 0.9,
  comment: 'drill control: a stand-in provider answering in the real response shape.',
};

const fake = createServer((req, res) => {
  seen++;
  if (mode === 'refuse') {
    // A real outage shape: 503 with Google's own error envelope. Not a refused connection —
    // a server that answers and says no is the harder case, because it is the one that could
    // be mistaken for an answer.
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      error: { code: 503, message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' },
    }));
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(ANSWER) }], role: 'model' } }],
    usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 60 },
  }));
});

function pointJudgeAt(host) {
  const s = readFileSync(WF0, 'utf8');
  const from = host === FAKE_HOST ? REAL_HOST : FAKE_HOST;
  if (!s.includes(from)) throw new Error(`WF0 does not dial ${from} — refusing to guess`);
  writeFileSync(WF0, s.split(from).join(host));
}

async function deploy() {
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

const latestSweep = () => get('SELECT * FROM judge_sweeps ORDER BY sweep_id DESC LIMIT 1');

/**
 * Ask the door for a sweep and wait for the RECORD, not for the reply.
 *
 * A paced sweep outlives the webhook connection: n8n hangs up long before twenty-two calls
 * twelve seconds apart are done. That is not a failure, and treating it as one would make
 * this drill test the HTTP client. The answer is in the database either way.
 */
async function sweep() {
  const before = latestSweep()?.sweep_id ?? 0;
  fetch(DOOR, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ asked_by: 'drill-judge-unavailable.mjs' }),
  }).catch(() => { /* the record is the answer */ });

  const until = Date.now() + 900000;
  while (Date.now() < until) {
    const row = latestSweep();
    if (row && row.sweep_id > before && row.status !== 'in_flight') return row;
    await sleep(5000);
  }
  throw new Error('no sweep closed within fifteen minutes');
}

const doerCallsDuring = (row) => get(`SELECT COUNT(*) AS n FROM llm_calls
   WHERE component = 'judge' AND model NOT LIKE 'gemini%'
     AND created_at >= datetime(?, '-1 minute')`, [row.opened_at]).n;

const PARK_REASONS = ['llm_timeout', 'llm_unauthorized', 'llm_rate_limited', 'llm_no_credit',
  'llm_malformed_json', 'llm_error'];

console.log('THE JUDGE IS TAKEN AWAY — and the sweep must say so, twice.\n');

const results = {};
try {
  await new Promise((resolve, reject) => { fake.on('error', reject); fake.listen(PORT, resolve); });
  pointJudgeAt(FAKE_HOST);
  await deploy();

  for (const round of [1, 2]) {
    mode = 'refuse';
    seen = 0;
    console.log(`  round ${round} — the judge's address answers 503 to everything…`);
    const row = await sweep();

    say(`TC12.${round}`, row.status === 'skipped',
      'the sweep is RECORDED as skipped, not as a clean sweep', `status=${row.status}`);
    say(`TC12r.${round}`, PARK_REASONS.some((p) => String(row.skipped_reason ?? '').startsWith(p)),
      'with a reason from the closed set', row.skipped_reason ?? '(none)');
    say(`TC12d.${round}`, Boolean(row.skipped_detail),
      "and the provider's own words beside it", String(row.skipped_detail ?? '').slice(0, 60));
    say(`TC12f.${round}`, doerCallsDuring(row) === 0,
      'NO SAME-VENDOR FALLBACK: the doer was not asked to mark its own work',
      `${doerCallsDuring(row)} non-Gemini judge call(s)`);
    say(`TC12s.${round}`, row.scored === 0,
      'no scores were invented to fill the gap', `scored=${row.scored}`);
    say(`TC12l.${round}`, Boolean(row.closed_at),
      'and the lock was released — a later sweep is not blocked by this one');
    say(`TC12c.${round}`, seen > 0,
      'the fault was really injected: the stand-in was really called', `${seen} request(s)`);

    stamp(row.sweep_id);
    results[round] = { status: row.status, reason: row.skipped_reason, scored: row.scored };
  }

  // THE CONTROL. Same address, same workflow, same everything — the stand-in answers instead
  // of refusing. Without it, "skipped" might be what this system does on every sweep.
  mode = 'answer';
  seen = 0;
  console.log('\n  control — the same address, answering…');
  const control = await sweep();
  say('TC13c', control.status === 'complete' && control.scored > 0,
    'CONTROL: with the judge answering, the same sweep completes and stores scores',
    `status=${control.status}, scored=${control.scored} of ${control.sample_size}`);
  say('TC13d', control.rubric_version === get(
    "SELECT rubric_version FROM judge_scores WHERE sweep_id = ? LIMIT 1", [control.sweep_id])?.rubric_version,
  'and every score it stored carries the rubric version the call was sent with',
  control.rubric_version ?? '(none)');
  stamp(control.sweep_id);
  say('TC13e', get('SELECT note FROM judge_sweeps WHERE sweep_id = ?', [control.sweep_id])?.note !== null,
    'and the drill MARKS every sweep it caused — a stand-in\'s score is not a second opinion');
  results.control = { status: control.status, scored: control.scored };
} finally {
  console.log('\n  restoring WF0 and re-importing…');
  fake.close();
  writeFileSync(WF0, original);
  await deploy();
}

const restored = createHash('sha256').update(readFileSync(WF0)).digest('hex') === originalHash;
say('TC13a', restored, `${WF0} restored byte-for-byte`);
say('TC13b', results[1]?.status === results[2]?.status && results[1]?.scored === results[2]?.scored,
  'both rounds gave the same answer (BUG-021)',
  `round1=${results[1]?.status}/${results[1]?.reason} · round2=${results[2]?.status}/${results[2]?.reason}`);

console.log(`\n${checks - failures}/${checks} checks passed`);
console.log('\nWHAT THIS DOES NOT SHOW: it does not exercise Google. Both the refusal and the');
console.log('answer come from a stand-in at the same address, which is what makes the control a');
console.log('control. What the live provider does — including running out of free-tier quota —');
console.log('is recorded from real sweeps in docs/traceability.md.');
console.log('It also does not hold the sample over: the rows this sweep could not judge go back');
console.log('into the unjudged pool and may be drawn again, or not. Coverage grows over sweeps.');
if (failures) process.exitCode = 1;
