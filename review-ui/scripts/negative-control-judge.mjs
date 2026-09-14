// NEGATIVE CONTROL for the isolation check (E7-S5 TC15).
//
// `verify-judge-isolation.mjs` walks 77 gate-bearing files and finds no judge reference in any
// of them. That is either a real property of this codebase or a check that cannot fail, and
// the two look identical from the outside — which is BUG-001's whole lesson.
//
// So the reference is PLANTED, in a file the check really reads, and the check must go red and
// NAME it. Two plants, in two different halves of the system: an eval case (where a threshold
// lives) and a metric module (where a reported figure lives). One plant in one file would
// prove the check reads that file.
//
// Usage:  .\run.cmd review-ui/scripts/negative-control-judge.mjs

import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const CHECK = join(REPO, 'review-ui', 'scripts', 'verify-judge-isolation.mjs');

const run = (env = {}) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, ['--env-file-if-exists=.env', CHECK],
      { encoding: 'utf8', cwd: REPO, env: { ...process.env, ...env } }) };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
};

let failures = 0;
const say = (id, pass, msg, detail = '') => {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${msg}${detail ? `  — ${detail}` : ''}`);
};

const clean = run();
say('NC1', clean.code === 0, 'the check passes on the real tree', `exit=${clean.code}`);

for (const [id, file] of [['NC2', 'evals/harness/cases/C1.mjs'], ['NC3', 'review-ui/metrics.mjs']]) {
  const planted = run({ JUDGE_ISOLATION_INJECT: file });
  const named = planted.out.includes(file) && planted.out.includes('READS the judge');
  say(id, planted.code !== 0 && named,
    `a judge reference planted in ${file} turns the check RED and names the file`,
    `exit=${planted.code}${named ? '' : ' — and did NOT name it'}`);
}

// The plant must not survive: the seam reads a file and appends in memory, so the tree is
// unchanged either way. Asserted rather than assumed, because a control that edited a real
// file and forgot to restore it would be a defect wearing a test's clothes.
const after = run();
say('NC4', after.code === 0, 'and the tree is unchanged afterwards — the plant was never written',
  `exit=${after.code}`);

console.log(failures
  ? '\nCONTROL FAILED — the isolation check cannot go red, so its green means nothing.'
  : '\nThe isolation check can fail, and it says in which file. Its green is earned.');
if (failures) process.exitCode = 1;
