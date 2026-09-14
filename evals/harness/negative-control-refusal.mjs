// The negative control for BUG-017, run in BOTH directions.
//
// BUG-017 is a case that could not go green. So confirming it now goes green is only half
// the control — the other half is confirming it still goes red when it should, and that the
// specific defect (a park recorded without its version id) is what was making the difference.
//
// The manifest is edited in place and restored in a `finally`, then byte-compared.
//
// Usage:  .\run.cmd evals/harness/negative-control-refusal.mjs

import { readFileSync, writeFileSync, readdirSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// BUG-047. The grades this control takes are working-out, not evidence, so they go to a
// temporary directory. `evals/results/` holds archived measurements that story cards cite.
const RESULTS = mkdtempSync(join(tmpdir(), 'refusal-control-'));

// The verdict lives in the RESULT FILE, not in the command's stdout — stdout says only
// PASS/FAIL per case. Reading the wrong stream is how a control quietly asserts nothing.
// Newest by MODIFICATION TIME, not by filename. Sorting the names puts `-C2.md` after
// `-C2-run9.md` (a dot outranks a hyphen), so a name sort silently reads the oldest file in
// the set — which is exactly the sort of thing that makes a control assert nothing.
function newestC2() {
  const f = readdirSync(RESULTS)
    .filter((n) => /-C2(-run\d+)?\.md$/.test(n))
    .map((n) => ({ n, m: statSync(`${RESULTS}/${n}`).mtimeMs }))
    .sort((a, b) => a.m - b.m)
    .pop();
  return f ? { n: f.n, t: readFileSync(`${RESULTS}/${f.n}`, 'utf8') } : { n: '(none)', t: '' };
}

const MANIFEST = 'evals/results/.last-run.json';
const original = readFileSync(MANIFEST, 'utf8');

let failures = 0;
const say = (pass, msg) => { if (!pass) failures++; console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${msg}`); };

function gradeC2() {
  try {
    return { code: 0, out: execFileSync(process.execPath, ['evals/harness/grade.mjs', 'C2', `--results=${RESULTS}`], { encoding: 'utf8' }) };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const manifest = JSON.parse(original);
const g1 = manifest.runs?.G1;
if (!g1) {
  console.error('No G1 in the current run. Produce one first:  .\\run.cmd evals/harness/produce.mjs');
  process.exit(1);
}

console.log(`G1 in this run: prd_version_id=${g1.prd_version_id}, park_reason=${g1.park_reason}, total=${g1.total}`);
say(g1.prd_version_id !== null, 'the park recorded its version id (the BUG-017 fix)');
say(g1.park_reason === 'no_requirements_found', 'the park names the right reason');

// --- direction 1: as it stands, the refusal rule must PASS -------------------------------
const green = gradeC2();
const greenFile = newestC2();
const refusalPasses = !/the requirement-free document produced requirements/.test(greenFile.t);
say(refusalPasses, `C2's refusal rule passes in ${greenFile.n} (exit ${green.code})`);

// --- direction 2: reintroduce BUG-017 and require it to go RED ----------------------------
// The whole defect was a null version id. Put it back and nothing else.
try {
  const broken = JSON.parse(original);
  broken.runs.G1.prd_version_id = null;
  broken.runs.G1.state = null;
  writeFileSync(MANIFEST, JSON.stringify(broken, null, 2));

  const red = gradeC2();
  const redFile = newestC2();
  say(red.code !== 0 && /the requirement-free document produced requirements/.test(redFile.t),
    `with the version id removed, C2 fails the refusal rule again (${redFile.n})`);
  say(/Requirements produced: \*\*null\*\*/.test(redFile.t),
    'and the report says "null" — the tell that it could not see the version, not that the system misbehaved');
} finally {
  writeFileSync(MANIFEST, original);
}

const restored = readFileSync(MANIFEST, 'utf8');
say(restored === original, `${MANIFEST} restored byte-for-byte (${restored.length} bytes)`);

const again = gradeC2();
say(again.code === 0 && !/the requirement-free document produced requirements/.test(newestC2().t),
  `the refusal rule passes again (exit ${again.code})`);

console.log();
if (failures) {
  console.error(`NEGATIVE CONTROL FAILED — ${failures} assertion(s).`);
  process.exitCode = 1;
} else {
  console.log('The refusal rule can pass for the right reason and fail for the right reason.');
  console.log('Both directions, which is the point: BUG-017 was a rule that could only ever fail.');
}
