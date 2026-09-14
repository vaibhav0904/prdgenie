// E2-S4. What every model call leaves behind, checked against the rows rather than the intent.
//
// The claim is small and load-bearing: **there is no path to a model that does not write a
// row.** WF0 is the only workflow holding a provider credential, so this is structural rather
// than diligent — but the row still has to carry enough to be worth having, and every field
// in it is a field somebody will one day divide by.
//
// THE FIELD LIST IS DERIVED from the table, so a thirteenth column is inside this check the
// moment it exists, and a column that stops being filled goes red by itself (BUG-003/019/032).
// A field that is legitimately empty is DECLARED here with its reason, and the reason prints.
//
// Usage:  .\run.cmd review-ui/scripts/verify-cost-telemetry.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { all, get } from '../db.mjs';

let checks = 0; let failures = 0;
const say = (id, pass, msg, detail = '') => {
  checks++;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(7)} ${msg}${detail ? `  — ${detail}` : ''}`);
};

// --- the fields, derived ------------------------------------------------------------------

const columns = all("SELECT name FROM pragma_table_info('llm_calls')").map((c) => c.name);

// Columns that may be NULL, each with the reason it earns that. Everything else must be
// filled on every row, and an undeclared empty column fails.
const MAY_BE_EMPTY = {
  call_id: 'the key; never null by construction',
  prompt_tokens: 'a call that never got an answer has no usage to report — the provider did '
    + 'not send one, and inventing a zero would put a real number beside a made-up one',
  completion_tokens: 'as prompt_tokens',
  outcome: 'rows written before E2-S2 added it; every row since carries ok or needs_review',
};

console.log('EVERY MODEL CALL LEAVES A ROW — checked from the rows\n');
console.log(`Columns (derived):  ${columns.length}  ${columns.join(', ')}\n`);

// The most recent REAL extraction run: a trace that reached the extractor.
const recent = get(`SELECT trace_id FROM llm_calls WHERE component = 'extractor'
                    ORDER BY call_id DESC LIMIT 1`);
const rows = recent ? all('SELECT * FROM llm_calls WHERE trace_id = ? ORDER BY call_id', [recent.trace_id]) : [];

say('TC1a', rows.length > 0, 'the newest run wrote model-call rows',
  `${rows.length} row(s) for trace ${recent?.trace_id?.slice(0, 8) ?? '(none)'}`);

const empty = [];
for (const r of rows) {
  for (const c of columns) {
    if (MAY_BE_EMPTY[c]) continue;
    if (r[c] === null || r[c] === undefined || r[c] === '') empty.push(`${c} (call ${r.call_id})`);
  }
}
say('TC1b', empty.length === 0, 'every field that is not declared empty is filled on every row',
  empty.length ? empty.join(', ') : `${columns.length - Object.keys(MAY_BE_EMPTY).length} required field(s)`);

for (const [col, why] of Object.entries(MAY_BE_EMPTY)) {
  if (!columns.includes(col)) {
    say('TC2a', false, `${col} is declared as nullable but no longer exists — delete the entry`);
  }
}
say('TC2b', Object.keys(MAY_BE_EMPTY).every((c) => columns.includes(c)),
  'and no declaration names a column that has gone', Object.keys(MAY_BE_EMPTY).join(', '));
for (const [col, why] of Object.entries(MAY_BE_EMPTY)) {
  console.log(`        may be empty: ${col.padEnd(19)} ${why.slice(0, 84)}`);
}
console.log('');

// --- tokens come from the provider ----------------------------------------------------------

const wf0 = readFileSync('n8n/workflows/WF0-llm-call.json', 'utf8');
say('TC3a', wf0.includes('usage?.prompt_tokens') && wf0.includes('usageMetadata?.promptTokenCount'),
  'token counts are read from each provider\'s own usage block, not estimated',
  'OpenAI usage.* and Gemini usageMetadata.*');

// A character estimate would look like a division by 4 near a token name. There is none, and
// this is the cheap way to keep it that way.
say('TC3b', !/token[^\n]{0,40}\/\s*4|\/\s*4[^\n]{0,20}token/i.test(wf0),
  'and nothing in WF0 divides a length by four to guess them');

// NOT-NULL, not non-zero. A stand-in provider reports zero tokens and that is ITS truth; what
// must never happen is the service dropping a count the provider did send. The newest run is
// often a drill, so a non-zero assertion here would fail for the wrong reason.
const ok = rows.filter((r) => r.outcome === 'ok');
say('TC3c', ok.every((r) => r.prompt_tokens !== null && r.completion_tokens !== null),
  'no successful call loses a token count the provider reported',
  `${ok.length} successful row(s) in the newest trace`);

const real = get("SELECT COUNT(*) AS n FROM llm_calls WHERE outcome='ok' AND prompt_tokens > 0").n;
const allOk = get("SELECT COUNT(*) AS n FROM llm_calls WHERE outcome='ok'").n;
say('TC3d', real > 0,
  'and the archive carries real provider counts, not a plumbing that only ever moves zeros',
  `${real} of ${allOk} successful calls report tokens above zero`);

// --- the price is local, and every row says so ------------------------------------------------

const estimated = rows.filter((r) => r.usage_source === 'estimated');
say('TC4a', estimated.length === rows.length,
  'every row is labelled `estimated` — the unit price is a local table, so a correction can '
  + 'sit beside these rows instead of overwriting them', `${estimated.length}/${rows.length}`);

// Every model the CURRENT workflow can call must have a price. A model with no entry silently
// costs zero, which is the most expensive kind of wrong number.
const server = readFileSync('review-ui/server.js', 'utf8');
const priced = [...server.matchAll(/'([\w.-]+)':\s*\{\s*input:/g)].map((m) => m[1]);
const shipped = [...wf0.matchAll(/(?:openai|gemini):\s*'([\w.-]+)'/g)].map((m) => m[1]);
const unpriced = shipped.filter((m) => !priced.includes(m));
say('TC4b', unpriced.length === 0,
  'every model the workflow can call has a unit price',
  unpriced.length ? `UNPRICED: ${unpriced.join(', ')}` : `${shipped.join(' + ')} priced`);

// Historical models are REPORTED, never failed on: they are what the archive contains, and a
// check that goes red forever on the past is a check somebody switches off.
const historical = all(`SELECT model, COUNT(*) n FROM llm_calls
   WHERE model NOT IN (${priced.map(() => '?').join(',')}) GROUP BY model`, priced);
if (historical.length) {
  console.log('\n        Models in the archive with no price entry — their rows read as $0:');
  for (const h of historical) console.log(`          ${h.model.padEnd(20)} ${h.n} row(s)`);
  console.log('        That is the record of what was tried, not a bug to fix. It matters only');
  console.log('        if one is quoted: a sum over these rows understates by exactly them.\n');
}

// --- prompt_version identifies the bytes ---------------------------------------------------------

const badVersion = rows.filter((r) => !/^[0-9a-f]{12}$/.test(String(r.prompt_version ?? '')));
say('TC5a', badVersion.length === 0,
  'every row names a prompt version, and it is a content hash of the file',
  badVersion.length ? `${badVersion.length} malformed` : rows[0]?.prompt_version);

// THE DEVIATION, stated: the card asks for a git short hash. A content hash is strictly
// stronger — it identifies the bytes whether or not they were ever committed, so an
// uncommitted edit cannot be attributed to the last commit's prompt.
const files = readdirSync('n8n/prompts').filter((f) => f.endsWith('.md'));
const hashes = Object.fromEntries(files.map((f) => [f.replace(/\.md$/, ''),
  createHash('sha256').update(readFileSync(`n8n/prompts/${f}`, 'utf8')).digest('hex').slice(0, 12)]));
const neverRun = Object.entries(hashes).filter(([, h]) =>
  !get('SELECT 1 AS x FROM llm_calls WHERE prompt_version = ? LIMIT 1', [h]));
say('TC5b', neverRun.length === 0,
  'every prompt that ships has actually run at its current hash — the archive describes what '
  + 'is deployed', neverRun.length ? `never run: ${neverRun.map(([n]) => n).join(', ')}` : `${files.length} prompt(s)`);

// --- the retry writes its own row -----------------------------------------------------------------

const attempts = all(`SELECT attempt, COUNT(*) n FROM llm_calls GROUP BY attempt ORDER BY attempt`);
const secondTries = attempts.find((a) => a.attempt === 2)?.n ?? 0;
say('TC6c', secondTries > 0,
  'second attempts exist in the archive at all — the attempt-2 rate can move',
  attempts.map((a) => `attempt ${a.attempt}: ${a.n}`).join(', '));

const total = attempts.reduce((s, a) => s + a.n, 0);
console.log(`\n        Attempt-2 rate: ${(100 * secondTries / total).toFixed(2)}% of ${total} calls`);
console.log('        (docs/traceability.md: this climbing means the model is returning');
console.log('        malformed JSON more often, before anything else says so.)\n');

// --- telemetry may fail; the product may not --------------------------------------------------------

const service = readFileSync('review-ui/server.js', 'utf8');
say('TC16', /catch \(err\) \{[\s\S]{0,200}telemetry\] llm_call write failed, continuing/.test(service),
  'a failed llm_calls write is logged and swallowed — drilled for real in E8-S4');

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exitCode = 1;
