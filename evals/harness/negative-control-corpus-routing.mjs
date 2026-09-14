// The control for verify-corpus-routing: put BUG-052 back, one rule at a time.
//
// NC2 is the one that matters, and it replants the ACTUAL bug rather than a caricature of it:
// `productFor` is rewritten to return `forgesight` for every fixture, which is what the corpus
// did until this card. `forgesight` has twenty approved versions, so the shipped `routeFor`
// answers `delta` for all ten and the check must say so by name.
//
//   NC1  the real tree is green
//   NC2  every fixture back on one product that HAS an approved version  -> TC3 red, named
//   NC3  every fixture on one product with NO approved version           -> TC2 red, TC3 GREEN.
//        The discriminator: "distinct products" and "on the generate road" are two claims, and
//        a check that conflated them would pass this and prove less than it says.
//   NC4  `dispatch: false` back on the producer's normal path            -> TC5 red
//   NC5  the producer driving generate by hand again                     -> TC6 red
//   NC6  a product reaching the matcher                                  -> TC7 red
//   NC7  not one row changed anywhere
//
// THE DATABASE IS COPIED ONCE AND READ. `routeFor` runs a SELECT and nothing here writes, but a
// control that points at the live file is one edit away from being a mutator, and this project
// has already had two of those (BUG-045, BUG-053). The copy carries the `-wal` and never the
// `-shm` — a stale shared-memory file makes SQLite disagree with itself about a database that
// is otherwise fine (BUG-041's neighbourhood).
//
// Usage:  .\run.cmd evals\harness\negative-control-corpus-routing.mjs

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const CHECK = 'evals/harness/verify-corpus-routing.mjs';
const LIVE_DB = process.env.DB_PATH ?? 'data/prdgenie.db';

// One copy, reused: the check never writes, and thirty megabytes six times over is a control
// that costs more than the thing it is controlling.
const shared = mkdtempSync(join(tmpdir(), 'corpus-db-'));
const DB_COPY = join(shared, 'prdgenie.db');
cpSync(LIVE_DB, DB_COPY);
if (existsSync(`${LIVE_DB}-wal`)) cpSync(`${LIVE_DB}-wal`, `${DB_COPY}-wal`);
/**
 * Row counts for the tables this check could plausibly touch, read through the shipped module
 * so the count comes from the same reader the product uses. Spawned rather than imported: an
 * import here would open the LIVE database, which is the thing being protected.
 */
function fingerprint() {
  const script = join(shared, 'fingerprint.mjs');
  // An absolute file URL, because the script lives in a temp directory and a relative specifier
  // resolves against the file, not the working directory. Windows paths with spaces need the URL
  // form anyway.
  const dbModule = pathToFileURL(resolve('review-ui/db.mjs')).href;
  writeFileSync(script, [
    `import { get } from '${dbModule}';`,
    "const t = ['source_documents', 'prd_versions', 'events', 'requirements', 'prds'];",
    'const out = {};',
    'for (const n of t) out[n] = get(`SELECT COUNT(*) c FROM ${n}`).c;',
    'console.log(JSON.stringify(out));',
  ].join('\n'));
  const r = spawnSync(process.execPath, [script], {
    encoding: 'utf8', cwd: process.cwd(), env: { ...process.env, DB_PATH: DB_COPY },
  });
  if (!r.stdout?.trim()) throw new Error(`fingerprint produced nothing: ${r.stderr ?? ''}`);
  return JSON.parse(r.stdout.trim());
}

const before = fingerprint();

/** A copy of the tree the check reads, with one file rewritten, pointed at the database copy. */
function runWith(file, edit) {
  const dir = mkdtempSync(join(tmpdir(), 'corpus-'));
  mkdirSync(dir, { recursive: true });
  cpSync('evals', join(dir, 'evals'), { recursive: true });
  cpSync('review-ui', join(dir, 'review-ui'), { recursive: true });
  if (edit) {
    const p = join(dir, file);
    writeFileSync(p, edit(readFileSync(p, 'utf8')));
  }
  const r = spawnSync(process.execPath, [join(dir, CHECK)], {
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, DB_PATH: DB_COPY },
  });
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const rows = [];
const check = (id, what, pass, detail) => {
  rows.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${what}${detail ? `\n           ${detail}` : ''}`);
};
const row = (out, id) => (out.split('\n').find((l) => l.includes(` ${id}  `)) ?? '').trim();

// The declaration, matched whole so a rewrite replaces the rule rather than patching it.
const PRODUCT_FOR = /export const productFor = .*/;
const returns = (expr) => (s) => s.replace(PRODUCT_FOR, `export const productFor = () => ${expr};`);

// --- NC1 ------------------------------------------------------------------------------------
{
  const { code, out } = runWith(null, null);
  check('NC1', 'the real corpus is green: ten products, ten generate roads', code === 0,
    row(out, 'TC3'));
}

// --- NC2: the bug itself ---------------------------------------------------------------------
{
  const { code, out } = runWith('evals/harness/labels.mjs', returns('PRODUCT_PREFIX'));
  check('NC2', 'the whole corpus back on `forgesight` is caught — the actual BUG-052 state',
    code === 1 && out.includes('has an approved version'),
    row(out, 'TC3'));
}

// --- NC3: the discriminator --------------------------------------------------------------------
// One shared product, but one nothing has ever approved. TC2 must go red (the products are not
// distinct, so one sign-off would take the whole corpus) while TC3 stays GREEN (nothing is
// approved yet, so today every fixture really would generate). A check that ran the two claims
// together would report one verdict here and be unable to say which was true.
{
  const { code, out } = runWith('evals/harness/labels.mjs', returns("'bug052-never-approved'"));
  const tc2 = row(out, 'TC2');
  const tc3 = row(out, 'TC3');
  check('NC3', 'a SHARED product with no approval: TC2 red, TC3 green — two claims, not one',
    code === 1 && tc2.startsWith('FAIL') && tc3.startsWith('PASS'),
    `${tc2}\n           ${tc3}`);
}

// --- NC4: the flag back on the normal path -------------------------------------------------------
{
  const { code, out } = runWith('evals/harness/produce.mjs', (s) => s.replace(
    '...(INGEST_ONLY ? { dispatch: false } : {}),', 'dispatch: false,'));
  check('NC4', 'the producer asking the door not to dispatch is caught',
    code === 1 && row(out, 'TC5').startsWith('FAIL'), row(out, 'TC5'));
}

// --- NC5: driving generate by hand again ----------------------------------------------------------
{
  const { code, out } = runWith('evals/harness/produce.mjs', (s) => s.replace(
    'const p = env.payload ?? {};',
    'const gen = await post(INGEST.replace(/ingest$/, "webhook/generate"), {});\n    const p = env.payload ?? {};'));
  check('NC5', 'a producer that posts twice, stepping around the fork, is caught',
    code === 1 && row(out, 'TC6').startsWith('FAIL'), row(out, 'TC6'));
}

// --- NC6: a product reaching the matcher -----------------------------------------------------------
{
  const { code, out } = runWith('evals/harness/match.mjs', (s) => `// product\n${s}`);
  check('NC6', 'a product reaching the matcher is caught — labels must join on fixture alone',
    code === 1 && row(out, 'TC7').startsWith('FAIL'), row(out, 'TC7'));
}

// --- NC7: nothing was written ----------------------------------------------------------------------
//
// COUNTED, NOT STATTED, and the first version of this row got it wrong. Comparing the file's
// size and mtime went red on a check that changes nothing: opening a WAL database and closing
// it checkpoints the log into the main file, so the bytes move while not one row does. A
// control that reports that as a write teaches the reader to ignore it.
//
// So the claim is the one that matters — no row changed — and it is asked of the tables this
// check could plausibly touch, counted through the shipped `db.mjs` against the copy.
{
  const { code } = runWith(null, null);
  const after = fingerprint();
  const same = JSON.stringify(after) === JSON.stringify(before);
  check('NC7', 'not one row changed, and the check is green again',
    code === 0 && same,
    same ? Object.entries(after).map(([k, v]) => `${k}=${v}`).join('  ')
      : `BEFORE ${JSON.stringify(before)}\n           AFTER  ${JSON.stringify(after)}`);
}

rmSync(shared, { recursive: true, force: true });

const failed = rows.filter((r) => !r.pass).length;
console.log('');
console.log(`${rows.length - failed}/${rows.length} controls behaved as required.`);
if (failed) {
  console.log('');
  console.log('A control that does not go red is not a control. Treat verify-corpus-routing as');
  console.log('unproven until this passes.');
}
process.exitCode = failed ? 1 : 0;
