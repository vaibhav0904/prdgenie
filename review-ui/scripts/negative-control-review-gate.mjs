// The negative controls for E4, run in both directions.
//
// Three stories each ask for one, and they are all the same shape: remove the thing that
// makes the check work, confirm the bad outcome becomes possible, put it back.
//
//   E4-S3  remove the readiness recomputation      -> a mid-review sign-off SUCCEEDS
//   E4-S4  remove the ungrounded guard             -> an unverified item takes plain approve
//   E4-S6  mark a first-party document third_party -> its requirements re-enter M1
//
// The first two edit `server.js` on disk, restart nothing, and restore in a `finally` with a
// byte comparison — the service is started fresh for each direction so the edit is actually
// exercised rather than assumed. The third edits one column and puts it back.
//
// Usage:  .\run.cmd review-ui/scripts/negative-control-review-gate.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { run as exec, get } from '../db.mjs';
import { ingest, getDocument } from '../ingest.mjs';
import { assemble } from '../assemble.mjs';
import { figures } from '../review.mjs';
import { takeExclusive } from '../../exclusive.mjs';

// ONE MUTATOR AT A TIME (BUG-054).
// This script rewrites review-ui/server.js to remove a guard, and restarts the service — so a
// second copy of it, or a `check-all` sweep running beside it, interleaves, and each reports
// the other's cleanup as its own defect. Inside a sweep that already holds the lock this is a
// no-op.
takeExclusive('review-ui/scripts/negative-control-review-gate.mjs', {
  files: ['review-ui/server.js'],
});

const SERVER = 'review-ui/server.js';
const PORT = Number(process.env.CONTROL_PORT ?? 3199);
const BASE = `http://localhost:${PORT}`;
const original = readFileSync(SERVER, 'utf8');

let failures = 0;
const say = (pass, msg) => { if (!pass) failures++; console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${msg}`); };

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** Start a service on its own port so the edit under test is the one being exercised. */
async function withServer(fn) {
  const child = spawn(process.execPath, [SERVER],
    { env: { ...process.env, SERVICE_PORT: String(PORT) }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) {
      try { await fetch(`${BASE}/api/health`); break; } catch { await sleep(150); }
    }
    return await fn();
  } finally {
    child.kill();
    await sleep(200);
  }
}

const post = async (path, body) => {
  const res = await fetch(BASE + path, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

/** A fresh version with one grounded and one ungrounded requirement, and one story. */
function freshVersion(authorship = 'third_party') {
  const SRC = 'Marcus (Head of Product): Every chart must export as PNG.';
  const env = ingest({
    doc_type: 'transcript', product_id: `control-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    source_channel: 'webhook', raw_text: SRC, authorship,
  });
  const doc = getDocument(env.doc_id);
  const built = assemble(doc, [
    {
      req_id: 'REQ-001', kind: 'functional', statement: 'Every chart exports as PNG.',
      grounded: true, confidence: 'high',
      citations: [{ quote: 'Every chart must export as PNG', start_char: SRC.indexOf('Every'), end_char: SRC.indexOf('Every') + 30, match_kind: 'exact' }],
    },
    {
      req_id: 'REQ-002', kind: 'nonfunctional', statement: 'Charts paint instantly.',
      grounded: false, confidence: 'low',
      citations: [{ quote: 'nowhere', start_char: 0, end_char: 0, match_kind: 'not_found' }],
    },
  ], null, { document_subject: 'a charting product', concerns_product: true }, [], [], {
    epics: [{ epic_id: 'EPIC-001', title: 'Charts', summary: null }],
    features: [{ feature_id: 'FEAT-001', epic_id: 'EPIC-001', title: 'Chart export', req_ids: ['REQ-001'] }],
    stories: [{ story_id: 'STORY-001', feature_id: 'FEAT-001', as_a: 'analyst', i_want: 'a PNG', so_that: 'x', acceptance_criteria: [] }],
    factors: [], unclustered: [],
  });
  return { versionId: built.payload.prd_version_id, docId: env.doc_id };
}

try {
  // === E4-S3: remove the readiness recomputation ==========================================
  console.log('  ..    E4-S3 — the endpoint refuses, not the button');
  {
    const { versionId } = freshVersion();
    const withGate = await withServer(() => post(`/api/prd-versions/${versionId}/sign-off`));
    say(withGate.status === 409 && withGate.body.reason === 'items_undecided',
      `MUST REFUSE: mid-review sign-off is refused with the gate in place (${withGate.body.reason})`);

    // ANCHORED ON WHAT THE SPAN IS, not on the exact line that follows it. The end anchor used
    // to be `  try {\n    signOff(versionId);` verbatim, and E6-S3 changed that call to capture
    // its return value — so this control died with "could not locate the readiness gate" in the
    // middle of a sweep, on a day nothing about the review gate had changed. A control that
    // breaks when unrelated code near it is edited spends its failures on the wrong thing.
    const start = original.indexOf('  const gate = readiness(versionId);');
    const end = original.search(/\n {2}(?:let \w+;\n {2})?try \{\n {4}(?:\w+ = )?signOff\(versionId\);/);
    if (start < 0 || end < 0 || end <= start) throw new Error('could not locate the readiness gate to remove');
    writeFileSync(SERVER, original.slice(0, start) + original.slice(end));

    const { versionId: v2 } = freshVersion();
    const without = await withServer(() => post(`/api/prd-versions/${v2}/sign-off`));
    say(without.status === 200 && without.body.state === 'approved',
      'MUST SUCCEED: with the recomputation removed, a mid-review sign-off goes through — '
      + 'so the check is what stops it, not the disabled button');
    writeFileSync(SERVER, original);
  }

  // === E4-S4: remove the ungrounded guard =================================================
  console.log('  ..    E4-S4 — approving something unproven costs a sentence');
  {
    const { versionId } = freshVersion();
    const guarded = await withServer(() => post(`/api/prd-versions/${versionId}/decisions`,
      { item_type: 'requirement', item_id: `${versionId}-REQ-002`, decision: 'approve' }));
    say(guarded.status === 409 && guarded.body.reason === 'ungrounded_requires_override',
      `MUST REFUSE: plain approve on an unverified requirement is refused (${guarded.body.reason})`);

    const marker = "  if (item_type === 'requirement' && decision === 'approve' && !item.grounded) {";
    const at = original.indexOf(marker);
    const close = original.indexOf('  }\n', original.indexOf('});', at));
    if (at < 0) throw new Error('could not locate the ungrounded guard');
    const endOfGuard = original.indexOf('\n  }\n', at) + '\n  }\n'.length;
    writeFileSync(SERVER, original.slice(0, at) + original.slice(endOfGuard));
    void close;

    const { versionId: v2 } = freshVersion();
    const unguarded = await withServer(() => post(`/api/prd-versions/${v2}/decisions`,
      { item_type: 'requirement', item_id: `${v2}-REQ-002`, decision: 'approve' }));
    say(unguarded.status === 200,
      'MUST SUCCEED: with the guard removed, an unverified item takes the plain approve path — '
      + 'and the override count would have stayed at zero while an unverified item shipped');
    say(figures(v2).approved_ungrounded === 0 && figures(v2).approved === 1,
      `and it lands in the WRONG bucket: approved=${figures(v2).approved}, overrides=${figures(v2).approved_ungrounded}`);
    writeFileSync(SERVER, original);
  }

  // === E4-S6: a first-party document mislabelled ==========================================
  console.log('  ..    E4-S6 — my own words are not evidence');
  {
    const { versionId, docId } = freshVersion('first_party');
    const before = figures(versionId);
    say(before.requirements_excluded_from_grounding === 2 && before.grounded_of === 0,
      `MUST EXCLUDE: every requirement from the PM's own document is out of the grounding rate `
      + `(${before.requirements_excluded_from_grounding} of ${before.requirements} excluded)`);

    exec("UPDATE source_documents SET authorship='third_party' WHERE doc_id=?", [docId]);
    exec(`UPDATE requirements SET pm_authored=0 WHERE prd_version_id=?`, [versionId]);
    const after = figures(versionId);
    say(after.grounded_of === 2 && after.requirements_excluded_from_grounding === 0,
      `MUST RE-ENTER: relabelled third_party, the same requirements are back in M1 `
      + `(${after.grounded} of ${after.grounded_of} grounded) — the exclusion is doing real work`);

    exec("UPDATE source_documents SET authorship='first_party' WHERE doc_id=?", [docId]);
    exec(`UPDATE requirements SET pm_authored=1 WHERE prd_version_id=?`, [versionId]);
    say(figures(versionId).grounded_of === 0, 'restored');
    say(get('SELECT authorship FROM source_documents WHERE doc_id=?', [docId]).authorship === 'first_party',
      'and the document carries its original authorship again');
  }
} finally {
  // The file goes back byte for byte, whatever happened above.
  writeFileSync(SERVER, original);
}

say(readFileSync(SERVER, 'utf8') === original, 'server.js restored byte-for-byte');

console.log('');
if (failures) console.error(`FAILED — ${failures} check(s).`);
else {
  console.log('Each guard was removed and the bad outcome became possible; each was restored and');
  console.log('it stopped being possible. None of these checks would have failed if the guard had');
  console.log('never worked in the first place, which is the point of running them this way.');
}
process.exitCode = failures ? 1 : 0;
