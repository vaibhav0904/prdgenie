// The approval gate, refusing, on camera — with nothing installed.
//
// WHY THIS EXISTS (BUG-069). The deck's best moment is the database refusing an approval that
// goes around the entire application. Both the run sheet and the run-it-yourself README told the operator
// to do it in `sqlite3` — and **there is no sqlite3 on this machine, or in the n8n container**,
// because ADR 0009 says this project depends on nothing that has to be compiled and storage is
// `node:sqlite`. The instruction named a tool the project deliberately does not have.
//
// So the demonstration runs on `.\run.cmd`, like everything else. That is strictly better than
// the sqlite3 version: it works on a stranger's machine with nothing installed, it is one command
// instead of a REPL, and it proves the INSERT half too, which nobody was going to type by hand.
//
// IT GOES AROUND THE SERVICE ON PURPOSE. This opens the database file directly — not
// `/api/...`, not `signOff()`. The claim is that the gate holds against a caller with a
// connection and no manners, so the demonstration has to be that caller.
//
// NOTHING IS EVER WRITTEN. Every attempt runs inside a transaction that is rolled back whatever
// happens, so a run of this on a live demo database changes nothing even in the case where the
// trigger has been dropped — and that case is reported as a LOUD FAILURE rather than a mess.
//
// Usage:  .\run.cmd review-ui\scripts\prove-the-gate.mjs

import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const DB = resolve(process.env.DB_PATH ?? './data/prdgenie.db');
const db = new DatabaseSync(DB);

const line = (s = '') => console.log(s);
const rule = () => line('─'.repeat(74));

line();
rule();
line('  THE APPROVAL GATE — attempting to go around the application entirely');
rule();
line(`  database : ${DB}`);
line('  route    : the file, directly. No HTTP, no sign-off endpoint, no service.');
line();

// A real version that is NOT approved. Named from the rows, so this works on any database.
const target = db.prepare(
  `SELECT prd_version_id, prd_id, state FROM prd_versions
    WHERE state <> 'approved' ORDER BY prd_version_id DESC LIMIT 1`).get();

if (!target) {
  line('  No un-approved version exists to attempt this on. Ingest a document first:');
  line('      .\\run.cmd evals/harness/produce.mjs');
  process.exit(1);
}

const results = [];

/** Run one forbidden statement inside a transaction that is always rolled back. */
function attempt(what, sql, params) {
  line(`  ATTEMPT  ${what}`);
  line(`           ${sql.replace(/\s+/g, ' ').trim()}`);
  let refused = null;
  db.exec('BEGIN');
  try {
    db.prepare(sql).run(...params);
    refused = false;
  } catch (err) {
    refused = true;
    line('');
    line(`  REFUSED  ${err.message}`);
  } finally {
    // ALWAYS. If the trigger were gone, the write would have succeeded and this is what stops
    // a demonstration from becoming an incident.
    db.exec('ROLLBACK');
  }
  if (!refused) {
    line('');
    line('  *** IT WENT THROUGH. The trigger is missing or has been altered. ***');
    line('      The write was rolled back, so nothing changed — but the gate this project is');
    line('      built around is NOT THERE. Do not demo this. Do not ship this.');
  }
  line();
  results.push({ what, refused });
}

attempt(
  `UPDATE an existing version (v${target.prd_version_id}, currently '${target.state}') to approved`,
  "UPDATE prd_versions SET state='approved' WHERE prd_version_id=?",
  [target.prd_version_id]);

// The half nobody types by hand, and the one BUG-049 was about: a row must not be BORN approved.
const born = db.prepare('SELECT prd_id, trace_id, version_no, content FROM prd_versions WHERE prd_version_id=?')
  .get(target.prd_version_id);
attempt(
  'INSERT a brand-new version that is born approved',
  `INSERT INTO prd_versions (prd_id, version_no, state, trace_id, content)
   VALUES (?, ?, 'approved', ?, ?)`,
  [born.prd_id, 9999, born.trace_id, born.content]);

// And the row is untouched — a refusal that quietly half-applied would be worse than no gate.
const after = db.prepare('SELECT state FROM prd_versions WHERE prd_version_id=?')
  .get(target.prd_version_id);
const unchanged = after.state === target.state;

rule();
const held = results.every((r) => r.refused) && unchanged;
if (held) {
  line('  THE GATE HELD, BOTH WAYS.');
  line();
  line(`  v${target.prd_version_id} is still '${after.state}'. A PRDVersion cannot be updated`);
  line('  into `approved` and cannot be inserted already `approved`. There is no path to that');
  line('  state except a person clicking sign-off in the review UI — including for me.');
} else {
  line('  THE GATE DID NOT HOLD.');
  for (const r of results) line(`    ${r.refused ? 'refused ' : 'ALLOWED  '} ${r.what}`);
  if (!unchanged) line(`    and v${target.prd_version_id} changed: ${target.state} -> ${after.state}`);
}
rule();
line();
db.close();
process.exitCode = held ? 0 : 1;
