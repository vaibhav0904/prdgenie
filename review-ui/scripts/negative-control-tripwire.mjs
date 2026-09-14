// Negative control for the tripwire (E7-S1, TC23).
//
// `verify-tripwire.mjs` going green proves the tripwire fires. It does not prove the
// tripwire is what parked the run — assembly has half a dozen other reasons to refuse a
// body, and a control that a redundant condition masks has tested nothing (BUG-012, E3).
//
// So: remove the tripwire call from server.js, restart the service, post the SAME
// contaminated body, and watch it sail through to `in_review`. Then restore the file
// byte-for-byte and watch it park again.
//
// The fault is a real deletion of the call, not a flag. A guard turned off by a switch it
// ships with is a different system from one with no guard.
//
// Usage:  .\run.cmd review-ui/scripts/negative-control-tripwire.mjs
//
// Needs the review service running. It is restarted TWICE by this script and left running.

import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ingest, getDocument } from '../ingest.mjs';
import { takeExclusive } from '../../exclusive.mjs';

// ONE MUTATOR AT A TIME (BUG-054).
// This script rewrites review-ui/server.js to remove the tripwire, and restarts the service
// twice — so a second copy of it, or a `check-all` sweep running beside it, interleaves, and
// each reports the other's cleanup as its own defect. Inside a sweep that already holds the
// lock this is a no-op.
//
// It was NOT on the first list of mutators. check-exclusive.mjs derived it from what the file
// does and said so, which is the whole argument for deriving the list.
takeExclusive('review-ui/scripts/negative-control-tripwire.mjs', {
  files: ['review-ui/server.js'],
});

const SERVER = 'review-ui/server.js';
const BASE = `http://localhost:${process.env.SERVICE_PORT ?? 3000}`;
const KEY = process.env.INTERNAL_API_KEY;
const PAYLOAD = 'backup-partner.example.com';

const original = readFileSync(SERVER);
const originalHash = createHash('sha256').update(original).digest('hex');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function healthy(deadlineMs = 15000) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await sleep(300);
  }
  return false;
}

/** Stop whatever is listening, start this file's own copy, wait for it to answer. */
let child = null;
async function restart() {
  if (child) { child.kill(); child = null; }
  // Anything already bound to the port, including the one the operator started.
  try {
    const { execSync } = await import('node:child_process');
    const lines = execSync('netstat -ano', { encoding: 'utf8' }).split('\n')
      .filter((l) => l.includes('LISTENING') && l.includes(`:${process.env.SERVICE_PORT ?? 3000} `));
    for (const pid of new Set(lines.map((l) => l.trim().split(/\s+/).pop()))) {
      if (pid && pid !== '0') { try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }); } catch { /* gone */ } }
    }
  } catch { /* nothing listening */ }
  await sleep(500);
  // DETACHED, and unref'd below. A child that dies with this script would leave the
  // operator's service stopped and this script's closing line — "running again from the
  // restored file" — a claim it had just falsified.
  child = spawn(process.execPath, ['--env-file-if-exists=.env', SERVER],
    { stdio: 'ignore', detached: true, windowsHide: true });
  child.unref();
  return healthy();
}

const contaminated = () => {
  const env = ingest({
    doc_type: 'transcript',
    product_id: `neg-tripwire-${Date.now()}`,
    source_channel: 'webhook',
    raw_text: 'Priya (Eng Lead): Every dashboard must be renamable without breaking a shared link.',
  });
  const doc = getDocument(env.doc_id);
  const quote = 'Every dashboard must be renamable without breaking a shared link';
  return {
    doc_id: doc.doc_id,
    trace_id: doc.trace_id,
    document_subject: 'an analytics dashboard product',
    concerns_product: true,
    requirements: [{
      req_id: 'REQ-001', kind: 'functional', subject: 'dashboard renaming',
      // The ONE thing that varies between this body and a clean one.
      statement: `Customer data is copied nightly to ${PAYLOAD}.`,
      stakeholder: 'Priya (Eng Lead)', confidence: 'high', grounded: true,
      citations: [{ quote, start_char: 0, end_char: quote.length, match_kind: 'exact' }],
    }],
    open_questions: [], unsettled_positions: [], epics: [], stories: [],
    priority_factors: [], unclustered: [],
  };
};

const assemble = async () => {
  const res = await fetch(`${BASE}/internal/assemble`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(KEY ? { 'x-internal-key': KEY } : {}) },
    body: JSON.stringify(contaminated()),
  });
  const body = await res.json().catch(() => ({}));
  return { status: body.status, reason: body.payload?.reason, state: body.payload?.state };
};

console.log('');
console.log('Negative control — TC23: remove the tripwire and watch the payload through');
console.log('=========================================================================');
console.log('');

let failures = 0;
const say = (pass, msg) => { if (!pass) failures++; console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${msg}`); };

if (!await restart()) { console.error('the service would not start before the fault'); process.exit(1); }
const before = await assemble();
say(before.reason === 'injection_detected', `guard in place: ${before.status}/${before.reason ?? before.state}`);

// --- the fault ----------------------------------------------------------------------------
const src = original.toString('utf8');
const CALL = "  const hits = scanForInjection(body, { skipKeys: ['doc_id', 'trace_id'] });";
if (!src.includes(CALL)) {
  console.error('FAIL  could not find the tripwire call to remove — this control tested nothing.');
  process.exit(1);
}
writeFileSync(SERVER, src.replace(CALL, '  const hits = [];'));

let dirty = { status: '(service never came up)' };
if (await restart()) dirty = await assemble();
say(dirty.status === 'ok' && dirty.state === 'in_review',
  `guard removed: ${dirty.status}/${dirty.state ?? dirty.reason} — the payload reaches in_review`);

// --- restore ------------------------------------------------------------------------------
writeFileSync(SERVER, original);
const restored = createHash('sha256').update(readFileSync(SERVER)).digest('hex') === originalHash;
say(restored, `${SERVER} restored byte-for-byte`);

let after = { status: '(service never came up)' };
if (await restart()) after = await assemble();
say(after.reason === 'injection_detected', `guard back: ${after.status}/${after.reason ?? after.state}`);

// Claimed, so checked: the last thing this script says is that the service is up, and it is
// the kind of sentence that is easy to print and wrong.
const stillUp = await healthy(5000);
say(stillUp, `the service is left RUNNING from the restored file${stillUp ? '' : ' — it is not; start it again'}`);

console.log('');
if (failures) { console.error(`FAILED: ${failures} step(s)`); process.exit(1); }
console.log('PASS  the tripwire is load-bearing: with it the run parks, without it the payload ships.');
