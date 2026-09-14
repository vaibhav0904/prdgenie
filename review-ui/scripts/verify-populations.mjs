// Does every published figure arrive with its denominator, and is the split derived?
//
// BUG-065: four of the five metrics divided by "approved PRDVersions", and 73 of the 107
// approved versions in this database were minted by a verifier and signed off a second later.
// Every figure was correctly computed and most of them were about the test suite. M4's median
// read 0.02 minutes — 1.2 seconds to approval, which no human has ever done.
//
// The fix reports two populations. This check is what stops that being a sentence in a commit
// message. It asserts the SHAPE of the report, not the values: a check that pinned 3.83 minutes
// would go red the next time someone approves a PRD, which is the check crying wolf about the
// system working.
//
//   TC1  every metric publishes exactly two populations, both labelled, both with a denominator
//   TC2  the `all` figure is UNCHANGED by the split — a restatement that moves the number is a
//        correction wearing a restatement's clothes
//   TC3  the pipeline population is a strict SUBSET: its denominator never exceeds `all`'s
//   TC4  the predicate is DERIVED, not a naming convention — no product-id literal, no LIKE
//   TC5  membership recomputed INDEPENDENTLY of the metric SQL agrees version for version
//   TC6  the split is non-trivial, and says so out loud if it ever becomes trivial
//   TC7  docs/metrics.md publishes the same predicate the code uses
//
// Usage:  .\run.cmd review-ui\scripts\verify-populations.mjs

import { readFileSync } from 'node:fs';
import { METRICS, populations, populationSplit, PIPELINE } from '../metrics.mjs';
import { all, get } from '../db.mjs';

const rows = [];
const check = (id, what, pass, detail) => {
  rows.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${what}`);
  if (detail) console.log(`           ${String(detail).split('\n').join('\n           ')}`);
};

// DERIVED, NOT TYPED: the list of metrics comes from the module, so a sixth metric is checked
// the day it is added rather than the day someone remembers to add it here.
const ids = Object.keys(METRICS);

// --- TC4, FIRST, and without touching the database ---------------------------------------------
// A product-id prefix would have been the easy split and it is a naming convention, which is a
// thing a future fixture joins by accident. The predicate has to be about what HAPPENED.
//
// THIS CASE RUNS BEFORE ANY SQL, on purpose. It used to run last, reading the SQL off the
// executed reports — so a plant that named a column the database does not have crashed the whole
// checker with a stack trace, and the one case whose entire job is to catch a bad predicate never
// got to speak. A check that dies while diagnosing is a check that reports nothing (BUG-062's
// lesson, in a new place).
{
  const src = readFileSync(new URL('../metrics.mjs', import.meta.url), 'utf8');
  const spellings = Object.values(PIPELINE).map((f) => f('v')).join('\n');
  const smells = [
    [/forgesight/i, 'a product-id literal'],
    [/product_id\s+(NOT\s+)?LIKE/i, 'a LIKE on product_id'],
    [/prd_id\s+(NOT\s+)?LIKE/i, 'a LIKE on prd_id'],
    [/(verify|control)-%/i, 'a wildcard over verifier names'],
    [/prd_version_id\s+(NOT\s+)?IN\s*\(\s*'/i, 'a hand-listed set of version ids'],
  ].filter(([re]) => re.test(spellings) || re.test(src.slice(src.indexOf('export const PIPELINE'), src.indexOf('export const POPULATIONS'))));
  check('TC4', 'the split is derived from what happened, not from what things are named',
    smells.length === 0,
    smells.length ? smells.map(([, why]) => `found ${why} in the population predicate`).join('\n')
      : 'the only predicate is the existence of a provider call on the trace');
}

// Everything below needs the SQL to run. A failure here is reported as a failed case with the
// database's own message, never as an uncaught throw.
let reports = [];
let sqlError = null;
try {
  reports = Object.values(METRICS).map((f) => populations(f, undefined));
} catch (err) {
  sqlError = err.message;
}
if (sqlError) {
  check('TC1', 'all metrics publish two named populations, each with a denominator', false,
    `the metric SQL did not execute: ${sqlError}\nEvery case below depends on it and is not run.`);
  console.log('');
  console.log(`${rows.filter((r) => r.pass).length}/${rows.length} checks passed.`);
  process.exit(1);
}

// --- TC1 --------------------------------------------------------------------------------------
{
  const bad = reports.filter((m) => {
    const p = m.populations;
    if (!Array.isArray(p) || p.length !== 2) return true;
    if (p[0].scope !== 'all' || p[1].scope !== 'pipeline') return true;
    return p.some((x) => !x.label || x.n === null || x.n === undefined);
  });
  check('TC1', `all ${ids.length} metrics publish two named populations, each with a denominator`,
    bad.length === 0 && reports.length === ids.length,
    bad.length ? `missing or malformed: ${bad.map((m) => m.id).join(', ')}`
      : reports.map((m) => `${m.id}  ${m.populations.map((p) => `${p.scope}=${p.value} (n=${p.n})`).join('   ')}`).join('\n'));
}

// --- TC2 --------------------------------------------------------------------------------------
// The figure that was already published must survive the fix untouched — the difference between
// adding a second reading and quietly replacing the first one.
//
// THE FIRST VERSION OF THIS CASE COULD NOT FAIL. It compared `f()` against
// `populations(f).populations[0]`, which is the same function called twice with the same scope:
// a plant that applied the predicate to BOTH populations moved both values together and the
// case stayed green. That is this repository's oldest failure mode wearing a new hat
// (BUG-001/012/018/021/038/051), and it was caught by asking what the control would have to
// break for the case to notice.
//
// So the assertion is STRUCTURAL, on the SQL that ships: the `all` population is computed by a
// query with no population predicate in it at all — byte for byte the query that was published
// before BUG-065 — and the `pipeline` population is computed by one that has it. Values are
// compared too, but the SQL is what makes the case falsifiable.
{
  const marker = /EXISTS\s*\(\s*SELECT 1 FROM (llm_calls|prd_versions pv|review_sessions rs)/;
  const offenders = reports.flatMap((m) => {
    const [whole, pipe] = m.populations;
    const out = [];
    // `NOT EXISTS (... llm_calls ...)` is M5's scaffolding COUNT, which predates BUG-065 and is
    // a printed row rather than a filter on the figure. Strip it before looking.
    const bare = whole.sql.replace(/NOT\s+EXISTS\s*\([^)]*llm_calls[^)]*\)/g, ' ');
    if (marker.test(bare)) out.push(`${m.id}: the \`all\` query carries a population predicate`);
    if (!marker.test(pipe.sql)) out.push(`${m.id}: the \`pipeline\` query carries none`);
    if (Object.is(whole.value, pipe.value) && whole.n !== pipe.n) {
      out.push(`${m.id}: two different populations produced the identical value ${whole.value}`);
    }
    return out;
  });
  check('TC2', 'the `all` figure is computed by exactly the query that published it before',
    offenders.length === 0,
    offenders.length ? offenders.join('\n')
      : `${ids.length} metrics: the predicate appears in the pipeline query and in neither \`all\` query`);
}

// --- TC3 --------------------------------------------------------------------------------------
{
  const bad = reports.filter((m) => m.populations[1].n > m.populations[0].n);
  check('TC3', 'the pipeline population is a subset — its denominator never exceeds `all`',
    bad.length === 0,
    bad.length ? bad.map((m) => `${m.id}: pipeline n=${m.populations[1].n} > all n=${m.populations[0].n}`).join('\n')
      : reports.map((m) => `${m.id}  ${m.populations[1].n} of ${m.populations[0].n}`).join('   '));
}

// --- TC5 --------------------------------------------------------------------------------------
// Recomputed WITHOUT the metric SQL: pull every approved version and every trace that has a
// provider call, and intersect them here, in JavaScript. If the two derivations disagree, the
// predicate is not saying what it claims to say.
{
  // REACHED approved, read from the events, not `state='approved'` (BUG-073). Approving a
  // version supersedes the rest, so the state column answers "is it current" and this case is
  // asking "did it ever get approved" — the same question the split itself asks.
  const approved = all(`SELECT prd_version_id, trace_id FROM prd_versions v
    WHERE EXISTS (SELECT 1 FROM events e
      WHERE e.name='approved' AND e.detail = 'prd_version_id=' || v.prd_version_id)`);
  const withCalls = new Set(all('SELECT DISTINCT trace_id FROM llm_calls').map((r) => r.trace_id));
  const independent = approved.filter((v) => withCalls.has(v.trace_id)).length;
  const viaSql = populationSplit().produced_by_pipeline;
  check('TC5', 'membership recomputed independently of the metric SQL agrees',
    independent === viaSql,
    `independent count ${independent}, metric SQL ${viaSql}, over ${approved.length} approved versions`);
}

// --- TC6 --------------------------------------------------------------------------------------
// A split where both halves are the same population proves nothing and must not read as clean
// (BUG-003/019: print the figure the case cannot fail on).
{
  const s = populationSplit();
  const trivial = s.minted_by_verifiers === 0 || s.produced_by_pipeline === 0;
  check('TC6', 'the split actually splits something — and the figure is printed either way',
    !trivial,
    trivial
      ? `TRIVIAL: ${s.produced_by_pipeline} produced, ${s.minted_by_verifiers} minted. One side is\n`
        + 'empty, so the two figures are the same figure and this check proved nothing.'
      : `${s.minted_by_verifiers} of ${s.approved_versions} approved versions (${s.pct_scaffolding}%) were minted by verifiers`);
}

// --- TC7 --------------------------------------------------------------------------------------
// The document and the code say the same thing, or the document is decoration.
{
  const doc = readFileSync('docs/metrics.md', 'utf8');
  const saysPredicate = /llm_calls/.test(doc) && /population/i.test(doc);
  const saysBoth = /across everything the database holds/.test(doc)
    && /across runs the pipeline actually produced/.test(doc);
  check('TC7', 'docs/metrics.md publishes the same two populations and the same predicate',
    saysPredicate && saysBoth,
    saysPredicate && saysBoth ? 'the doc names both populations and the llm_calls predicate'
      : `predicate documented: ${saysPredicate}; both labels documented: ${saysBoth}`);
}

const failed = rows.filter((r) => !r.pass).length;
console.log('');
console.log(`${rows.length - failed}/${rows.length} checks passed.`);
if (failed) {
  console.log('');
  console.log('A figure without its denominator is the one thing this project has spent eleven');
  console.log('epics refusing to publish. See BUG-065.');
}
process.exitCode = failed ? 1 : 0;
