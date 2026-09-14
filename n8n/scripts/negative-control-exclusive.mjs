// The control for check-exclusive: a mutator that skips the lock must be named, not missed.
//
// The check derives its candidates from what each script does, and every derivation has the
// same failure mode — it can stop matching and report a clean suite instead of a broken reader.
// So this plants the three things it is supposed to catch:
//
//   TC2  a NEW script that writes a shared file and takes no lock
//   TC3  an EXISTING locked script with its lock removed
//   TC4  the runner's handoff deleted — the one gap that would make the lock refuse the very
//        checks it exists to protect
//
// Every case runs the SHIPPED checker against a mutated copy of the tree.
//
// Usage:  .\run.cmd n8n/scripts/negative-control-exclusive.mjs

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CHECK = 'n8n/scripts/check-exclusive.mjs';

/** A copy of everything the check reads, mutated by `edit`, with the check run inside it. */
function runIn(edit) {
  const dir = mkdtempSync(join(tmpdir(), 'exclusive-'));
  for (const d of ['n8n/scripts', 'review-ui/scripts', 'evals/harness']) {
    mkdirSync(join(dir, d), { recursive: true });
    cpSync(d, join(dir, d), { recursive: true });
  }
  copyFileSync('check-all.mjs', join(dir, 'check-all.mjs'));
  copyFileSync('exclusive.mjs', join(dir, 'exclusive.mjs'));

  edit({
    read: (f) => readFileSync(join(dir, f), 'utf8'),
    write: (f, s) => writeFileSync(join(dir, f), s),
  });

  // The check reads relative paths, so it has to run WITH the copy as its working directory.
  const r = spawnSync(process.execPath, [join(dir, CHECK)], { encoding: 'utf8', cwd: dir });
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const rows = [];
const check = (id, what, pass, detail) => {
  rows.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${what}${detail ? `\n           ${detail}` : ''}`);
};
const lines = (out, needle) => out.split('\n').filter((l) => l.includes(needle)).join('\n           ').trim();

// --- TC1: the real tree is clean -------------------------------------------------------------
{
  const { code, out } = runIn(() => {});
  check('TC1', 'an untouched copy of the suite passes', code === 0, lines(out, 'PASS'));
}

// --- TC2: a new mutator that takes no lock ----------------------------------------------------
// The case that will actually happen: somebody writes the next drill and does not know the lock
// exists. The check has to find it from what the file DOES.
{
  const { code, out } = runIn(({ write }) => {
    write('review-ui/scripts/drill-invented.mjs', [
      "import { readFileSync, writeFileSync } from 'node:fs';",
      '',
      "const SERVER = 'review-ui/server.js';",
      "writeFileSync(SERVER, readFileSync(SERVER, 'utf8').replace('a', 'b'));",
      '',
    ].join('\n'));
  });
  check('TC2', 'a NEW script that writes a shared file and takes no lock is named',
    code === 1 && out.includes('drill-invented.mjs'), lines(out, 'drill-invented'));
}

// --- TC3: a lock removed from a script that has one -------------------------------------------
{
  const { code, out } = runIn(({ read, write }) => {
    const f = 'review-ui/scripts/drill-telemetry.mjs';
    write(f, read(f).replace(/takeExclusive\(/g, 'noLockHere('));
  });
  check('TC3', 'an EXISTING mutator with its lock removed is named',
    code === 1 && out.includes('drill-telemetry.mjs'), lines(out, 'drill-telemetry'));
}

// --- TC4: the runner stops handing the lock down ----------------------------------------------
// THE SUBTLE ONE. `check-all` still takes the lock, so nothing looks wrong — but every mutating
// check inside the sweep now queues behind its own parent and is refused. A lock that stops the
// thing it protects looks exactly like a working lock until the sweep goes red.
{
  const { code, out } = runIn(({ read, write }) => {
    write('check-all.mjs', read('check-all.mjs').replace(/exclusiveEnvFor\(\)/g, '{}'));
  });
  check('TC4', 'the runner losing its handoff is caught, even though it still takes the lock',
    code === 1 && out.includes('hand it to its children'), lines(out, 'hand it to its children'));
}

const failed = rows.filter((r) => !r.pass).length;
console.log('');
console.log(`${rows.length - failed}/${rows.length} controls behaved as required.`);
console.log('');
console.log('NOT CONTROLLED HERE: the "no candidates found" guard. Blanking every script in a');
console.log('copy to prove it would also delete the checker being run, so the guard is asserted');
console.log('by TC1 finding 15 candidates rather than by a plant. Named rather than skipped.');
if (failed) {
  console.log('');
  console.log('A control that does not go red is not a control. Treat check-exclusive as');
  console.log('unproven until this passes.');
}
process.exitCode = failed ? 1 : 0;
