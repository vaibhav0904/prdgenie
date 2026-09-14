// Storage access. node:sqlite only — zero npm dependencies (ADR 0009).
//
// This module is the single writer (ADR 0002). n8n reaches storage over HTTP; nothing
// else opens this file for writing.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const DB_PATH = resolve(process.env.DB_PATH ?? './data/prdgenie.db');
export const SCHEMA_PATH = resolve(here, 'schema.sql');

let db = null;

export function open() {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

// Idempotent by construction: schema.sql is written entirely with IF NOT EXISTS and
// ON CONFLICT DO NOTHING, so re-running it never drops or empties anything (TC1).
export function initSchema() {
  const d = open();
  d.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  migrate(d);
  return schemaVersion();
}

/**
 * Columns added after a database already existed.
 *
 * `CREATE TABLE IF NOT EXISTS` does nothing to a table that is already there, so a new column
 * in schema.sql reaches a fresh database and never an existing one — and the difference shows
 * up as a query failing on one machine and not another. Each step here is idempotent and
 * checked against PRAGMA rather than against a version number, because a version number is a
 * claim about what ran and PRAGMA is the fact.
 */
function migrate(d) {
  const columns = (table) => d.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

  if (!columns('requirements').includes('subject')) {
    // BUG-027. Existing rows get NULL, which is the truth: the field was emitted and thrown
    // away, so nothing knows what their subjects were.
    d.exec('ALTER TABLE requirements ADD COLUMN subject TEXT');
  }

  if (!columns('dead_letters').includes('resolution_note')) {
    // E7-S3. Resolving a queue entry never erases why it was there: the reason and the
    // envelope stay, and the row GAINS a note and a timestamp. An operator who marks
    // something resolved is adding to the record, not closing it.
    d.exec('ALTER TABLE dead_letters ADD COLUMN resolution_note TEXT');
  }
  if (!columns('dead_letters').includes('doc_id')) {
    // Nullable on purpose: a workflow can die before it knows which document it was for,
    // and refusing the row to protect a column would lose the failure to keep a field tidy.
    d.exec('ALTER TABLE dead_letters ADD COLUMN doc_id TEXT');
  }

  // E7-S5. Two columns the sweep table gained after it existed: what the provider actually
  // said, and a note marking a sweep that a DRILL caused rather than the judge — a stand-in's
  // score must never be readable as an opinion anybody held.
  for (const col of ['skipped_detail', 'note', 'shortfalls']) {
    if (!columns('judge_sweeps').includes(col)) d.exec(`ALTER TABLE judge_sweeps ADD COLUMN ${col} TEXT`);
  }

  // E7-S6. The sample table and the stratum column arrived after the sweep did. Rows judged
  // before the stratifier existed keep NULL: they were a uniform draw, and back-filling them
  // with 'uniform' would be writing a fact we did not record.
  const JUDGE_SAMPLE_DDL = `CREATE TABLE judge_sample (
    sample_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    sweep_id   INTEGER NOT NULL REFERENCES judge_sweeps(sweep_id) ON DELETE CASCADE,
    item_type  TEXT NOT NULL,
    item_id    TEXT NOT NULL,
    stratum    TEXT NOT NULL,
    UNIQUE (sweep_id, item_type, item_id))`;
  const sampleDdl = d.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='judge_sample'").get()?.sql;
  if (!sampleDdl) {
    d.exec(JUDGE_SAMPLE_DDL);
  } else if (!/ON DELETE CASCADE/.test(sampleDdl)) {
    // The first cut of this table referenced judge_sweeps without CASCADE, so deleting a
    // sweep failed instead of taking its sample with it. Rebuilt by copy rather than by
    // drop — the rows are a record of what was drawn, not a cache. A row whose sweep is
    // already gone cannot come across, and that is the correct outcome for it.
    d.exec('ALTER TABLE judge_sample RENAME TO judge_sample_old');
    d.exec(JUDGE_SAMPLE_DDL);
    d.exec(`INSERT INTO judge_sample (sweep_id, item_type, item_id, stratum)
            SELECT sweep_id, item_type, item_id, stratum FROM judge_sample_old
             WHERE sweep_id IN (SELECT sweep_id FROM judge_sweeps)`);
    d.exec('DROP TABLE judge_sample_old');
  }

  // judge_scores predates the sweep that produces them: a score with no sweep cannot say how
  // its item was drawn, and "sampled at random" is a claim about the draw. Existing rows get
  // NULL, which is the truth about them.
  for (const [col, type] of [['sweep_id', 'INTEGER'], ['verdict', 'TEXT'],
    ['doc_id', 'TEXT'], ['grounded_at_judge_time', 'INTEGER'], ['stratum', 'TEXT']]) {
    if (!columns('judge_scores').includes(col)) {
      d.exec(`ALTER TABLE judge_scores ADD COLUMN ${col} ${type}`);
    }
  }

  // E6-S2. Identity across versions. Existing rows are each the first of their own line, so
  // they backfill to their own req_id — NULL would say "unknown", and it is known.
  if (!columns('requirements').includes('origin_req_id')) {
    d.exec('ALTER TABLE requirements ADD COLUMN origin_req_id TEXT');
    d.exec('UPDATE requirements SET origin_req_id = req_id WHERE origin_req_id IS NULL');
  }

  // E6-S3 / BUG-062. Two things `prd_changes` was missing, and one of them was a crash.
  //
  // A CHECK constraint cannot be altered in place, so the table is rebuilt — the `judge_sample`
  // rebuild above is the pattern, and for the same reason: these rows are a RECORD of what a
  // delta decided, not a cache that can be regenerated. They are copied across, and their
  // `doc_id` stays NULL because nothing recorded it at the time, which is the truth about them.
  const changesDdl = d.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='prd_changes'").get()?.sql;
  if (changesDdl && !/'removed'/.test(changesDdl)) {
    d.exec('ALTER TABLE prd_changes RENAME TO prd_changes_old');
    d.exec(`CREATE TABLE prd_changes (
      change_id      INTEGER PRIMARY KEY AUTOINCREMENT,
      prd_version_id INTEGER NOT NULL REFERENCES prd_versions(prd_version_id),
      kind           TEXT NOT NULL CHECK (kind IN ('added','modified','contradicted','removed','new_open_question')),
      req_id         TEXT,
      old_text       TEXT,
      new_text       TEXT,
      citations      TEXT NOT NULL DEFAULT '[]',
      doc_id         TEXT)`);
    d.exec(`INSERT INTO prd_changes (change_id, prd_version_id, kind, req_id, old_text, new_text, citations)
            SELECT change_id, prd_version_id, kind, req_id, old_text, new_text, citations
              FROM prd_changes_old`);
    d.exec('DROP TABLE prd_changes_old');
  } else if (changesDdl && !columns('prd_changes').includes('doc_id')) {
    d.exec('ALTER TABLE prd_changes ADD COLUMN doc_id TEXT');
  }

  if (!columns('source_documents').includes('authorship')) {
    // Existing rows become third_party, which is the honest default: nothing recorded who
    // wrote them, and assuming the PM did would weaken every claim retroactively.
    d.exec(`ALTER TABLE source_documents ADD COLUMN authorship TEXT NOT NULL
            DEFAULT 'third_party'`);
  }
}

export function schemaVersion() {
  const row = open().prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get();
  return row?.value ?? null;
}

export function all(sql, params = []) {
  return open().prepare(sql).all(...params);
}

export function get(sql, params = []) {
  return open().prepare(sql).get(...params);
}

export function run(sql, params = []) {
  return open().prepare(sql).run(...params);
}

export function tx(fn) {
  const d = open();
  d.exec('BEGIN');
  try {
    const out = fn(d);
    d.exec('COMMIT');
    return out;
  } catch (err) {
    try { d.exec('ROLLBACK'); } catch { /* the original error is the interesting one */ }
    throw err;
  }
}

/**
 * The ONLY path to state='approved' (ADR 0006, as amended).
 *
 * Writes a marker naming this exact version, performs the transition, and deletes the
 * marker — all in one transaction. The trigger authorizes an approval only when a marker
 * names the version being approved, so a marker that somehow outlived this call could
 * authorize nothing except a version that is already approved.
 *
 * Callers must have recomputed readiness server-side before calling this. The disabled
 * button in the UI is a courtesy; this function and the trigger are the gate.
 *
 * It also SUPERSEDES the PRD's other approved versions, in this same transaction (E6-S3).
 * Returns `{ changes, superseded, prd_id }`.
 */
export function signOff(prdVersionId) {
  return tx((d) => {
    d.prepare('INSERT OR REPLACE INTO signoff_marker (prd_version_id) VALUES (?)').run(prdVersionId);
    const res = d.prepare(
      "UPDATE prd_versions SET state='approved', approved_at=datetime('now') WHERE prd_version_id=? AND state='in_review'"
    ).run(prdVersionId);
    d.prepare('DELETE FROM signoff_marker WHERE prd_version_id=?').run(prdVersionId);
    if (res.changes !== 1) {
      throw new Error(`sign-off did not apply: version ${prdVersionId} was not in in_review`);
    }

    // THE SUPERSEDE IS PART OF THE APPROVAL, not a follow-up (E6-S3).
    //
    // Inside this transaction and nowhere else. A separate step is a step that can fail on its
    // own, and what it leaves behind is two approved versions of one PRD — the exact ambiguity
    // the version chain exists to remove. If this throws, the approval above rolls back with
    // it, and the PRD keeps exactly one current version: the old one.
    //
    // EVERY other approved version of the PRD, not just version N-1. In the normal case those
    // are the same row. They are not the same row on `PRD-forgesight`, which carries twenty
    // approvals from the era when a control signed off whatever versions it found (BUG-045) —
    // and the honest thing is for the rule to make the invariant TRUE when it next runs, rather
    // than for a migration to invent a chain that never happened. `verify-version-chain` prints
    // how many PRDs are still in that state.
    const prd = d.prepare('SELECT prd_id FROM prd_versions WHERE prd_version_id=?').get(prdVersionId);
    const superseded = d.prepare(
      `UPDATE prd_versions SET state='superseded'
        WHERE prd_id=? AND state='approved' AND prd_version_id<>?`
    ).run(prd.prd_id, prdVersionId);

    return { changes: res.changes, superseded: Number(superseded.changes ?? 0), prd_id: prd.prd_id };
  });
}

// Telemetry is a parallel, continue-on-failure path: observability may fail, the product
// may not (docs/traceability.md). Proven by drill in E8-S4.
export function logEvent(traceId, name, component = null, detail = null) {
  try {
    run('INSERT INTO events (trace_id, name, component, detail) VALUES (?,?,?,?)',
      [traceId, name, component, detail]);
  } catch (err) {
    console.warn(`[telemetry] event write failed, continuing: ${err.message}`);
  }
}

export function close() {
  if (db) { db.close(); db = null; }
}
