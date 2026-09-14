// Read-only inspection, and the home of every metric's "computed by" query
// (docs/metrics.md). A metric that cannot be run by hand from here does not ship.
//
// Usage:
//   node review-ui/scripts/query.mjs schema-check
//   node review-ui/scripts/query.mjs sql "SELECT ..."
//   node review-ui/scripts/query.mjs trace <trace_id>
//   node review-ui/scripts/query.mjs m1|m2|m3|m4|m5      one metric, with its rows
//   node review-ui/scripts/query.mjs cycle-time          the name docs/metrics.md publishes for M4
//   node review-ui/scripts/query.mjs cost-per-prd        ...and for M5
//   node review-ui/scripts/query.mjs metrics             all five, plus the caveat
//
// Each metric prints the SQL it ran and the rows it aggregated, because a figure nobody can
// recompute by hand is a figure that has only ever been checked by the code that produced it,
// and hand-recomputation is E8-S1's gate.

import { all, get, open } from '../db.mjs';
import { METRICS, caveat, c1Recall, uncomfortable, sessions, GUARDRAIL_PARTNER } from '../metrics.mjs';

const [, , cmd, ...rest] = process.argv;

// Contract tables and the trace_id obligations from docs/contracts.md §5.
const REQUIRED_TABLES = [
  'schema_meta', 'products', 'source_documents', 'prds', 'prd_versions', 'signoff_marker',
  'requirements', 'citations', 'open_questions', 'epics', 'features', 'priority_factors',
  'stories', 'prd_changes', 'review_sessions', 'review_actions', 'events', 'llm_calls',
  'judge_scores', 'dead_letters',
];
const NEED_TRACE_ID = [
  'source_documents', 'requirements', 'prd_versions', 'events', 'llm_calls',
  'judge_scores', 'dead_letters',
];

const commands = {
  'schema-check': () => {
    const present = new Set(
      all("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.name)
    );
    const problems = [];

    for (const t of REQUIRED_TABLES) {
      if (!present.has(t)) problems.push(`missing table: ${t}`);
    }
    for (const t of NEED_TRACE_ID) {
      if (!present.has(t)) continue;
      const cols = all(`PRAGMA table_info(${t})`).map((c) => c.name);
      if (!cols.includes('trace_id')) problems.push(`missing trace_id on: ${t}`);
    }
    const triggers = new Set(
      all("SELECT name FROM sqlite_master WHERE type='trigger'").map((r) => r.name)
    );
    for (const t of ['prd_versions_state_machine', 'prd_versions_content_immutable',
      'source_documents_raw_text_immutable', 'review_actions_require_reason']) {
      if (!triggers.has(t)) problems.push(`missing trigger: ${t}`);
    }

    console.log(`${present.size} tables, ${triggers.size} triggers`);
    if (problems.length) {
      for (const p of problems) console.error(`  FAIL ${p}`);
      process.exitCode = 1;
    } else {
      console.log('schema-check OK — every contract table, trace_id column and trigger is present');
    }
  },

  sql: () => {
    const statement = rest.join(' ');
    if (!statement) { console.error('usage: query.mjs sql "<statement>"'); process.exitCode = 1; return; }
    const db = open();
    try {
      if (/^\s*select|^\s*pragma/i.test(statement)) {
        console.log(JSON.stringify(db.prepare(statement).all(), null, 2));
      } else {
        // Deliberately allowed: the UAT and TC3-TC8 need to attempt writes by hand and
        // watch the triggers refuse them. That refusal is the point.
        const res = db.prepare(statement).run();
        console.log(JSON.stringify(res));
      }
    } catch (err) {
      console.error(`REFUSED: ${err.message}`);
      process.exitCode = 1;
    }
  },

  // "What happened to this document, and was it any good?" in one query (contracts §5).
  trace: () => {
    const traceId = rest[0];
    if (!traceId) { console.error('usage: query.mjs trace <trace_id>'); process.exitCode = 1; return; }
    console.log(JSON.stringify({
      document: get('SELECT doc_id, doc_type, title, source_channel FROM source_documents WHERE trace_id=?', [traceId]),
      requirements: all('SELECT req_id, kind, grounded, statement FROM requirements WHERE trace_id=?', [traceId]),
      versions: all('SELECT prd_version_id, version_no, state, park_reason FROM prd_versions WHERE trace_id=?', [traceId]),
      events: all('SELECT name, component, ts FROM events WHERE trace_id=? ORDER BY event_id', [traceId]),
      llm_calls: all('SELECT component, model, cost_usd, latency_ms, attempt FROM llm_calls WHERE trace_id=?', [traceId]),
    }, null, 2));
  },
};


// --- metrics -------------------------------------------------------------------------------

const pad = (s, n) => String(s).padEnd(n);

/**
 * Prints one metric: the figure, the SQL, the rows, and — where the metric has a guardrail
 * partner — that partner, ALWAYS. docs/metrics.md is explicit that M2, M4 and M5 are
 * meaningless alone, so this printer refuses to print one without the other rather than
 * leaving it to whoever calls it.
 */
function printMetric(m, { c1 } = {}) {
  console.log(`\n${m.id}  ${m.name}`);
  console.log(`  = ${m.value === null ? 'no data' : m.value} ${m.unit}`);
  console.log(`\n  definition: ${m.definition}`);
  console.log(`\n  ${m.sql.split('\n').join('\n  ')}\n`);
  for (const r of m.rows) console.log(`    ${pad(r.label, 50)}${r.value}`);

  const g = GUARDRAIL_PARTNER[m.id];
  if (!g) return;
  console.log(`\n  GUARDRAIL — never read ${m.id} without this beside it:`);
  console.log(`    ${g.why}`);
  if (g.partner === 'C1_recall') {
    if (!c1) {
      console.error(`    UNAVAILABLE: no graded C1 run was found, so ${m.id} must not be quoted.`);
      process.exitCode = 1;
      return;
    }
    console.log(`    C1 (${c1.source}, verdict ${c1.verdict}):`);
    for (const f of c1.fixtures) {
      console.log(`      ${pad(f.fixture, 6)}recall ${pad(f.recall + '%', 9)}precision ${f.precision}%`);
    }
  } else {
    const partner = METRICS[g.partner.toLowerCase()]?.();
    console.log(`    ${partner.id} ${partner.name} = ${partner.value} ${partner.unit}`);
  }
}

for (const [key, fn] of Object.entries(METRICS)) {
  commands[key] = () => printMetric(fn(), { c1: c1Recall() });
}
// The names docs/metrics.md already publishes. The doc is the contract; it named these first.
commands['cycle-time'] = commands.m4;
commands['cost-per-prd'] = commands.m5;

commands.metrics = () => {
  const c = caveat();
  console.log(`BASELINE: ${c.status}`);
  console.log(c.text);
  const c1 = c1Recall();
  for (const fn of Object.values(METRICS)) printMetric(fn(), { c1 });
  console.log('\n\nThe uncomfortable ones:');
  for (const u of uncomfortable()) {
    console.log(`  ${pad(u.label, 46)}${u.value}`);
    console.log(`    ${u.why}`);
  }
  const ss = sessions();
  console.log(`\nReview sessions: ${ss.length}. Fastest first — a session that was seconds of`);
  console.log('approve is meant to be findable here.');
  const quick = [...ss].sort((a, b) => (a.seconds ?? 0) - (b.seconds ?? 0)).slice(0, 8);
  console.log(`    ${pad('session', 40)}${pad('secs', 7)}${pad('actions', 9)}${pad('appr', 6)}${pad('over', 6)}edits`);
  for (const r of quick) {
    console.log(`    ${pad(r.session_id, 40)}${pad(r.seconds ?? '?', 7)}${pad(r.actions, 9)}${pad(r.approvals, 6)}${pad(r.overrides, 6)}${r.edits}`);
  }
};

const fn = commands[cmd];
if (!fn) {
  console.error(`unknown command: ${cmd ?? '(none)'}`);
  console.error(`available: ${Object.keys(commands).join(', ')}`);
  process.exitCode = 1;
} else {
  fn();
}
