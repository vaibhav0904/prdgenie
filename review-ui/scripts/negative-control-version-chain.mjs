// The control for verify-version-chain: break each rule the chain rests on, one at a time.
//
// The check is green, which is the state in which a check proves nothing. Every case below runs
// the SHIPPED checker against a copy of the tree with exactly one thing changed.
//
//   NC1  the real tree is green
//   NC2  the supersede moved OUT of the sign-off transaction    -> TC6 red
//   NC3  the supersede deleted entirely                         -> TC5 red
//   NC4  `removed` taken back out of the table                  -> TC1/TC2 red (the BUG-062 state)
//   NC5  the predecessor picked by version number again         -> TC12 red
//   NC6  the history recomputing a diff instead of reading rows -> TC10 red
//   NC7  the state machine widened to admit in_review -> superseded -> TC7 red
//   NC8  the tree is unchanged afterwards
//
// EACH CASE GETS ITS OWN DATABASE. The checker mints versions and signs them off, so pointing
// it at the live file would make this control the mutator its subject is careful not to be
// (BUG-045, BUG-053). A fresh schema per case also means NC4 can ship a table without `removed`
// without touching anything real.
//
// Usage:  .\run.cmd review-ui\scripts\negative-control-version-chain.mjs

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CHECK = 'review-ui/scripts/verify-version-chain.mjs';

/**
 * A copy of the tree with one file rewritten, against a database of its own.
 *
 * `edits` may name more than one file — not to plant more than one fault, but because a single
 * fault sometimes lives in two places. NC4 is the example: the table is created by `schema.sql`
 * and repaired by `migrate()`, so narrowing one and leaving the other is a fault that heals
 * itself before the check ever sees it.
 */
function runWith(file, edit) {
  const edits = file === null ? [] : (Array.isArray(file) ? file : [[file, edit]]);
  const dir = mkdtempSync(join(tmpdir(), 'chain-'));
  mkdirSync(join(dir, 'data'), { recursive: true });
  cpSync('review-ui', join(dir, 'review-ui'), { recursive: true });
  cpSync('docs', join(dir, 'docs'), { recursive: true });
  cpSync('evals', join(dir, 'evals'), { recursive: true });
  for (const [f, fn] of edits) {
    const p = join(dir, f);
    writeFileSync(p, fn(readFileSync(p, 'utf8')));
  }
  const r = spawnSync(process.execPath, [join(dir, CHECK)], {
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, DB_PATH: join(dir, 'data', 'control.db') },
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

// --- NC1 ------------------------------------------------------------------------------------
{
  const { code, out } = runWith(null, null);
  check('NC1', 'the real tree is green on a database of its own', code === 0,
    (out.split('\n').find((l) => /checks passed/.test(l)) ?? '').trim());
}

// --- NC2: the supersede outside the transaction ------------------------------------------------
//
// The one that matters. The story's own note: a separate step is a step that can fail on its
// own, and what it leaves behind is two approved versions of one PRD. Here the UPDATE is moved
// after `tx()` returns, so the approval commits and the supersede is on its own.
{
  const { code, out } = runWith('review-ui/db.mjs', (s) => {
    const from = s.indexOf('    const prd = d.prepare(\'SELECT prd_id FROM prd_versions');
    const to = s.indexOf('    return { changes: res.changes,');
    if (from < 0 || to < 0) throw new Error('signOff supersede block not found');
    const moved = s.slice(from, to)
      .replace(/\bd\.prepare\(/g, 'open().prepare(')
      .replace(/^ {4}/gm, '  ');
    return `${s.slice(0, from)}    return { changes: res.changes, prd_id: null };\n  }) && (() => {\n${moved}    return { changes: 1, superseded: Number(superseded.changes ?? 0), prd_id: prd.prd_id };\n  })();\n}\nfunction __unused() {\n  return tx((d) => {\n${s.slice(to)}`;
  });
  check('NC2', 'the supersede moved OUT of the sign-off transaction is caught',
    code === 1 && row(out, 'TC6').startsWith('FAIL'), row(out, 'TC6') || '(TC6 did not run)');
}

// --- NC3: no supersede at all -------------------------------------------------------------------
{
  const { code, out } = runWith('review-ui/db.mjs', (s) => s.replace(
    /const superseded = d\.prepare\(\s*`UPDATE prd_versions SET state='superseded'[\s\S]*?\)\.run\(prd\.prd_id, prdVersionId\);/,
    'const superseded = { changes: 0 };'));
  check('NC3', 'a sign-off that supersedes nothing is caught',
    code === 1 && row(out, 'TC5').startsWith('FAIL'), row(out, 'TC5'));
}

// --- NC4: the BUG-062 state, put back ------------------------------------------------------------
//
// PLANTED IN `migrate()`, not only in `schema.sql`, and the first version of this case got that
// wrong. Narrowing the CHECK in the schema file did nothing: `migrate()` rebuilds the table
// whenever its DDL lacks `removed`, so the plant was repaired on the way in and the control
// reported a pass. **The migration, not the schema file, is what guarantees the table's shape**
// — which is worth knowing, and is why the fault has to be injected in both.
{
  const narrow = (s) => s.replace(
    /kind\s+TEXT NOT NULL CHECK \(kind IN \('added','modified','contradicted','removed','new_open_question'\)\)/g,
    "kind           TEXT NOT NULL CHECK (kind IN ('added','modified','contradicted','new_open_question'))");
  const { code, out } = runWith([
    ['review-ui/schema.sql', narrow],
    // and stop the migration repairing it on the way in
    ['review-ui/db.mjs', (s) => narrow(s).replace(
      "if (changesDdl && !/'removed'/.test(changesDdl)) {", 'if (false) {')],
  ]);
  check('NC4', 'a table that refuses `removed` is caught — the state BUG-062 was filed for',
    code === 1 && (row(out, 'TC1').startsWith('FAIL') || row(out, 'TC2').startsWith('FAIL')),
    `${row(out, 'TC1')}\n           ${row(out, 'TC2')}`);
}

// --- NC5: the predecessor by number again ---------------------------------------------------------
{
  const { code, out } = runWith('review-ui/review.mjs', (s) => s.replace(
    'export function predecessorOf(versionId) {',
    'export function predecessorOf(versionId) {\n  return null;   // injected: fall back to the version number'));
  check('NC5', 'picking the predecessor by version number instead of derived_from is caught',
    code === 1 && row(out, 'TC12').startsWith('FAIL'), row(out, 'TC12'));
}

// --- NC6: a recomputed changelog -------------------------------------------------------------------
// A history that diffs the text agrees with the text it diffed and looks perfect. The only place
// to catch it is the reader, and TC10 reads the reader.
{
  const { code, out } = runWith('review-ui/review.mjs', (s) => s.replace(
    'const changes = all(\n    `SELECT prd_version_id, kind, req_id, old_text, new_text, doc_id\n       FROM prd_changes',
    'const changes = all(\n    `SELECT prd_version_id, kind, req_id, old_text, new_text, doc_id\n       FROM prd_changes_disabled'));
  check('NC6', 'a versionHistory that stops reading prd_changes is caught',
    code === 1 && row(out, 'TC10').startsWith('FAIL'), row(out, 'TC10') || '(TC10 did not run)');
}

// --- NC7: the state machine widened ------------------------------------------------------------------
{
  const { code, out } = runWith('review-ui/schema.sql', (s) => s.replace(
    "      OR (OLD.state = 'approved'  AND NEW.state = 'superseded')",
    "      OR (OLD.state = 'approved'  AND NEW.state = 'superseded')\n      OR (OLD.state = 'in_review' AND NEW.state = 'superseded')"));
  check('NC7', 'a second door to `superseded` is caught',
    code === 1 && row(out, 'TC7').startsWith('FAIL'), row(out, 'TC7'));
}

// --- NC8: nothing changed --------------------------------------------------------------------------
{
  const { code, out } = runWith(null, null);
  check('NC8', 'and the tree is green again afterwards', code === 0,
    (out.split('\n').find((l) => /checks passed/.test(l)) ?? '').trim());
}

const failed = rows.filter((r) => !r.pass).length;
console.log('');
console.log(`${rows.length - failed}/${rows.length} controls behaved as required.`);
if (failed) {
  console.log('');
  console.log('A control that does not go red is not a control. Treat verify-version-chain as');
  console.log('unproven until this passes.');
}
process.exitCode = failed ? 1 : 0;
