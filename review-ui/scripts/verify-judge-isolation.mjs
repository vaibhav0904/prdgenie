// E7-S5, the floor: JUDGE SCORES ARE ABSENT FROM EVERY GATE.
//
// "The judge gates nothing" is the kind of claim that is true on the day it is written and
// stops being true in the commit where reading one score is quicker than fixing something.
// So it is a check, and the file list it walks is DERIVED from the directories rather than
// typed here — a new case, a new metric or a new workflow is inside this check the moment it
// exists, and a hand-typed list is a hand-counted denominator (BUG-003/019/032).
//
// THREE KINDS OF REFERENCE, because the bluntest version of this check does not work: the
// verb "judge" is ordinary English and this codebase already uses it correctly everywhere
// ("the model may judge; code decides"). What is forbidden is not the word.
//
//   CONSUMING   the module, its functions, its HTTP surface. A file holding one of these is
//               reading a judge opinion. Forbidden outside the judge's own files.
//   THE TABLES  the two tables. Forbidden outside the judge's own files and the two places
//               that must know the schema exists — the migration and the contract table list.
//   THE FEATURE the workflow and the rubric, by name. Allowed only where an audit enumerates
//               everything and leaving this one out would make it the one nobody checked.
//
// Usage:  .\run.cmd review-ui/scripts/verify-judge-isolation.mjs

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Where gates are computed. Every file matching, minus the declarations below.
const SCANNED = [
  ['evals/harness', /\.mjs$/],
  ['evals/harness/cases', /\.mjs$/],
  ['review-ui', /\.(mjs|js)$/],
  ['review-ui/scripts', /\.mjs$/],
  ['review-ui/public', /\.(html|js)$/],
  ['n8n/workflows', /\.json$/],
  ['n8n/scripts', /\.mjs$/],
];

const CONSUMING = [
  "from './judge.mjs'", '/api/judge', 'sweepSummary', 'disagreementFor',
  'openSweep', 'recordScores', 'closeSweep', 'JUDGE_MODEL', 'rubricVersion',
];
const TABLES = ['judge_scores', 'judge_sweeps'];
const FEATURE = ['WF6', 'judge-item', 'judge-sweep'];

// THE JUDGE'S OWN FILES. Not exemptions from the rule — they are the thing the rule is
// about, and the rule is that nothing ELSE touches them.
const ITS_OWN = {
  'review-ui/judge.mjs': 'the sweep itself',
  'review-ui/scripts/verify-judge.mjs': 'its rules, forced',
  'review-ui/scripts/verify-strata.mjs': 'its sample, forced — the strata, the shortfalls, and the rule that stopped reading them',
  'review-ui/scripts/negative-control-strata.mjs': 'the control that proves the sampler\'s spine check can go red',
  'review-ui/scripts/verify-judge-isolation.mjs': 'this check',
  'review-ui/scripts/negative-control-judge.mjs': 'the control that proves this check can go red',
  'review-ui/scripts/judge-sweep.mjs': 'the command that runs a sweep',
  'review-ui/scripts/drill-judge-unavailable.mjs': 'the drill that takes Gemini away',
  'review-ui/public/judge.html': 'the page the scores are read on, and the only place they are rendered',
  'n8n/workflows/WF6-judge-sweep.json': 'the workflow',
};

// Files that may NAME the feature because they enumerate everything, and must still not
// CONSUME it. Each reason prints on every run: an audit that stopped naming it would be an
// audit that had stopped covering it, which is the failure this file is shaped around.
const MAY_NAME = {
  'n8n/scripts/sync-prompts.mjs':
    'the rubric is a prompt like any other and is synced by the same script — which is what '
    + 'makes a stored rubric_version a content hash rather than a claim',
  'n8n/scripts/check-injection-layers.mjs':
    'layers 1 and 2 are audited over EVERY model-call builder; leaving WF6 out would make it '
    + 'the one prompt whose fence nobody checked',
  'n8n/scripts/check-failure-routing.mjs':
    'the WF0-judge node is a declared exemption, and the declaration is the point of that file',
  'n8n/scripts/check-error-routing.mjs':
    'the workflow list is derived from the directory, so WF6 appears in its output',
  'n8n/scripts/check-spine.mjs':
    'as check-error-routing: the file list is derived, never chosen',
  'n8n/scripts/check-exclusive.mjs':
    'it lists every script that touches shared state, and one of them is this file — a filename in a coverage list is a name, not a read',
  'n8n/scripts/bind-provider-credential.mjs':
    'it binds BOTH provider credentials by id, including the judge\'s — it reads an id out of '
    + 'n8n and never a key, never a score',
  'n8n/scripts/import-workflows.mjs':
    'imports every workflow in the directory',
  'n8n/scripts/negative-control-injection-layers.mjs':
    'the control for the layer audit, over the same derived builder list',
};

// Files that may name the TABLES, because a schema is not an opinion. Neither reads a score.
const MAY_STORE = {
  'review-ui/db.mjs':
    'the migration that added the sweep columns — storage is not a gate, and a table that '
    + 'exists only on the machine it was invented on is BUG-013 waiting to happen',
  'review-ui/scripts/query.mjs':
    'the contract table list: `schema-check` asserts judge_scores EXISTS. It never selects '
    + 'from it, and the five metrics this same file prints are computed by metrics.mjs',
};

// In server.js the endpoints and every gate live in one file, so the claim is narrower and
// checked precisely: every judge reference sits inside the declared section or the import.
const SERVER = 'review-ui/server.js';
const SERVER_SECTION_START = '// --- WF6, the judge sweep';
const SERVER_SECTION_END = "// --- WF5, the owner's weekly report";
const SERVER_IMPORT = "} from './judge.mjs';";

// Coverage: the files this check would be worthless without. Derived scanning can silently
// stop finding things — a renamed directory, a changed extension — and a check that scanned
// nothing passes (BUG-003/019/032).
const MUST_COVER = [
  'evals/harness/grade.mjs', 'evals/harness/cases/C1.mjs', 'evals/harness/cases/C2.mjs',
  'evals/harness/cases/C6.mjs', 'evals/harness/match.mjs',
  'review-ui/metrics.mjs', 'review-ui/weekly.mjs', 'review-ui/assemble.mjs',
  'review-ui/grounding.mjs', 'review-ui/review.mjs',
  'n8n/workflows/WF2-generate-prd.json',
];

const files = [];
for (const [dir, pattern] of SCANNED) {
  if (!existsSync(dir)) continue;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !pattern.test(entry.name)) continue;
    files.push(join(dir, entry.name).split('\\').join('/'));
  }
}

const problems = [];
const gateFiles = [];
const declared = [];
const hits = (text, tokens) => tokens.filter((t) => text.includes(t));

// The plant seam for the negative control (TC15). A control that could only ever add a file
// nobody scans would prove nothing; this puts the reference in a file this check really reads.
const INJECT = process.env.JUDGE_ISOLATION_INJECT ?? '';

for (const file of [...new Set(files)].sort()) {
  if (ITS_OWN[file]) continue;
  let text = readFileSync(file, 'utf8');
  if (INJECT && file === INJECT) text += '\nconst planted = judge_scores;\n';

  if (file === SERVER) {
    const lines = text.split('\n');
    const from = lines.findIndex((l) => l.startsWith(SERVER_SECTION_START));
    const to = lines.findIndex((l) => l.startsWith(SERVER_SECTION_END));
    if (from === -1 || to === -1 || to < from) {
      problems.push(`${SERVER}: the declared judge section is not where this check expects it`);
      continue;
    }
    const importAt = lines.findIndex((l) => l.includes(SERVER_IMPORT));
    const strays = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l, i }) => hits(l, [...CONSUMING, ...TABLES, ...FEATURE]).length
        && !(i >= from && i <= to)
        && !(importAt !== -1 && i >= importAt - 4 && i <= importAt));
    if (strays.length) {
      for (const s of strays) {
        problems.push(`${SERVER}:${s.i + 1}: a judge reference outside the declared section — ${s.l.trim().slice(0, 80)}`);
      }
    } else {
      declared.push([file, `every reference confined to lines ${from + 1}-${to + 1}, plus the import`]);
    }
    continue;
  }

  const consuming = hits(text, CONSUMING);
  const tables = hits(text, TABLES);
  const feature = hits(text, FEATURE);

  if (MAY_STORE[file]) {
    if (consuming.length) problems.push(`${file}: may name the tables, but CONSUMES the judge: ${consuming.join(', ')}`);
    else declared.push([file, MAY_STORE[file]]);
    continue;
  }
  if (MAY_NAME[file]) {
    if (consuming.length || tables.length) {
      problems.push(`${file}: may name the feature, but READS it: ${[...consuming, ...tables].join(', ')}`);
    } else declared.push([file, MAY_NAME[file]]);
    continue;
  }

  gateFiles.push(file);
  if (consuming.length || tables.length) {
    problems.push(`${file}: READS the judge — ${[...consuming, ...tables].join(', ')}. `
      + 'No gate may depend on a monitoring signal (ADR 0001, PRD-E7 Q4).');
  } else if (feature.length) {
    problems.push(`${file}: names the judge feature (${feature.join(', ')}) and is not declared. `
      + 'Add it to MAY_NAME with a reason, or take the reference out.');
  }
}

// A declaration naming a file that does not exist is a declaration nobody re-read. The same
// rule the render audit applies to its CONSUMED list (E8-S4).
for (const [file, why] of Object.entries({ ...ITS_OWN, ...MAY_NAME, ...MAY_STORE })) {
  if (!existsSync(file)) problems.push(`declared but missing: ${file} (${why.slice(0, 50)}…)`);
}

const scanned = new Set([...gateFiles, ...Object.keys(MAY_NAME), ...Object.keys(MAY_STORE), SERVER]);
const missing = MUST_COVER.filter((f) => !scanned.has(f));
if (missing.length) {
  problems.push(`this check did not read ${missing.join(', ')} — the scan is not covering what it claims`);
}

console.log('THE JUDGE IS ABSENT FROM EVERY GATE — checked, over a derived file list\n');
for (const [file, why] of declared) console.log(`  declared  ${file.padEnd(44)} ${why.slice(0, 78)}`);
console.log('');
console.log(`Files scanned:        ${files.length}`);
console.log(`Gate-bearing files:   ${gateFiles.length}  (may not mention the judge at all)`);
console.log(`Declared:             ${declared.length}  (may name it; may not read it)`);
console.log(`The judge's own:      ${Object.keys(ITS_OWN).length}  (the thing the rule is about)`);
console.log(`Coverage asserted:    ${MUST_COVER.length} named files, all scanned`);
console.log('');

if (problems.length) {
  console.error(`FAIL  ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exitCode = 1;
} else {
  console.log('PASS  no case, threshold, metric, report or workflow reads a judge score.');
  console.log('      The second opinion gates nothing, and this is how that stays true.');
}
