// The negative control for C3, run in BOTH directions.
//
// C3's second half is the only check in this project that defends the sentence "the model
// never writes a number that ships". A green C3 that could not go red would make that sentence
// unfalsifiable — which is BUG-001's disease, and C3 is exactly the kind of case it hides in:
// everything it checks is normally true.
//
//   MUST GO RED    one stored score is changed by 0.1 -> C3 fails and NAMES the feature,
//                  printing both the stored and the recomputed value
//   MUST GO GREEN  the score is restored -> C3 passes again
//
// The edit is made in the database and undone in a `finally`, then the value is compared. A
// verifier may not leave a row another verifier reads as a defect (BUG-012's test plan).
//
// Usage:  .\run.cmd evals/harness/negative-control-c3.mjs

import { readFileSync, readdirSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { all, get, run as exec } from '../../review-ui/db.mjs';

// BUG-047. A control grades two or three times per run, and those results are working-out,
// not evidence. `evals/results/` is where archived measurements live, cited from story cards;
// a directory that also collects throwaways stops being one you can trust to hold only what
// somebody decided to keep. `grade.mjs` has had `--results=` for exactly this since E2.
const RESULTS = mkdtempSync(join(tmpdir(), 'c3-control-'));

let failures = 0;
const say = (pass, msg) => { if (!pass) failures++; console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${msg}`); };

function newestC3() {
  const f = readdirSync(RESULTS)
    .filter((n) => /-C3(-run\d+)?\.md$/.test(n))
    .map((n) => ({ n, m: statSync(`${RESULTS}/${n}`).mtimeMs }))
    .sort((a, b) => a.m - b.m)
    .pop();
  return f ? { name: f.n, text: readFileSync(`${RESULTS}/${f.n}`, 'utf8') } : { name: '(none)', text: '' };
}

function gradeC3() {
  try {
    execFileSync(process.execPath, ['evals/harness/grade.mjs', 'C3', `--results=${RESULTS}`], { encoding: 'utf8', stdio: 'pipe' });
  } catch { /* a FAIL exits non-zero, which is the point */ }
  return newestC3();
}

const manifest = JSON.parse(readFileSync('evals/results/.last-run.json', 'utf8'));
const scored = Object.entries(manifest.runs ?? {})
  .filter(([, r]) => r.prd_version_id)
  .flatMap(([fx, r]) => all(
    `SELECT f.feature_id, f.priority_score FROM features f
     JOIN priority_factors p ON p.feature_id = f.feature_id
     WHERE f.prd_version_id=? AND f.priority_score IS NOT NULL`, [r.prd_version_id])
    .map((f) => ({ fx, ...f })));

if (!scored.length) {
  console.error('No stored scores in this run. Produce one first:');
  console.error('  .\\run.cmd evals/harness/produce.mjs');
  process.exit(1);
}

const victim = scored[0];
console.log(`  ..    victim: ${victim.fx} ${victim.feature_id}, stored ${victim.priority_score}`);
const before = gradeC3();
say(/## Verdict: PASS/.test(before.text), `baseline is green (${before.name})`);

const tampered = Math.round((victim.priority_score + 0.1) * 10) / 10;
try {
  exec('UPDATE features SET priority_score=? WHERE feature_id=?', [tampered, victim.feature_id]);

  const red = gradeC3();
  say(/## Verdict: FAIL/.test(red.text), `MUST GO RED: C3 fails on a 0.1 change (${red.name})`);
  say(red.text.includes(victim.feature_id),
    'and it NAMES the feature — a verdict that said only "FAIL" would send someone to read 13 rows');
  say(new RegExp(`\\| ${tampered} \\| \\*\\*${victim.priority_score}\\*\\*`).test(red.text)
    || red.text.includes(`| ${tampered} |`),
    `and prints both numbers: stored ${tampered}, recomputed ${victim.priority_score}`);
} finally {
  exec('UPDATE features SET priority_score=? WHERE feature_id=?', [victim.priority_score, victim.feature_id]);
}

const restored = get('SELECT priority_score FROM features WHERE feature_id=?', [victim.feature_id]);
say(restored.priority_score === victim.priority_score,
  `the score is restored: ${restored.priority_score}`);

const green = gradeC3();
say(/## Verdict: PASS/.test(green.text), `MUST GO GREEN: C3 passes again (${green.name})`);

console.log('');
if (failures) console.error(`FAILED — ${failures} check(s).`);
else {
  console.log('C3 can fail. "The model never writes a number that ships" is now a sentence');
  console.log('with a check behind it that has been observed rejecting a wrong number.');
}
process.exitCode = failures ? 1 : 0;
