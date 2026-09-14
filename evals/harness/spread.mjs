// E2-S4. Run it three times and publish the range, because a single run is a diagnostic.
//
// `evals/README.md` rule 4: **report the spread, not the flattering run** — a metric that
// changes when you re-measure it was never a metric. PRD-E2 turned that into a publication
// gate: spread is on demand while iterating and MANDATORY before any figure reaches the deck,
// the video, the charter or a quoted result file.
//
// So this runs the whole thing N times — real produce, real grade, real money — and reports,
// per case:
//
//   the VERDICT across the runs      three PASS is a result; two PASS and one FAIL is a
//                                    different result, and averaging them would be a lie
//   the RANGE of each headline figure  min / median / max, never the best one
//   whether that range CROSSES A FLOOR  named explicitly, because a median above a floor with
//                                    a minimum below it has not settled anything
//
// A case that declares no headline figures contributes its verdict and says so; the report
// prints which cases contributed numbers and which did not, so the coverage is stated rather
// than implied (BUG-003/019/032).
//
// Usage:
//   .\run.cmd evals/harness/spread.mjs                 3 runs, every fixture, every case
//   .\run.cmd evals/harness/spread.mjs --runs=2        fewer, and the report says two
//   .\run.cmd evals/harness/spread.mjs --grade-only    re-grade the run that exists, N times
//                                                      (cheap; measures the GRADER's stability,
//                                                      not the system's — the report says so)

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const RESULTS = 'evals/results';
const args = process.argv.slice(2);
const RUNS = Number(args.find((a) => a.startsWith('--runs='))?.slice(7) ?? 3);
const GRADE_ONLY = args.includes('--grade-only');
const OUT = args.find((a) => a.startsWith('--out='))?.slice(6)
  ?? `${RESULTS}/${new Date().toISOString().slice(0, 10)}-spread.md`;

// The control seam (TC13): a file of pre-made rounds, so the straddle detector can be shown
// finding a straddle that really is there. It exercises this file's reporting, not a copy of it.
const INJECT = process.env.SPREAD_INJECT ?? '';

const node = (script, extra = []) => execFileSync(process.execPath,
  ['--env-file-if-exists=.env', script, ...extra], { encoding: 'utf8', stdio: 'pipe' });

/** Every JSON sidecar now in the results directory, by name. */
const sidecars = () => new Set(readdirSync(RESULTS).filter((f) => f.endsWith('.json')));

function runOnce(n) {
  const before = sidecars();
  if (!GRADE_ONLY) {
    console.log(`  run ${n}/${RUNS}: producing every fixture…`);
    try { node('evals/harness/produce.mjs'); } catch { /* a parked fixture exits non-zero */ }
  }
  console.log(`  run ${n}/${RUNS}: grading…`);
  // No argument: grade.mjs grades EVERY case by default. Passing 'all' asks for a case
  // called ALL and gets an exit code — which this loop would then swallow as 'a FAIL is a
  // result'. It did, for a whole round, before anyone noticed (E2-S4).
  try { node('evals/harness/grade.mjs'); } catch { /* a FAIL exits non-zero; it is a result */ }

  const fresh = [...sidecars()].filter((f) => !before.has(f));
  // A ROUND THAT GRADED NOTHING IS NOT A ROUND. Swallowing grade's exit code as 'a FAIL is a
  // result' is right for a case that failed and wrong for a grader that never ran — and the
  // difference is invisible unless it is asserted here. It cost a whole round before it was.
  if (!fresh.length) {
    console.error(`
Round ${n} graded nothing: no new result appeared in ${RESULTS}.`);
    console.error('That is a broken run, not a spread with a gap in it. Fix it and start over.');
    process.exit(1);
  }
  return fresh.map((f) => JSON.parse(readFileSync(`${RESULTS}/${f}`, 'utf8')));
}

// --- the statistics, and they are deliberately dull ------------------------------------------

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const pct = (x) => (x === null || x === undefined ? 'n/a' : `${(100 * x).toFixed(1)}%`);

// --- collect ------------------------------------------------------------------------------------

console.log(`THE SPREAD — ${RUNS} run(s), and the range is the answer\n`);
if (GRADE_ONLY) {
  console.log('  --grade-only: the SAME run is graded repeatedly. That measures the grader, not');
  console.log('  the system, and the report says so where the figure would otherwise be read as');
  console.log('  a spread of the system.\n');
}

let rounds;
if (INJECT) {
  rounds = JSON.parse(readFileSync(INJECT, 'utf8'));
  console.log(`  injected: ${INJECT} — ${rounds.length} round(s) of prepared results\n`);
} else {
  rounds = [];
  for (let i = 1; i <= RUNS; i++) rounds.push(runOnce(i));
}

const caseIds = [...new Set(rounds.flat().map((r) => r.id))].sort();
const L = [];
const say = (line = '') => { L.push(line); console.log(line); };

say('');
say(`# Spread — ${new Date().toISOString().slice(0, 10)}`);
say('');
say(`**${rounds.length} run(s)**${GRADE_ONLY ? ', GRADE-ONLY (one produced run, graded repeatedly)' : ', each a full produce and grade'}.`);
const versions = [...new Set(rounds.flat().flatMap((r) => r.prompt_versions ?? []))];
const models = [...new Set(rounds.flat().flatMap((r) => r.models ?? []))];
say(`Prompt version(s): ${versions.join(', ') || '(none recorded)'} · model(s): ${models.join(', ') || '(none recorded)'}`);
say('');
say('A range is not a number with error bars around it. Where the range crosses a floor, the');
say('case has not settled the question, and that is said here rather than left to the median.');
say('');

let straddles = 0;
let withNumbers = 0;
const verdictOnly = [];

for (const id of caseIds) {
  const runs = rounds.map((round) => round.find((r) => r.id === id)).filter(Boolean);
  const verdicts = runs.map((r) => r.verdict);
  const unanimous = new Set(verdicts).size === 1;

  say(`## ${id} — ${runs[0]?.title ?? ''}`);
  say('');
  say(`**Verdict:** ${[...new Set(verdicts)].map((v) => `${v} ×${verdicts.filter((x) => x === v).length}`).join(', ')}`
    + (unanimous ? '' : '  ← **NOT UNANIMOUS: the verdict itself moved between runs**'));
  if (!unanimous) straddles++;

  const headlines = runs.map((r) => r.headline).filter(Boolean);
  if (!headlines.length) {
    verdictOnly.push(id);
    say('');
    say('*This case declares no headline figures: it contributes its verdict to this spread and');
    say('nothing else.*');
    say('');
    continue;
  }
  withNumbers++;

  const keys = [...new Set(headlines.flat().map((h) => `${h.fixture}|${h.metric}`))].sort();
  say('');
  say('| fixture | metric | min | median | max | floor | |');
  say('|---|---|---|---|---|---|---|');
  for (const key of keys) {
    const [fixture, metric] = key.split('|');
    const values = headlines
      .map((h) => h.find((x) => `${x.fixture}|${x.metric}` === key)?.value)
      .filter((v) => typeof v === 'number');
    if (!values.length) continue;
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const floor = headlines[0].find((x) => `${x.fixture}|${x.metric}` === key)?.floor ?? null;
    const crosses = floor !== null && lo < floor && hi >= floor;
    const under = floor !== null && hi < floor;
    if (crosses) straddles++;
    say(`| ${fixture} | ${metric} | ${pct(lo)} | ${pct(median(values))} | ${pct(hi)} | ${floor === null ? '—' : pct(floor)} | `
      + `${crosses ? '**STRADDLES THE FLOOR**' : under ? '**below, every run**' : ''} |`);
  }
  say('');
}

say('## What this spread covers');
say('');
say(`- **${withNumbers} case(s)** contributed numeric ranges; **${verdictOnly.length}** contributed a verdict only`
  + (verdictOnly.length ? ` (${verdictOnly.join(', ')})` : ''));
say(`- **${rounds.length} run(s)**. A range over two runs is a range over two runs; it is written here as such.`);
say(`- **${straddles} straddle(s)**: a verdict that moved, or a range with the floor inside it.`);
say('');
if (straddles) {
  say('**A straddle is not a failure and it is not a pass.** It means this figure cannot be');
  say('published as settled: quote the range, or run it more times and quote the wider range.');
} else {
  say('**No straddle.** Every range sits wholly on one side of its floor, and every verdict');
  say('repeated. These figures can be quoted with their range beside them.');
}

mkdirSync(RESULTS, { recursive: true });
writeFileSync(OUT, `${L.join('\n')}\n`);
console.log(`\nWritten: ${OUT}`);

// A straddle is a finding, not an error: exit 0 so this can run in a chain, and let the
// reader see it. A run that could not be graded at all is different, and grade.mjs already
// exits non-zero for that.
if (!rounds.flat().length) {
  console.error('No results were produced — nothing to take a spread over.');
  process.exitCode = 1;
}
