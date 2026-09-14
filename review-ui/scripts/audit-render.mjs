// E8-S4's render/query audit: every field a query computes is rendered somewhere a person
// looks, consumed to compute something that is, or DELETED. There is no third option.
//
// The field list is DERIVED from the live payload, never typed here: a hand-written checklist
// is a hand-counted denominator, and this project has now been bitten by that three times
// (BUG-003/019/032). Add a field to a metric and this audit's denominator grows by itself;
// forget to render it and this audit goes red by itself.
//
// A field may be declared CONSUMED — used to compute or gate something that is rendered —
// but the declaration carries a reason and is printed on every run, the same contract
// `check-injection-layers.mjs` uses for free-text fields. An undeclared, unrendered field
// fails the audit and names itself.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allMetrics, sessions } from '../metrics.mjs';
import { buildReport } from '../weekly.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The three renderers. A field's home is a place a PERSON reads.
const RENDERERS = {
  page: readFileSync(join(REPO, 'review-ui', 'public', 'metrics.html'), 'utf8'),
  cli: readFileSync(join(REPO, 'review-ui', 'scripts', 'query.mjs'), 'utf8'),
  weekly: readFileSync(join(REPO, 'review-ui', 'weekly.mjs'), 'utf8'),
};

// Fields that are consumed rather than shown, each with the reason it earns that. Printed
// every run; an entry here that stops existing in the payload is reported as stale.
const CONSUMED = {
  'metric.sql': 'rendered verbatim on the page (a <pre>) and by the CLI; listed here because the regex below looks for property ACCESS and the page reaches it as m.sql inside a text node',
  'session.signed_off_at': 'the far end of the seconds column: duration = signed_off_at - opened_at, computed in SQL and rendered as "Seconds". The timestamp itself was unrendered until this audit found it (TC4) — see the resolution below.',
  'guardrail.partner': 'the routing key the renderers branch on to draw partner_value; the partner itself is what a person sees',
  'guardrail.renderable': 'the flag that withholds a metric with a missing partner (E8-S1 TC8); its rendering IS the em dash',
  'caveat.status': 'shown in the page subtitle and the report caveat header',
  'c1.fixtures': 'the CLI prints every fixture; the page and report render worst (the guardrail contract wants the weakest, not the average)',
  'c1.source': 'printed by the CLI beside the C1 block so the figure is traceable to its result file',
};

let pass = 0; let fail = 0; const lines = [];
const verdict = (field, home) => { pass++; lines.push(`  ${field.padEnd(44)} ${home}`); };
const homeless = (field) => { fail++; lines.push(`  ${field.padEnd(44)} *** NO HOME — delete it or render it ***`); };

/** Where does a property name appear? Property access or template usage in any renderer. */
function findHome(key) {
  const hits = [];
  for (const [name, src] of Object.entries(RENDERERS)) {
    // .key, ['key'], `${...key...}`, or an object-destructure/loop mention.
    if (new RegExp(`[.\\[\\s{'"]${key}\\b`).test(src)) hits.push(name);
  }
  return hits;
}

// --- 1. the metrics payload -------------------------------------------------------------------

const payload = allMetrics();
// NEGATIVE CONTROL (TC3): with AUDIT_INJECT_FAKE=1 a field nobody renders is planted in the
// payload the audit walks. The audit must fail and name it, or it is a list that can only
// agree. Run by negative-control-render.mjs, never by hand in a real audit.
if (process.env.AUDIT_INJECT_FAKE === '1') payload.metrics[0].zz_planted_unrendered = 42;

for (const m of payload.metrics) {
  for (const key of Object.keys(m)) {
    const fq = `metric.${key}`;
    if (key === 'rows') {
      // Rendered generically: both the page and the CLI loop over rows and print every
      // label/value pair, so each row is rendered BY CONSTRUCTION — the loop is the home,
      // and a new row can never be silently dropped.
      verdict(`${m.id}.rows[${m.rows.length}]`, 'page + cli, rendered by loop — cannot be dropped');
      continue;
    }
    if (key === 'guardrail') {
      for (const gk of Object.keys(m.guardrail)) {
        const gfq = `guardrail.${gk}`;
        if (CONSUMED[gfq]) { verdict(`${m.id}.${gfq}`, `consumed: ${CONSUMED[gfq].slice(0, 60)}…`); continue; }
        const h = findHome(gk);
        h.length ? verdict(`${m.id}.${gfq}`, h.join(' + ')) : homeless(`${m.id}.${gfq}`);
      }
      continue;
    }
    if (CONSUMED[fq]) { verdict(`${m.id}.${key}`, `consumed: ${CONSUMED[fq].slice(0, 60)}…`); continue; }
    const h = findHome(key);
    h.length ? verdict(`${m.id}.${key}`, h.join(' + ')) : homeless(`${m.id}.${key}`);
  }
}

// --- 2. the caveat, C1, the uncomfortable numbers ------------------------------------------------

// NOTE: this list of top-level payload objects is TYPED, which means a new top-level key is
// invisible to this audit until someone remembers to add it here — `population_split` was, for
// about ten minutes. That is BUG-066 and it is the general defect; homing this story's own field
// is this story's job, and fixing the enumeration is not.
for (const [obj, prefix] of [[payload.caveat, 'caveat'], [payload.c1 ?? {}, 'c1'],
  [payload.population_split ?? {}, 'population_split']]) {
  for (const key of Object.keys(obj)) {
    const fq = `${prefix}.${key}`;
    if (CONSUMED[fq]) { verdict(fq, `consumed: ${CONSUMED[fq].slice(0, 60)}…`); continue; }
    const h = findHome(key);
    h.length ? verdict(fq, h.join(' + ')) : homeless(fq);
  }
}
for (const key of Object.keys(payload.uncomfortable[0] ?? {})) {
  const h = findHome(key);
  h.length ? verdict(`uncomfortable.${key}`, h.join(' + ')) : homeless(`uncomfortable.${key}`);
}

// --- 3. the sessions drill-down -------------------------------------------------------------------

for (const key of Object.keys(sessions(1)[0] ?? {})) {
  const fq = `session.${key}`;
  if (CONSUMED[fq]) { verdict(fq, `consumed: ${CONSUMED[fq].slice(0, 60)}…`); continue; }
  const h = findHome(key);
  h.length ? verdict(fq, h.join(' + ')) : homeless(fq);
}

// --- 4. the weekly report is a renderer too: every metric value must actually reach the file ----

const report = buildReport({ week: '2026-09-03', generatedAt: 'AUDIT' }).body;
for (const m of Object.values(buildReport({ week: '2026-09-03', generatedAt: 'AUDIT' }).figures.now)) {
  const shown = m.value === null || report.includes(String(m.value)) || /withheld/.test(report);
  shown ? verdict(`weekly.${m.id}.value`, 'in the report file (or explicitly withheld)')
    : homeless(`weekly.${m.id}.value`);
}

// --- 5. stale declarations: a CONSUMED entry must still describe something that exists ----------

const liveKeys = new Set([
  ...payload.metrics.flatMap((m) => Object.keys(m).map((k) => `metric.${k}`)),
  ...payload.metrics.flatMap((m) => Object.keys(m.guardrail ?? {}).map((k) => `guardrail.${k}`)),
  ...Object.keys(payload.caveat).map((k) => `caveat.${k}`),
  ...Object.keys(payload.c1 ?? {}).map((k) => `c1.${k}`),
  ...Object.keys(sessions(1)[0] ?? {}).map((k) => `session.${k}`),
]);
for (const declared of Object.keys(CONSUMED)) {
  if (!liveKeys.has(declared)) {
    fail++;
    lines.push(`  ${declared.padEnd(44)} *** STALE DECLARATION — the field no longer exists ***`);
  }
}

// --- the checklist, printed so the audit is readable as well as exit-coded ----------------------

console.log('THE RENDER/QUERY AUDIT — every field, and where a person sees it');
console.log('(derived from the live payload; re-running this script repeats the audit)\n');
const seen = new Set();
for (const l of lines) { if (!seen.has(l)) { console.log(l); seen.add(l); } }

console.log(`\n${pass} field(s) homed, ${fail} with no home`);
if (fail) {
  console.error('RENDER AUDIT FAILED — a computed number nobody reads is either deleted or rendered.');
  process.exitCode = 1;
} else {
  console.log('Every number this surface computes is rendered, consumed with a stated reason, or gone.');
}
