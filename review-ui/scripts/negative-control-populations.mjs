// The control for verify-populations: break the split six ways and require it to notice.
//
// The check is green, which is the state in which a check proves nothing. Every case runs the
// SHIPPED checker against a copy of `review-ui/` and `docs/` with one thing changed, reading the
// REAL database read-only through DB_PATH — the plants are all in code and prose, so a copy of
// the rows would prove nothing a pointer to them does not.
//
//   NC1  the real code is green
//   NC2  a predicate that is always true      -> red. Both halves become the same population,
//        which is the failure mode of "we split it" with no split in it
//   NC3  a predicate that is a NAMING CONVENTION (product_id LIKE) -> red. This is the tempting
//        wrong fix and the one BUG-065 specifically refused
//   NC4  CONTROL: the real split is NOT called trivial and no product-id literal is found. A
//        checker that shouted at everything would pass NC2 and NC3 and be worthless
//   NC5  a metric publishing ONE population    -> red
//   NC6  the predicate applied to BOTH populations -> red. The `all` figure moves, which is a
//        correction dressed as a restatement. THIS is the case the first TC2 could not fail
//   NC7  docs/metrics.md stripped of the two population labels -> red, in a sentence
//   NC8  and the real tree is green again afterwards
//
// Usage:  .\run.cmd review-ui\scripts\negative-control-populations.mjs

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const CHECK = 'review-ui/scripts/verify-populations.mjs';
const DB = resolve(process.env.DB_PATH ?? './data/prdgenie.db');

/** A copy of the tree with one file rewritten, reading the real rows. */
function runWith(file, edit) {
  const dir = mkdtempSync(join(tmpdir(), 'pops-'));
  mkdirSync(join(dir, 'docs'), { recursive: true });
  cpSync('review-ui', join(dir, 'review-ui'), { recursive: true });
  cpSync('docs/metrics.md', join(dir, 'docs/metrics.md'));
  if (edit) {
    const p = join(dir, file);
    const before = readFileSync(p, 'utf8');
    const after = edit(before);
    // A plant that changed nothing is a case that proves nothing (NC4 of the doors control
    // learned this the same way). Fail loudly rather than reporting a green.
    if (after === before) {
      rmSync(dir, { recursive: true, force: true });
      return { code: null, out: `PLANT DID NOT APPLY to ${file} — the anchor has moved` };
    }
    writeFileSync(p, after);
  }
  const r = spawnSync(process.execPath, [join(dir, CHECK)], {
    encoding: 'utf8', cwd: dir, env: { ...process.env, DB_PATH: DB },
  });
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const rows = [];
const check = (id, what, pass, detail) => {
  rows.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${what}`);
  if (detail) console.log(`           ${String(detail).split('\n').join('\n           ')}`);
};
const caseLine = (out, id) => out.split('\n').find((l) => l.includes(` ${id}  `))?.trim() ?? '(no line)';
const red = (out, id) => new RegExp(`FAIL\\s+${id}\\b`).test(out);

const M = 'review-ui/metrics.mjs';

// --- NC1 ---------------------------------------------------------------------------------------
{
  const { code, out } = runWith(null, null);
  check('NC1', 'the real code is green', code === 0, caseLine(out, 'TC6'));
}

// --- NC2: a predicate that is always true --------------------------------------------------------
{
  const { code, out } = runWith(M, (s) => s.replace(
    'version: (v) => `EXISTS (SELECT 1 FROM llm_calls c WHERE c.trace_id = ${v}.trace_id)`,',
    'version: (v) => `(${v}.prd_version_id IS NOT NULL)`,'));
  check('NC2', 'a predicate that is always true is caught — a split that splits nothing',
    code === 1 && (red(out, 'TC6') || red(out, 'TC2')), caseLine(out, 'TC6'));
}

// --- NC3: a naming convention ---------------------------------------------------------------------
// The tempting wrong fix: filter on what things are CALLED. It gives a plausible number and it
// is a convention a future fixture joins by accident.
{
  const { code, out } = runWith(M, (s) => s.replace(
    'version: (v) => `EXISTS (SELECT 1 FROM llm_calls c WHERE c.trace_id = ${v}.trace_id)`,',
    "version: (v) => `${v}.prd_id LIKE 'forgesight%'`,"));
  check('NC3', 'a NAMING CONVENTION as the predicate is caught, and named as one',
    code === 1 && red(out, 'TC4'), caseLine(out, 'TC4'));
}

// --- NC4: CONTROL ----------------------------------------------------------------------------------
// NC1 says the run is green. This says something narrower: the real predicate is not itself
// reported as a naming convention, and the real split is not reported as trivial. A checker that
// failed everything would pass NC2, NC3, NC5, NC6 and NC7 and be worth nothing.
{
  const { out } = runWith(null, null);
  const clean = /PASS\s+TC4/.test(out) && /PASS\s+TC6/.test(out) && !/FAIL/.test(out);
  check('NC4', 'CONTROL: the real predicate is not called a convention, nor the split trivial',
    clean, `${(out.match(/^PASS/gm) ?? []).length} cases pass, ${(out.match(/^FAIL/gm) ?? []).length} fail`);
}

// --- NC5: one population ---------------------------------------------------------------------------
{
  const { code, out } = runWith(M, (s) => s.replace(
    '    populations: [\n      {\n        scope: \'all\',',
    '    populations: [\n      {\n        scope: \'only\','));
  check('NC5', 'a metric that publishes one population instead of two is caught',
    code === 1 && red(out, 'TC1'), caseLine(out, 'TC1'));
}

// --- NC6: the predicate on BOTH populations ----------------------------------------------------------
// The published figure moves. This is the case the FIRST version of TC2 could not fail, because
// it compared the metric function against itself — both sides moved together and it stayed green.
{
  const { code, out } = runWith(M, (s) => s.replace(
    "const scoped = (scope, pred) => (scope === 'pipeline' ? pred : '');",
    'const scoped = (scope, pred) => pred;'));
  check('NC6', 'applying the split to the `all` figure too is caught — a correction in disguise',
    code === 1 && red(out, 'TC2'), caseLine(out, 'TC2'));
}

// --- NC7: the doc stops saying it ----------------------------------------------------------------------
{
  const { code, out } = runWith('docs/metrics.md', (s) => s
    .replace(/across everything the database holds/g, 'over the rows')
    .replace(/across runs the pipeline actually produced/g, 'over the good rows'));
  check('NC7', 'a document that stops publishing the populations is caught',
    code === 1 && red(out, 'TC7'), caseLine(out, 'TC7'));
}

// --- NC8 ------------------------------------------------------------------------------------------------
{
  const { code } = runWith(null, null);
  check('NC8', 'and the real tree is green again afterwards', code === 0,
    'nothing was written outside a temp copy; the database was read, never written');
}

const failed = rows.filter((r) => !r.pass).length;
console.log('');
console.log(`${rows.length - failed}/${rows.length} controls behaved as required.`);
if (failed) {
  console.log('');
  console.log('A control that does not go red is not a control. Treat verify-populations as');
  console.log('unproven until this passes.');
}
process.exitCode = failed ? 1 : 0;
