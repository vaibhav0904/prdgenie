// Every script that mutates shared state takes the exclusive lock (BUG-054).
//
// Three times a collision produced a plausible story about the wrong thing — a stale prompt, a
// tree "unchanged", a control that "failed" with `exit null` at a 600-second timeout. The lock
// stops that. This is what stops the lock from quietly stopping being true.
//
// **The candidates are derived, not listed.** A hand-kept register of mutators is a hand-counted
// denominator (BUG-003), and the next drill somebody writes will not be on it. So every script
// is read, and one that shows a sign of touching shared state has to account for itself.
//
// THE SIGNS, and each is a thing that breaks another script running beside it:
//
//   writes a file AND names one of the shared paths   server.js, a workflow, a prompt
//   runs import-workflows.mjs                          deploys into the container
//   restarts a container                               n8n goes away mid-run for everyone
//
// ACCOUNTING FOR ITSELF means one of two things: calling `takeExclusive`, or being declared
// below with the reason it does not need to. **The commonest honest reason is that it writes
// only into a temp copy** — half this suite works that way, and a copy is nobody else's
// business. That distinction cannot be made by reading for a `writeFileSync`, which is exactly
// why the declarations exist and why they print on every run.
//
// Usage:  .\run.cmd n8n/scripts/check-exclusive.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIRS = ['n8n/scripts', 'review-ui/scripts', 'evals/harness'];
const ALSO = ['check-all.mjs'];

const SHARED = [/review-ui\/server\.js/, /n8n\/workflows\//, /n8n\/prompts\//];
const WRITES = /writeFileSync\s*\(/;

// MENTIONING A DEPLOY IS NOT DEPLOYING. The first version matched the bare name, and so
// flagged a script that only prints "run import-workflows.mjs" in an error message — and this
// very file, which names it in a sentence. So the sign is an EXECUTION near the mention.
const RUNS_IT = (name) => new RegExp(`(execFileSync|execSync|spawnSync|spawn)\\([\\s\\S]{0,240}?${name}`);
const DEPLOYS = RUNS_IT('import-workflows');
const RESTARTS = RUNS_IT("['\"]restart['\"]");

// Scripts that trip a sign and are still safe beside anything, each with the reason.
const NO_LOCK_NEEDED = {
  'check-deployed-prompts.mjs': 'reads prompts and workflows; the only thing it writes is nothing',
  'check-injection-layers.mjs': 'reads the shipped workflows',
  'check-node-references.mjs': 'reads the shipped workflows',
  'check-spine.mjs': 'reads the spine',
  'check-error-routing.mjs': 'reads workflow settings',
  'check-failure-routing.mjs': 'reads workflow settings',
  'check-internal-endpoints.mjs': 'reads workflow URLs and knocks; it writes nothing',
  'negative-control-internal-endpoints.mjs': 'writes a rewritten server.js into a temp copy, never the real one',
  'negative-control-exclusive.mjs': 'writes only into a temp copy of the suite — including a planted script that names a shared path',
  'negative-control-node-references.mjs': 'writes only into a temp copy of the workflows',
  'negative-control-deployed-prompts.mjs': 'writes only into temp copies of prompts and workflows',
  'negative-control-injection-layers.mjs': 'writes only into a temp copy',
  'negative-control-export-hygiene.mjs': 'copies n8n/ and .env into a temp tree and plants keys THERE; the real exports are only read',
  'negative-control-doors-registered.mjs': 'rewrites one workflow export inside a temp copy; its probes are GETs, so nothing runs in n8n either',
  'negative-control-corpus-routing.mjs': 'rewrites one file in a temp copy of the tree and reads a COPY of the database; it changes no row, and NC7 counts them to say so',
  'negative-control-reason-codes.mjs': 'writes one rewritten module into a temp copy of the tree, and points DB_PATH at that copy',
  'negative-control-version-chain.mjs': 'rewrites files in a temp copy and gives every case a database of its own',
  'sync-prompts.mjs': 'a generator, run deliberately; import-workflows takes the lock after it',
  'verify-routing.mjs': 'reads the shipped workflows; its writes are all on a DB copy',
  'verify-detail-budget.mjs': 'lifts code out of the shipped workflow and runs it',
  'verify-degradation.mjs': 'reads the shipped workflow',
  'verify-judge-isolation.mjs': 'reads files to prove nothing reads the judge',
  'verify-doors.mjs': 'knocks on the doors; it writes no shared file',
  'produce.mjs': 'writes a run manifest of its own, and is declared out of the sweep anyway',
  'probe-delta.mjs': 'writes a manifest of its own',
  'spread.mjs': 'writes result files of its own',
  'grade.mjs': 'writes a dated result file of its own',
  'report-gaps.mjs': 'prints; writes nothing shared',
  'weekly-report.mjs': 'writes a report of its own under reports/',
  'verify-weekly.mjs': 'writes a report into a temp directory',
  'audit-render.mjs': 'reads a payload',
  'bind-provider-credential.mjs': 'changes an n8n credential, not a file any script reads',
  'provision-internal-credential.mjs': 'same',
  'preflight.mjs': 'reports what is running; changes nothing',
  'fake-provider.mjs': 'a stand-in server; the drill that starts it holds the lock',
};

const files = [];
for (const dir of DIRS) {
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.mjs')).sort()) {
    files.push({ file: f, path: join(dir, f) });
  }
}
for (const f of ALSO) if (existsSync(f)) files.push({ file: f, path: f });

const candidates = [];
for (const f of files) {
  const src = readFileSync(f.path, 'utf8');
  const signs = [];
  if (WRITES.test(src) && SHARED.some((r) => r.test(src))) signs.push('writes a shared file');
  if (DEPLOYS.test(src)) signs.push('deploys workflows');
  if (RESTARTS.test(src)) signs.push('restarts a container');
  if (signs.length) candidates.push({ ...f, signs, locked: /takeExclusive\s*\(/.test(src) });
}

const locked = candidates.filter((c) => c.locked);
const declared = candidates.filter((c) => !c.locked && c.file in NO_LOCK_NEEDED);
const unaccounted = candidates.filter((c) => !c.locked && !(c.file in NO_LOCK_NEEDED));

for (const c of locked) console.log(`  locked      ${c.path.padEnd(48)} ${c.signs.join(', ')}`);
for (const c of declared) console.log(`  declared    ${c.path.padEnd(48)} ${NO_LOCK_NEEDED[c.file]}`);
console.log('');

let failed = false;

// THE RUNNER, asserted by name and on purpose. `check-all` is the one script whose job is to
// run the others, so it holds the lock for all of them and hands it down — and it does that
// without tripping any sign of its own, which would leave the derivation silent about the most
// important holder in the project.
const runner = readFileSync('check-all.mjs', 'utf8');
if (!/takeExclusive\s*\(/.test(runner) || !/exclusiveEnvFor\s*\(/.test(runner)) {
  failed = true;
  console.error('FAIL  check-all.mjs must take the lock AND hand it to its children.');
  console.error('      Without the handoff every mutating check inside the sweep queues behind');
  console.error('      its own parent, which is a lock that stops the thing it protects.');
}

// Coverage asserted, not assumed (BUG-003/019). No candidates at all means the signs stopped
// matching, not that the project stopped mutating things.
if (candidates.length === 0) {
  console.error('FAIL  no candidate scripts found — the reader is broken, not the suite clean.');
  failed = true;
} else if (locked.length === 0) {
  console.error('FAIL  not one candidate takes the lock. That is the reader, not the suite.');
  failed = true;
}

if (unaccounted.length) {
  failed = true;
  console.error(`FAIL  ${unaccounted.length} script(s) touch shared state and neither lock nor declare:`);
  for (const c of unaccounted) console.error(`  ${c.path}  (${c.signs.join(', ')})`);
  console.error('');
  console.error('Either call takeExclusive() from exclusive.mjs, or add it to NO_LOCK_NEEDED');
  console.error('with the reason it is safe beside another run. Writing only into a temp copy');
  console.error('is the commonest honest reason — and it is a reason, not an exemption.');
}

if (!failed) {
  console.log(`PASS  ${candidates.length} scripts touch shared state: ${locked.length} take the lock, `
    + `${declared.length} declared safe with a reason.`);
  console.log('');
  console.log('The candidates are derived from what the scripts DO. The declarations are read');
  console.log('out loud every run, because a reason nobody re-reads is an allow-list.');
}

process.exitCode = failed ? 1 : 0;
