// NEGATIVE CONTROL for the stratified sample (E7-S6 TC11).
//
// `verify-strata.mjs` reports that no stratum branches on `source_channel`, `doc_type` or
// `authorship`. That is either a real property of the sampler or a check that cannot fail,
// and from the outside those look the same — BUG-001's lesson, and the reason every check in
// this project is asked to go red on purpose at least once.
//
// So a spine-breaking predicate is PLANTED, once per forbidden column, and the check must go
// red AND name the stratum. Three plants rather than one: a scan that matched only `doc_type`
// would pass a plant of `doc_type` and prove nothing about the other two.
//
// The plant is an in-memory seam (STRATA_INJECT), so no file on disk is ever edited — which
// is asserted afterwards rather than assumed.
//
// Usage:  .\run.cmd review-ui/scripts/negative-control-strata.mjs

import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const CHECK = join(REPO, 'review-ui', 'scripts', 'verify-strata.mjs');

const run = (env = {}) => {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, ['--env-file-if-exists=.env', CHECK],
        { encoding: 'utf8', cwd: REPO, env: { ...process.env, ...env } }),
    };
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
say('NC1', clean.code === 0, 'the check passes on the real sampler', `exit=${clean.code}`);

const PLANTS = [
  ['NC2', 'doc_type', "sd.doc_type = 'email'"],
  ['NC3', 'source_channel', "sd.source_channel = 'form'"],
  ['NC4', 'authorship', "sd.authorship = 'third_party'"],
];

for (const [id, column, where] of PLANTS) {
  const planted = run({ STRATA_INJECT: where });
  const red = planted.code !== 0;
  const named = planted.out.includes(`found ${column}`) && planted.out.includes('stratum: planted');
  say(id, red && named,
    `a stratum branching on ${column} turns the check RED and names the stratum`,
    `exit=${planted.code}${named ? '' : ' — and did NOT name it'}`);
}

// A stratum that is merely UNUSUAL must not turn it red — a control that fires on anything is
// not a control, it is a broken check that happens to be pointing the right way.
const benign = run({ STRATA_INJECT: "r.confidence < 0.5" });
say('NC5', benign.code === 0,
  'CONTROL: a stratum on an outcome column is accepted — the scan reads the columns, not novelty',
  `exit=${benign.code}`);

const after = run();
say('NC6', after.code === 0, 'and the tree is unchanged afterwards — the plant was never written',
  `exit=${after.code}`);

console.log(failures
  ? '\nCONTROL FAILED — the spine check on the sampler cannot go red, so its green means nothing.'
  : '\nThe sampler\'s spine check can fail, and it says which stratum broke it. Its green is earned.');
if (failures) process.exitCode = 1;
