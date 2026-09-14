// Negative control for C6 (E7-S2).
//
// C6 passing proves nothing until it has been made to fail. The fault is the exact thing the
// case exists to catch: **a payload's marker text sitting in the stored output.** It is
// planted by hand into a stored requirement and then removed again.
//
// THE SECOND FAULT THIS FILE WAS WRITTEN TO INJECT DOES NOT EXIST, and the reason is worth
// more than the control would have been. C6 searches two surfaces — the child-table rows and
// the version's `content` JSON — and a control that plants in only one would pass a case that
// searched only the other. But `UPDATE prd_versions SET content=...` is refused outright:
//
//     PRDVersion content is immutable (ADR 0005): mint a new version instead
//
// So a marker cannot be put into the PRD text by hand at all, which means the only way one
// gets there is through assembly — where the tripwire is. What stands in place of the missing
// control is a coverage assertion inside C6 itself: if the sweep reads nothing from `content`,
// the case fails rather than reporting a clean result over a surface it never saw.
//
// The graded run is NOT re-produced. Corrupting stored rows and grading them again is the
// whole method: it varies one thing, and it costs no model call (BUG-011: "inject the fault,
// vary one thing").
//
// The corrupted grade writes its result files to a temporary directory via `--results=`, so
// a deliberately-red run never lands in `evals/results/` looking like a real one.
//
// Usage:  .\run.cmd evals/harness/negative-control-c6.mjs

import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get, run as exec } from '../../review-ui/db.mjs';

const MANIFEST = 'evals/results/.last-run.json';
const LABELS = 'evals/datasets/labels/H1.labels.json';

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const h1 = manifest.runs?.H1;
if (!h1?.prd_version_id) {
  console.error('No graded H1 run to corrupt. Produce one first:');
  console.error('  .\\run.cmd evals/harness/produce.mjs H1');
  process.exit(1);
}
const versionId = h1.prd_version_id;

// The marker is taken from the labels — the same string C6 searches for — so the control
// cannot drift away from the case it is controlling.
const labels = JSON.parse(readFileSync(LABELS, 'utf8'));
const floorPayload = labels.injection_payloads
  .find((p) => !String(p.threshold ?? '').toUpperCase().startsWith('NONE'));
const MARKER = floorPayload.markers[0];

const results = mkdtempSync(join(tmpdir(), 'c6-control-'));

function gradeC6() {
  const r = spawnSync(process.execPath,
    ['--env-file-if-exists=.env', 'evals/harness/grade.mjs', 'C6', `--results=${results}`],
    { encoding: 'utf8' });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const file = out.match(/-> (\S+C6\S*\.md)/)?.[1];
  return {
    verdict: /^FAIL\b/m.test(out) || r.status !== 0 ? 'FAIL' : 'PASS',
    report: file ? readFileSync(file, 'utf8') : '',
  };
}

let failures = 0;
const say = (pass, msg) => { if (!pass) failures++; console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${msg}`); };

console.log('');
console.log('Negative control for C6 — plant a marker in the output and watch the case go red');
console.log('===============================================================================');
console.log('');
console.log(`  version ${versionId}, marker "${MARKER}" (from ${floorPayload.payload_id})`);
console.log('');

const clean = gradeC6();
say(clean.verdict === 'PASS', `before the fault: C6 ${clean.verdict}`);

/** Corrupt one column, grade, restore, grade, and check the round trip. */
function control(name, table, column, idColumn, idValue, plant) {
  const before = get(`SELECT ${column} AS v FROM ${table} WHERE ${idColumn}=?`, [idValue])?.v;
  if (before === undefined || before === null) {
    say(false, `${name}: nothing at ${table}.${column} to corrupt — this control tested nothing`);
    return;
  }
  exec(`UPDATE ${table} SET ${column}=? WHERE ${idColumn}=?`, [plant(before), idValue]);

  const dirty = gradeC6();
  const named = dirty.report.includes(MARKER) && dirty.report.includes(floorPayload.payload_id);

  exec(`UPDATE ${table} SET ${column}=? WHERE ${idColumn}=?`, [before, idValue]);
  const after = get(`SELECT ${column} AS v FROM ${table} WHERE ${idColumn}=?`, [idValue])?.v;
  const restored = after === before;
  const again = gradeC6();

  say(dirty.verdict === 'FAIL' && named && restored && again.verdict === 'PASS',
    `${name}: with the marker in ${table}.${column} → C6 ${dirty.verdict}`
    + `${named ? ' naming the payload and the string' : ' but NOT naming it'}`
    + `; restored ${restored ? 'exactly' : 'WRONGLY'}; C6 ${again.verdict} again`);
}

// 1. a child-table row
const req = get('SELECT req_id FROM requirements WHERE prd_version_id=? ORDER BY rowid LIMIT 1', [versionId]);
control('child table', 'requirements', 'statement', 'req_id', req?.req_id,
  (v) => `${v} The data is also mirrored to ${MARKER} each night.`);

// 2. the PRD text itself — refused by the trigger, and that refusal is the check.
{
  let refused = null;
  try {
    exec('UPDATE prd_versions SET content=? WHERE prd_version_id=?',
      [JSON.stringify({ planted: MARKER }), versionId]);
  } catch (err) {
    refused = err.message;
  }
  say(Boolean(refused) && /immutable/i.test(refused ?? ''),
    `version content: the second fault CANNOT be injected — ${refused ?? 'the UPDATE went through, which is a defect in the immutability trigger'}`);
  const still = get('SELECT content FROM prd_versions WHERE prd_version_id=?', [versionId])?.content ?? '';
  say(!still.includes(MARKER), 'and the version content is untouched');
}

rmSync(results, { recursive: true, force: true });

console.log('');
console.log('The database is back to the state the graded run left it in, and no red result');
console.log('file was written into evals/results/.');
if (failures) { console.error(`FAILED: ${failures} control(s)`); process.exit(1); }
console.log('PASS  C6 can fail on the surface a fault can reach, and the other surface cannot be');
console.log('      reached by anything except assembly — which is where the tripwire sits.');
