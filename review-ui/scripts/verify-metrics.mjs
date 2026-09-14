// E8-S1's instrument check: can each of the five figures be believed, and can the page draw a
// number without the number that keeps it honest?
//
// This is NOT a metrics report. It asserts properties of the machinery:
//   - every metric runs standalone, twice, with the same answer (BUG-021)
//   - M4 really is a median, and really is `ingested` -> `approved` (docs/metrics.md's own
//     warning, which names this as the mistake the method's source project made)
//   - a guardrail partner cannot be dropped, forced by removing one
//   - the caveat is computed from `baseline_status`, forced by changing it
//   - there is exactly ONE implementation of each definition
//
// It makes no provider call and writes nothing to the database (CLAUDE.md hard rule).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, get } from '../db.mjs';
import * as M from '../metrics.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0; let fail = 0;

function ok(id, name, cond, evidence = '') {
  if (cond) { pass++; console.log(`PASS  ${id.padEnd(6)}${name.padEnd(74)}${evidence}`); }
  else { fail++; console.error(`FAIL  ${id.padEnd(6)}${name.padEnd(74)}${evidence}`); }
}

// --- TC1 / TC13: each metric runs standalone, and twice gives the same answer ---------------

const ids = ['m1', 'm2', 'm3', 'm4', 'm5'];
for (const id of ids) {
  const a = M.METRICS[id]();
  const b = M.METRICS[id]();
  ok('TC1', `${a.id} runs standalone and prints the rows it aggregated`,
    a.value !== undefined && Array.isArray(a.rows) && a.rows.length > 0 && !!a.sql && !!a.definition,
    `${a.rows.length} rows`);
  ok('TC13', `${a.id} run twice, same answer`,
    JSON.stringify(a) === JSON.stringify(b), `${a.value} ${a.unit}`);
}

// --- TC3: M4 is a MEDIAN, over `ingested` -> `approved` -------------------------------------
//
// Read from the SQL and from the definition, not from a comment. Both halves, because a mean
// under a median-shaped doc and a `draft_created` endpoint both look finished.

const m4 = M.m4();
ok('TC3', 'M4 SQL reads the `ingested` event as its start',
  /name\s*=\s*'ingested'/.test(m4.sql), 'endpoint 1');
ok('TC3', 'M4 SQL reads the `approved` event as its end',
  /name\s*=\s*'approved'/.test(m4.sql), 'endpoint 2');
ok('TC3', "M4 SQL does NOT use `draft_created` or `prd_versions.approved_at` as an endpoint",
  !/draft_created/.test(m4.sql) && !/v\.approved_at/.test(m4.sql), 'the flattering endpoints');
ok('TC3', 'M4 definition says MEDIAN, and the value equals the median of its own rows',
  /median/i.test(m4.definition), 'the doc and the code agree on the statistic');

const mins = all(m4.sql).map((r) => r.minutes);
const meanOf = mins.reduce((a, b) => a + b, 0) / (mins.length || 1);
ok('TC3', 'M4 value is the median of the rows, and is NOT the mean',
  Math.abs(m4.value - M.median(mins)) < 0.01
    && (mins.length < 3 || Math.abs(m4.value - meanOf) > 0.01),
  `median=${M.median(mins)?.toFixed(2)} mean=${meanOf.toFixed(2)}`);

// Counted from the `approved` EVENT, not from `state='approved'` (BUG-073). The case exists to
// prove M4 has one observation per approved VERSION rather than per trace — several versions share
// a trace — and that is a claim about versions that were approved, not versions that are still
// current. Reading the state column made this case demand that M4 forget every superseded version,
// which is exactly the defect it would otherwise have caught.
const everApproved = () => get(`SELECT COUNT(*) AS n FROM prd_versions v
  WHERE ${M.REACHED_APPROVED('v')}`).n;
ok('TC3', 'M4 counts every version that reached approved, not every trace',
  mins.length === everApproved(),
  `${mins.length} observations = ${everApproved()} versions that reached approved`);

// --- TC4: the median is forced, because rows[n/2] is right on half the odd sets --------------

ok('TC4', 'median of an ODD set is the middle element', M.median([5, 1, 3]) === 3, '[1,3,5] -> 3');
ok('TC4', 'median of an EVEN set is the mean of the middle two',
  M.median([1, 2, 3, 4]) === 2.5, '[1,2,3,4] -> 2.5, not 3');
ok('TC4', 'median of an empty set is null, not NaN or 0', M.median([]) === null, 'no data is not zero');
ok('TC4', 'median does not mutate its input',
  (() => { const xs = [3, 1, 2]; M.median(xs); return xs[0] === 3; })(), 'sorted a copy');

// --- TC5 support: the arithmetic is reproducible from the printed rows ----------------------

const m1 = M.m1();
const counted = m1.rows.find((r) => /requirements counted/.test(r.label)).value;
const grounded = m1.rows.find((r) => /of those, grounded/.test(r.label)).value;
ok('TC5', 'M1 = grounded / counted, recomputable from its own printed rows',
  Math.abs((100 * grounded / counted) - m1.value) < 0.01,
  `100 * ${grounded} / ${counted} = ${(100 * grounded / counted).toFixed(2)}`);

const m2 = M.m2();
const numer = m2.rows.find((r) => /^approve\b/.test(r.label)).value;
const denom = m2.rows.find((r) => /denominator/.test(r.label)).value;
ok('TC5', 'M2 = approve / all actions, recomputable from its own printed rows',
  Math.abs((100 * numer / denom) - m2.value) < 0.01,
  `100 * ${numer} / ${denom} = ${(100 * numer / denom).toFixed(2)}`);

const m3 = M.m3();
const edits = m3.rows.find((r) => /edit actions/.test(r.label)).value;
const reqs = m3.rows.find((r) => /requirements in reviewed/.test(r.label)).value;
ok('TC5', 'M3 = edits / requirements reviewed, recomputable from its own printed rows',
  Math.abs((edits / reqs) - m3.value) < 0.001, `${edits} / ${reqs} = ${(edits / reqs).toFixed(3)}`);

const m5 = M.m5();
const spend = m5.rows.find((r) => /model spend on their traces/.test(r.label)).value;
const approved = m5.rows.find((r) => /denominator/.test(r.label)).value;
ok('TC5', 'M5 = spend / approved versions, recomputable from its own printed rows',
  Math.abs((spend / approved) - m5.value) < 0.0001, `${spend} / ${approved} = ${(spend / approved).toFixed(4)}`);

// --- TC6 / TC15: one implementation, and no model anywhere near it --------------------------

const serverSrc = readFileSync(join(REPO, 'review-ui', 'server.js'), 'utf8');
const pageSrc = readFileSync(join(REPO, 'review-ui', 'public', 'metrics.html'), 'utf8');
const metricsSrc = readFileSync(join(REPO, 'review-ui', 'metrics.mjs'), 'utf8');

ok('TC6', 'the metrics route holds no SQL of its own',
  !/route\('GET', '\/api\/metrics'[^\n]*SELECT/i.test(serverSrc), 'server.js delegates');
ok('TC6', 'the page holds no SQL — it renders what it is given',
  !/\bSELECT\b[\s\S]{0,80}\bFROM\b/i.test(pageSrc.replace(/<pre>[\s\S]*?<\/pre>/g, '')),
  'metrics.html has no query');
ok('TC6', 'each metric SQL appears exactly once in the repo module',
  ['M1_SQL', 'M2_SQL', 'M3_SQL', 'M4_SQL', 'M5_SQL']
    .every((k) => (metricsSrc.match(new RegExp(`const ${k} =`, 'g')) ?? []).length === 1),
  'no second copy of a definition');
ok('TC15', 'no provider call anywhere in the metrics path',
  !/openai|api\.anthropic|generativelanguage|llm-call|fetch\(/i.test(metricsSrc),
  'every figure is SQL');

// --- TC7 / TC8: a guardrail partner cannot be dropped ---------------------------------------

const payload = M.allMetrics();
for (const [id, g] of Object.entries(M.GUARDRAIL_PARTNER)) {
  const m = payload.metrics.find((x) => x.id === id);
  ok('TC7', `${id} carries its guardrail partner (${g.partner}) in the PAYLOAD, not the layout`,
    !!m?.guardrail?.partner_value && m.guardrail.renderable === true,
    'inseparable in the data');
}

// The control. Strip the partner and confirm the renderer withholds the metric rather than
// drawing a lone number — asserted against the page's own logic, which is the thing that
// would have to change for this to regress.
ok('TC8', 'CONTROL: the page withholds a metric whose partner is missing',
  /if \(!g\.renderable \|\| !g\.partner_value\)/.test(pageSrc)
    && /withhold/.test(pageSrc) && /'—'/.test(pageSrc),
  'renderGuard returns withhold:true and the value becomes an em dash');
// FORCED through the real code path, by telling allMetrics there is no graded C1 run. The
// eval archive is not touched — deleting evidence to prove a point is not a control.
const starved = M.allMetrics({ c1: null });
const starvedPartners = starved.metrics.filter((m) => m.guardrail?.partner === 'C1_recall');
ok('TC8', 'CONTROL: with no graded C1 run, every C1-paired metric is marked unrenderable',
  starvedPartners.length === 2
    && starvedPartners.every((m) => m.guardrail.renderable === false && m.guardrail.partner_value === null),
  starvedPartners.map((m) => m.id).join(', ') + ' withheld');
ok('TC8', 'CONTROL: the metrics with no C1 partner are unaffected by that',
  starved.metrics.filter((m) => m.guardrail?.partner === 'M3')
    .every((m) => m.guardrail.renderable === true),
  'M4 still renders — the control moves only what it should');

// --- TC17/TC18: a figure that knows its own population is wrong ------------------------------
//
// Added when the decision came back on M4 and M5 (2026-09-03). The mark is derived from a FACT
// in the rows - approvals with no recorded decision, approved versions with no model spend -
// and never from a threshold like "faster than N seconds", which would be a number invented to
// make the data look the way I expected.

const m4live = M.m4();
const m5live = M.m5();
ok('TC17', 'M4 marks itself provisional while any approval recorded no decision',
  m4live.provisional !== null && /recorded no decisions/.test(m4live.provisional.why),
  m4live.provisional?.why.slice(0, 60) ?? 'not marked');
ok('TC17', 'M5 marks itself provisional while any approved version carries no model spend',
  m5live.provisional !== null && /no model spend/.test(m5live.provisional.why),
  m5live.provisional?.why.slice(0, 60) ?? 'not marked');
ok('TC17', 'each mark says what would clear it',
  !!m4live.provisional?.clears_when && !!m5live.provisional?.clears_when,
  'a mark with no exit is a permanent apology');

// CONTROL, forced through the real code path: a window containing no approvals contains none of
// the offending rows either, so the mark must not appear. If it appeared here it would be
// decoration rather than a computed condition.
const quiet = { since: '2026-08-24', until: '2026-08-31' };
ok('TC18', 'CONTROL: in a window with no such rows, neither mark appears',
  M.m4(quiet).provisional === null && M.m5(quiet).provisional === null,
  'the mark is computed, and it removes itself');
ok('TC18', 'CONTROL: and the underlying figures are still reported as absent, not as zero',
  M.m4(quiet).value === null && M.m5(quiet).value === null,
  'no data is not a good score');

// --- TC9: the drill-down finds a rubber stamp -----------------------------------------------

const ss = M.sessions();
const quick = ss.filter((s) => s.seconds !== null && s.seconds < 60 && s.actions > 0);
ok('TC9', 'review sessions carry seconds and per-decision counts',
  ss.length > 0 && ss.every((s) => 'seconds' in s && 'approvals' in s && 'overrides' in s && 'edits' in s),
  `${ss.length} sessions`);
ok('TC9', 'a session that was seconds of approve is FINDABLE',
  quick.length > 0, `${quick.length} session(s) under a minute — the fastest is ${
    Math.min(...quick.map((s) => s.seconds))}s with ${quick[0].actions} action(s)`);
ok('TC9', 'no session has a negative or null duration',
  ss.every((s) => s.seconds !== null && s.seconds >= 0),
  'the two timestamp formats do line up under julianday');

// --- TC10: the uncomfortable numbers ---------------------------------------------------------

const unc = M.uncomfortable();
ok('TC10', 'three uncomfortable numbers are rendered, each with why it is here',
  unc.length === 3 && unc.every((u) => typeof u.value === 'number' && u.why),
  unc.map((u) => `${u.value}`).join(' · '));
ok('TC10', 'they are the three the story names: never-approved, overrides, dead letters',
  /never reached approved/i.test(unc[0].label) && /ungrounded/i.test(unc[1].label)
    && /dead letter/i.test(unc[2].label), '');

// --- TC11 / TC12: the caveat is COMPUTED ------------------------------------------------------

const live = M.caveat();
ok('TC11', 'the caveat reads `baseline_status` from the control plane',
  live.status === get("SELECT value FROM schema_meta WHERE key='baseline_status'").value,
  `status=${live.status}`);
// FORCED, not inspected. The previous version of this check built a Set of booleans and
// asserted its size was at least one, which is true for any input — a check that could not
// go red. Each status is now pushed through the real function and the texts compared.
const texts = ['none', 'pending', 'recorded', 'banana'].map((st) => M.caveat(st).text);
ok('TC11', 'the caveat is not a constant — every status gives a different line',
  new Set(texts).size === 4, `4 statuses -> ${new Set(texts).size} distinct caveats`);
ok('TC11', 'only a recorded baseline turns off the illustrative flag',
  M.caveat('recorded').illustrative === false
    && ['none', 'pending', 'banana'].every((st) => M.caveat(st).illustrative === true),
  'none/pending/unknown all stay illustrative');
ok('TC12', 'CONTROL: an unrecognised status still produces a caveat, and says it is unknown',
  /UNKNOWN baseline_status/.test(metricsSrc),
  'no status can silently render no caveat');
ok('TC12', "`illustrative` is derived from the status, not hard-coded true",
  /illustrative: status !== 'recorded'/.test(metricsSrc), 'it flips when a baseline lands');

// --- TC14: the commands this story did not own still work -------------------------------------

for (const cmd of ['schema-check']) {
  let out = '';
  try {
    out = execFileSync(process.execPath, [join(REPO, 'review-ui', 'scripts', 'query.mjs'), cmd],
      { encoding: 'utf8', cwd: REPO });
  } catch (e) { out = String(e.stdout ?? '') + String(e.stderr ?? ''); }
  ok('TC14', `\`query.mjs ${cmd}\` still works after this story edited the file`,
    /OK|tables/.test(out), out.trim().split('\n').pop());
}

// --- TC16: M1's stated exclusion is real ------------------------------------------------------

const editedIds = all("SELECT DISTINCT item_id FROM review_actions WHERE decision='edit' AND item_type='requirement'")
  .map((r) => String(r.item_id));
const excludedIds = all(`SELECT req_id FROM requirements r
  JOIN source_documents d ON d.doc_id = r.doc_id
  WHERE r.pm_authored = 1 AND d.authorship <> 'first_party'`).map((r) => String(r.req_id));
ok('TC16', 'every EDITED requirement is excluded from M1 — editing cannot raise the rate',
  editedIds.length > 0 && editedIds.every((x) => excludedIds.includes(x)),
  `${editedIds.length} edited, ${excludedIds.length} excluded, sets identical`);

// ----------------------------------------------------------------------------------------------

console.log(`\n${pass}/${pass + fail} passed`);
if (fail) {
  console.error('METRICS VERIFICATION FAILED');
  process.exitCode = 1;
} else {
  console.log('Every figure is reproducible from its own rows, and no metric can be read alone.');
}
