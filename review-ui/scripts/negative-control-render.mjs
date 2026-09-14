// NEGATIVE CONTROL for the render audit (E8-S4 TC3): plant a field nobody renders and prove
// the audit goes red and names it. Without this, "74 fields homed" is a list agreeing with
// itself — the same reason every other control in this repo exists (BUG-003, E4-S4, E7-S1).

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT = join(REPO, 'review-ui', 'scripts', 'audit-render.mjs');

const run = (env) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, ['--env-file-if-exists=.env', AUDIT],
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

const clean = run({});
say('NC1', clean.code === 0, 'the audit passes on the real payload', `exit=${clean.code}`);

const planted = run({ AUDIT_INJECT_FAKE: '1' });
say('NC2', planted.code !== 0, 'with a planted unrendered field, the audit FAILS', `exit=${planted.code}`);
say('NC3', planted.out.includes('zz_planted_unrendered') && planted.out.includes('NO HOME'),
  'and it NAMES the field rather than failing vaguely', 'zz_planted_unrendered — NO HOME');

console.log(failures ? '\nCONTROL FAILED — the audit cannot go red, so its green means nothing.'
  : '\nThe audit can fail, and it says at what. Its green is earned.');
if (failures) process.exitCode = 1;
