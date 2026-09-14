// Proves the approval gate refuses everything except the sign-off path (ADR 0006).
//
// Repeatable on purpose: E1-S1 verifies the mechanism, E1-S6 re-runs this against the
// real endpoint, and the UAT script uses it. A gate proven once is not proven.
//
// Seeds its own throwaway product/PRD, asserts every case, cleans up, exits non-zero on
// any failure.

import { open, tx, run, get, all, signOff } from '../db.mjs';

// This script does NOT create schema. It once called initSchema() for convenience, which
// silently recreated any missing trigger before asserting anything — so it passed even
// with the gate's trigger deleted (BUG-001). Setup is init-db.mjs; verification is here;
// a check that repairs what it checks is always green.
assertTriggersPresent();

const SUFFIX = `verify-${Date.now()}`;
const results = [];

function assertTriggersPresent() {
  const REQUIRED = [
    'prd_versions_state_machine',
    // The insert-side half of the same gate (BUG-049). Listed separately because it IS
    // separate: the state machine guards transitions and this guards the first state, and
    // for two weeks only one of them existed.
    'prd_versions_born_unreviewed',
    'prd_versions_content_immutable',
    'source_documents_raw_text_immutable',
    'review_actions_require_reason',
  ];
  let present;
  try {
    present = new Set(
      all("SELECT name FROM sqlite_master WHERE type='trigger'").map((r) => r.name)
    );
  } catch (err) {
    console.error(`Cannot read the database: ${err.message}`);
    // `node`, not `npm`: a default Windows PowerShell blocks npm's .ps1 shim (BUG-002).
    // An error message that names an unrunnable command is worse than no message.
    console.error('Run this first — it verifies schema, it does not create it:');
    console.error('  .\\run.cmd review-ui/scripts/init-db.mjs');
    process.exit(1);
  }
  const missing = REQUIRED.filter((t) => !present.has(t));
  if (missing.length) {
    console.error('GATE VERIFICATION FAILED before any case ran.');
    for (const t of missing) console.error(`  MISSING TRIGGER: ${t}`);
    console.error('\nThe guarantee these enforce is absent. Restore with:');
    console.error('  .\\run.cmd review-ui/scripts/init-db.mjs');
    console.error('then find out how they went missing — this is not a repair job.');
    process.exit(1);
  }
}

function check(id, description, fn, expect) {
  let outcome;
  try {
    fn();
    outcome = 'succeeded';
  } catch (err) {
    outcome = 'refused';
    results.refusalMessage = err.message;
  }
  const pass = outcome === expect;
  results.push({ id, description, expect, outcome, pass, message: results.refusalMessage });
  results.refusalMessage = undefined;
  return pass;
}

function seed() {
  tx((d) => {
    d.prepare('INSERT INTO products (product_id, name) VALUES (?,?)').run(SUFFIX, 'Gate verification');
    d.prepare('INSERT INTO prds (prd_id, product_id) VALUES (?,?)').run(`PRD-${SUFFIX}`, SUFFIX);
  });
  const mk = (versionNo, state) => {
    run('INSERT INTO prd_versions (prd_id, version_no, trace_id, state, content) VALUES (?,?,?,?,?)',
      [`PRD-${SUFFIX}`, versionNo, SUFFIX, state, '{}']);
    return get('SELECT prd_version_id FROM prd_versions WHERE prd_id=? AND version_no=?',
      [`PRD-${SUFFIX}`, versionNo]).prd_version_id;
  };
  return { v1: mk(1, 'draft'), v2: mk(2, 'in_review'), v3: mk(3, 'in_review'), v4: mk(4, 'in_review') };
}

function cleanup() {
  try {
    tx((d) => {
      d.prepare('DELETE FROM signoff_marker WHERE prd_version_id IN (SELECT prd_version_id FROM prd_versions WHERE prd_id=?)').run(`PRD-${SUFFIX}`);
      d.prepare('DELETE FROM prd_versions WHERE prd_id=?').run(`PRD-${SUFFIX}`);
      d.prepare('DELETE FROM prds WHERE prd_id=?').run(`PRD-${SUFFIX}`);
      d.prepare('DELETE FROM products WHERE product_id=?').run(SUFFIX);
    });
  } catch (err) {
    console.warn(`cleanup warning: ${err.message}`);
  }
}

const setState = (id, state) => run('UPDATE prd_versions SET state=? WHERE prd_version_id=?', [state, id]);
const stateOf = (id) => get('SELECT state FROM prd_versions WHERE prd_version_id=?', [id]).state;

const { v1, v2, v3, v4 } = seed();

// TC3 — draft -> approved, by hand
check('TC3', 'draft -> approved by hand', () => setState(v1, 'approved'), 'refused');
if (stateOf(v1) !== 'draft') results.push({ id: 'TC3b', description: 'row unchanged after refusal', expect: 'draft', outcome: stateOf(v1), pass: false });

// TC5 — the headline refusal: in_review -> approved, by hand
check('TC5', 'in_review -> approved by hand (THE headline refusal)', () => setState(v2, 'approved'), 'refused');
if (stateOf(v2) !== 'in_review') results.push({ id: 'TC5b', description: 'row unchanged after refusal', expect: 'in_review', outcome: stateOf(v2), pass: false });

// TC6 — the sign-off path succeeds
check('TC6', 'sign-off endpoint path approves v2', () => signOff(v2), 'succeeded');
if (stateOf(v2) !== 'approved') results.push({ id: 'TC6b', description: 'v2 is approved after sign-off', expect: 'approved', outcome: stateOf(v2), pass: false });

// TC7 — the leak check, on the SAME connection, immediately after
check('TC7', 'marker does not leak to another version (same connection)', () => setState(v3, 'approved'), 'refused');

// TC8 — a stale marker authorizes only the version it names
run('INSERT OR REPLACE INTO signoff_marker (prd_version_id) VALUES (?)', [v2]);
check('TC8', 'stale marker for an approved version cannot approve a different one', () => setState(v4, 'approved'), 'refused');
run('DELETE FROM signoff_marker WHERE prd_version_id=?', [v2]);

// TC4 — approved -> draft
check('TC4', 'approved -> draft', () => setState(v2, 'draft'), 'refused');

// TC9 — legal transitions still work. A gate that refuses everything is a wall.
check('TC9a', 'draft -> in_review', () => setState(v1, 'in_review'), 'succeeded');
check('TC9b', 'in_review -> draft', () => setState(v1, 'draft'), 'succeeded');
check('TC9c', 'approved -> superseded', () => setState(v2, 'superseded'), 'succeeded');

// --- TC10..TC12 — THE OTHER DIRECTION (BUG-049) ----------------------------------------------
//
// Every case above moves a version. For the life of this project nothing asked whether one
// could be BORN approved — and it could: the state machine is `BEFORE UPDATE`, and a row's
// first state is not a transition. Nine green runs of this file proved a wall with a doorway
// beside it, because every case approached from the direction the trigger watched.
let born = 100;
const bornWith = (state) => {
  run('INSERT INTO prd_versions (prd_id, version_no, trace_id, state, content) VALUES (?,?,?,?,?)',
    [`PRD-${SUFFIX}`, ++born, SUFFIX, state, '{}']);
};

check('TC10', 'a version CANNOT be born approved (INSERT, not UPDATE)',
  () => bornWith('approved'), 'refused');
check('TC11', 'a version cannot be born superseded either',
  () => bornWith('superseded'), 'refused');

// THE CONTROL for TC10/TC11. A trigger that refused every insert would pass both and stop the
// product dead — assembly writes `draft`, `applyDelta` writes `in_review`, and both must still
// work. A refusal is only a gate if something gets through it.
check('TC12a', 'CONTROL: a version can still be born draft', () => bornWith('draft'), 'succeeded');
check('TC12b', 'CONTROL: a version can still be born in_review', () => bornWith('in_review'), 'succeeded');

// --- TC13 — coverage, derived rather than typed -----------------------------------------------
//
// Fixing one column is a claim about one column. This reads the schema for every
// `BEFORE UPDATE OF <column>` guard and asks each one the question nobody asked for two weeks:
// **what would an INSERT do here?**
//
// A column answers either with an insert-side trigger on the same table that mentions it, or
// with a declaration saying why an insert is legitimate. `content` and `raw_text` are rules
// about CHANGE — the insert is where their first value arrives. A `state` is different,
// because the row can be born wrong, and `prd_versions.state` is answered by a trigger now
// rather than by a sentence. Both lists print on every run, so a new guard cannot join quietly.
const INSERT_IS_LEGITIMATE = {
  'prd_versions.content':
    'immutability is a rule about CHANGE; the insert is where the first content arrives (ADR 0005)',
  'source_documents.raw_text':
    'same: the insert is where raw_text arrives, and every citation offset depends on it (ADR 0003)',
};

const triggers = all("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger'");
const guarded = triggers
  .map((tr) => ({ tr, m: /BEFORE\s+UPDATE\s+OF\s+(\w+)\s+ON\s+(\w+)/i.exec(tr.sql) }))
  .filter((x) => x.m)
  .map((x) => ({ name: x.tr.name, table: x.m[2], col: x.m[1], column: `${x.m[2]}.${x.m[1]}` }));

const answeredByTrigger = (g) => triggers.some((tr) =>
  new RegExp(`BEFORE\\s+INSERT\\s+ON\\s+${g.table}\\b`, 'i').test(tr.sql)
  && new RegExp(`NEW\\.${g.col}\\b`, 'i').test(tr.sql));

const byTrigger = guarded.filter(answeredByTrigger);
const bySentence = guarded.filter((g) => !answeredByTrigger(g) && g.column in INSERT_IS_LEGITIMATE);
const unanswered = guarded.filter((g) => !answeredByTrigger(g) && !(g.column in INSERT_IS_LEGITIMATE));

results.push({
  id: 'TC13',
  description: `every UPDATE-guarded column answers for its INSERT (${guarded.length} found)`,
  expect: 'all answered',
  outcome: unanswered.length
    ? `UNANSWERED: ${unanswered.map((g) => g.column).join(', ')}`
    : `${byTrigger.length} by trigger, ${bySentence.length} by declaration`,
  // Coverage asserted, not assumed: zero guards found means the reader broke, not that the
  // schema got simpler (BUG-003/019).
  pass: guarded.length > 0 && unanswered.length === 0,
});


cleanup();

for (const g of byTrigger) {
  console.log(`  guarded both ways:  ${g.column.padEnd(28)} UPDATE by ${g.name}, INSERT by a trigger on ${g.table}`);
}
for (const g of bySentence) {
  console.log(`  UPDATE-only, and correct:  ${g.column}`);
  console.log(`                             ${INSERT_IS_LEGITIMATE[g.column]}`);
}
console.log('');

const width = Math.max(...results.map((r) => r.description.length));
for (const r of results) {
  const mark = r.pass ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${r.id.padEnd(6)} ${r.description.padEnd(width)}  expected ${r.expect}, got ${r.outcome}`);
  if (r.message && r.pass) console.log(`             -> ${r.message}`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.error('GATE VERIFICATION FAILED');
  process.exit(1);
}
console.log('Gate verified: no path to approved except the sign-off endpoint.');
