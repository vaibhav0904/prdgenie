// Creates or updates the schema. Safe to re-run: schema.sql is idempotent (TC1).
import { initSchema, DB_PATH, all } from '../db.mjs';

const before = tableCount();
const version = initSchema();
const after = tableCount();

console.log(`schema version ${version} at ${DB_PATH}`);
console.log(before === 0
  ? `created ${after} tables`
  : `schema already present (${after} tables) — nothing dropped, nothing emptied`);

function tableCount() {
  try {
    return all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").length;
  } catch {
    return 0;
  }
}
