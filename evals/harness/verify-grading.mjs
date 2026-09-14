// Checks the instrument, not the system.
//
// Every quality number this project publishes comes out of `grade.mjs` and `match.mjs`. If
// the matcher is wrong, every result file is confidently wrong in the same direction and
// nothing else would catch it — the pipeline would be graded against a broken ruler and
// the ruler would agree with itself.
//
// The arithmetic rows use SYNTHETIC input on purpose. Over-splitting may simply not occur
// in a given extraction, and a row that can only pass when the model happens to misbehave
// is not a check (BUG-001's lesson, third time).
//
// Usage:  node --env-file-if-exists=.env evals/harness/verify-grading.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, renameSync, rmSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchRequirements } from './match.mjs';

// BUG-047. Every grade this file takes is working-out, not evidence. It used to write into
// evals/results/, which is where archived measurements live and are cited from story cards.
// grade.mjs has had --results= since E2 for exactly this.
const RESULTS = mkdtempSync(join(tmpdir(), 'verify-grading-'));

const results = [];
const ok = (id, desc, pass, detail = '') => results.push({ id, desc, pass, detail });

const node = (args, env = {}) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, ...env } }) };
  } catch (err) {
    return { code: err.status ?? -1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
};

// --- TC4: over-splitting is one match plus one false positive -------------------
// One label, drawn from one region. Two extracted requirements both citing it.

const oneLabel = [{ label_id: 'L1', kind: 'functional', statement: 'A user can export CSV.' }];
const oneRegion = new Map([['L1', [{ start_char: 100, end_char: 160 }]]]);
const split = matchRequirements([
  { req_id: 'R1', kind: 'functional', statement: 'export csv', citations: [{ start_char: 105, end_char: 130 }] },
  { req_id: 'R2', kind: 'functional', statement: 'export csv again', citations: [{ start_char: 131, end_char: 158 }] },
], oneLabel, oneRegion);
ok('S2-TC4', 'two extractions overlapping one label score as one match and one false positive',
  split.counts.match === 1 && split.counts.over_split === 1 && split.counts.missed === 0
    && split.recall === 1 && split.precision === 0.5,
  `match=${split.counts.match} over_split=${split.counts.over_split} `
    + `recall=${split.recall} precision=${split.precision}`);

// Supporting arithmetic: the three other verdicts, so a refactor cannot quietly
// reclassify one of them.
const noOverlap = matchRequirements(
  [{ req_id: 'R1', kind: 'functional', statement: 'invented', citations: [{ start_char: 5, end_char: 9 }] }],
  oneLabel, oneRegion);
const wrongKind = matchRequirements(
  [{ req_id: 'R1', kind: 'constraint', statement: 'right span, wrong kind', citations: [{ start_char: 110, end_char: 120 }] }],
  oneLabel, oneRegion);
const clean = matchRequirements(
  [{ req_id: 'R1', kind: 'functional', statement: 'right', citations: [{ start_char: 110, end_char: 120 }] }],
  oneLabel, oneRegion);
ok('S2-TC4b', 'the other three verdicts are counted as specified',
  noOverlap.counts.false_positive === 1 && noOverlap.counts.missed === 1
    && wrongKind.counts.wrong_kind === 1 && wrongKind.counts.missed === 1
    && clean.counts.match === 1 && clean.counts.missed === 0,
  'no-overlap -> false positive + miss; wrong kind -> false positive + miss; exact -> match');

// A citation the grounding check could not place has no span and must not match anything.
const noSpan = matchRequirements(
  [{ req_id: 'R1', kind: 'functional', statement: 'uncitable', citations: [] }], oneLabel, oneRegion);
ok('S2-TC4c', 'a requirement with no locatable citation matches nothing',
  noSpan.counts.match === 0 && noSpan.counts.false_positive === 1,
  'an unplaceable quote earns no credit');

// --- TC3 / TC8: what is NOT in the instrument -----------------------------------

const instrument = ['evals/harness/match.mjs', 'evals/harness/grade.mjs', 'evals/harness/cases/C1.mjs']
  .map((f) => ({ file: f, src: readFileSync(f, 'utf8') }));
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const FUZZY = /\b(levenshtein|jaro|cosine|embedding|similarity|fuzzy|stem|soundex|tokenSet)\b/i;
const fuzzyHit = instrument.map((f) => [f.file, code(f.src).match(FUZZY)]).find(([, m]) => m);
ok('S2-TC3', 'matching is span overlap and nothing else',
  !fuzzyHit, fuzzyHit ? `${fuzzyHit[0]}: ${fuzzyHit[1][0]}` : 'no similarity, distance, embedding or stemming');

const PROVIDER = /(api\.openai\.com|generativelanguage|anthropic\.com|openAiApi|OPENAI_API_KEY|GEMINI|completions)/i;
const providerHit = instrument.map((f) => [f.file, code(f.src).match(PROVIDER)]).find(([, m]) => m);
ok('S2-TC8', 'the grader never calls a model provider, for any purpose',
  !providerHit, providerHit ? `${providerHit[0]}: ${providerHit[1][0]}` : 'no provider host, credential or endpoint');

// --- TC1: nothing to grade is an error with a command, not a stack trace ---------

const MANIFEST = 'evals/results/.last-run.json';
const PARKED = 'evals/results/.last-run.verify.json';
if (existsSync(MANIFEST)) renameSync(MANIFEST, PARKED);
try {
  const missing = node(['--env-file-if-exists=.env', 'evals/harness/grade.mjs', `--results=${RESULTS}`]);
  ok('S2-TC1', 'with no run, the harness prints the produce command and exits non-zero',
    missing.code === 1 && /produce\.mjs/.test(missing.out) && !/at .*\n\s+at /.test(missing.out),
    `exit=${missing.code}, names produce.mjs=${/produce\.mjs/.test(missing.out)}, `
      + `stack trace=${/\n\s+at /.test(missing.out)}`);
} finally {
  if (existsSync(PARKED)) renameSync(PARKED, MANIFEST);
}

// --- TC7: results are never overwritten -----------------------------------------

const today = new Date().toISOString().slice(0, 10);
// Reports and their sidecars are counted SEPARATELY. A result is a report; the JSON beside
// it is the same result in a machine's shape (E2-S4). Counting both together made this check
// expect +1 and see +2, which is the check noticing a real change and saying it badly.
const mds = (d) => readdirSync(d).filter((f) => f.startsWith(`${today}-C1`) && f.endsWith('.md'));
const jsons = (d) => readdirSync(d).filter((f) => f.startsWith(`${today}-C1`) && f.endsWith('.json'));
// Seed a baseline IN THIS DIRECTORY first. Reading the real evals/results made this
// assertion depend on whether some earlier run had left a file there — ambient state, the
// BUG-045 shape — and the 'leaves the earlier one untouched' half passed vacuously when it
// had not.
node(['--env-file-if-exists=.env', 'evals/harness/grade.mjs', 'C1', `--results=${RESULTS}`]);
const before = mds(RESULTS);
const beforeJson = jsons(RESULTS);
const first = before[0] ? readFileSync(`${RESULTS}/${before[0]}`, 'utf8') : null;
const regrade = node(['--env-file-if-exists=.env', 'evals/harness/grade.mjs', 'C1', `--results=${RESULTS}`]);
const after = mds(RESULTS);
const afterJson = jsons(RESULTS);
ok('S2-TC7', 'a second run writes a new result file and leaves the earlier one untouched',
  after.length === before.length + 1
    && afterJson.length === beforeJson.length + 1
    && (first === null || readFileSync(`${RESULTS}/${before[0]}`, 'utf8') === first),
  `${before.length} -> ${after.length} report(s), ${beforeJson.length} -> ${afterJson.length} sidecar(s); the first report is byte-identical`);

// The assertion has already run, so the file it created is removed. Leaving it would grow
// evals/results/ by one non-run every time the instrument is verified, and a ledger of
// results that are not measurements is worse than no ledger.
const created = regrade.out.match(/-> (\S+\.md)/)?.[1];

// --- TC10: a failing case is a failing exit code --------------------------------
// Proven by the run above, whose verdict is read from its own output rather than assumed.

const failed = /FAILED: /.test(regrade.out);
ok('S2-TC10', 'a failing case is a non-zero exit code',
  failed ? regrade.code === 1 : regrade.code === 0,
  failed ? `case failed and exit=${regrade.code}` : `case passed and exit=${regrade.code}`);
if (created && existsSync(created)) rmSync(created);
// The JSON sidecar goes with it: a verification run must not leave a result behind (E2-S4).
if (created && existsSync(created.replace(/.md$/, '.json'))) rmSync(created.replace(/.md$/, '.json'));

// --- TC11: the case asserts its own coverage ------------------------------------
// Hide one of C1's two fixtures from the manifest and confirm the case fails rather than
// grading the half it can see (BUG-003).

const saved = readFileSync(MANIFEST, 'utf8');
try {
  const m = JSON.parse(saved);
  delete m.runs.T3;
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
  const partial = node(['--env-file-if-exists=.env', 'evals/harness/grade.mjs', 'C1', `--results=${RESULTS}`]);
  // Read the path the grader reports rather than guessing the newest filename: `-run2`
  // sorts before `.md`, so "the last one alphabetically" is the FIRST result ever written.
  const written = partial.out.match(/-> (\S+\.md)/)?.[1];
  const body = written && existsSync(written) ? readFileSync(written, 'utf8') : '';
  ok('S2-TC11', 'NEGATIVE CONTROL: a fixture missing from the run fails the case, not a footnote',
    partial.code === 1 && /NOT GRADED: T3/.test(body),
    `exit=${partial.code}; result says "${(body.match(/\*\*NOT GRADED: [^*]+\*\*/) ?? ['(nothing)'])[0]}"`);
  if (written && existsSync(written)) rmSync(written);
if (written && existsSync(written.replace(/.md$/, '.json'))) rmSync(written.replace(/.md$/, '.json'));
} finally {
  writeFileSync(MANIFEST, saved);
}

// --- C2: the grounding case checks itself, not the code it grades ---------------

const c2src = readFileSync('evals/harness/cases/C2.mjs', 'utf8');
ok('S3-TC2', 'C2 verifies grounding independently of the code that produced it',
  !/from '.*grounding\.mjs'|internal\/grounding-check/.test(c2src)
    && /includes\(quote\)/.test(c2src),
  'no import of grounding.mjs, no call to /internal/grounding-check, its own substring search');

// TC7 / TC8 — the fatal class and the merely-wrong class, both proven, on a COPY of the
// database. Planting a fabricated citation in the real one would corrupt the run every
// other case is grading.
const DB = process.env.DB_PATH ?? './data/prdgenie.db';
const DB_COPY = 'data/.verify-grading-copy.db';
try {
  // VACUUM INTO, not a file copy.
  //
  // Copying prdgenie.db / -wal / -shm by hand gives an INCONSISTENT snapshot while the
  // review service holds the database open: recent commits live in the WAL, and a copied
  // -shm is a stale index that can make SQLite ignore the WAL entirely. This check passed
  // for two runs and then failed for a third, with no code change between them — the only
  // difference was whether the WAL happened to be checkpointed.
  //
  // VACUUM INTO writes a single consistent file with no WAL. A flaky check is worse than a
  // missing one: it teaches you to re-run until it goes green.
  const { DatabaseSync } = await import('node:sqlite');
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(`${DB_COPY}${suffix}`)) rmSync(`${DB_COPY}${suffix}`);
  }
  const src = new DatabaseSync(DB);
  src.exec(`VACUUM INTO '${DB_COPY.replace(/'/g, "''")}'`);
  src.close();

  // TC8 first: an ungroundable quote HONESTLY flagged must cost nothing.
  let d = new DatabaseSync(DB_COPY);

  // The victim must belong to a version THIS RUN grades. Taking the oldest requirement in
  // the database picks one from a superseded version that C2 correctly never looks at, so
  // the planted citation is invisible and the control silently proves nothing. It passed
  // twice — while the database happened to be freshly reset — and then failed once nine
  // more documents had been ingested. A check that depends on incidental state is not a
  // check (BUG-001, again).
  const graded = JSON.parse(readFileSync(MANIFEST, 'utf8')).runs ?? {};
  const versions = Object.values(graded).map((r) => r.prd_version_id).filter(Number.isInteger);
  if (!versions.length) throw new Error('no graded versions in the manifest to plant into');
  const victim = d.prepare(
    `SELECT req_id FROM requirements WHERE grounded=1 AND prd_version_id IN (${versions.map(() => '?').join(',')})
     ORDER BY rowid LIMIT 1`).get(...versions);
  if (!victim) throw new Error('no grounded requirement in any graded version');
  d.prepare('INSERT INTO citations (req_id, doc_id, quote, start_char, end_char, match_kind) '
    + "SELECT ?, doc_id, 'a sentence that appears nowhere in any source document', NULL, NULL, 'not_found' "
    + 'FROM requirements WHERE req_id=?').run(victim.req_id, victim.req_id);
  d.prepare('UPDATE requirements SET grounded=0 WHERE req_id=?').run(victim.req_id);
  d.close();
  const honestRun = node(['--env-file-if-exists=.env', 'evals/harness/grade.mjs', 'C2', `--results=${RESULTS}`], { DB_PATH: DB_COPY });
  const honestPath = honestRun.out.match(/-> (\S+\.md)/)?.[1];
  const honestBody = honestPath && existsSync(honestPath) ? readFileSync(honestPath, 'utf8') : '';
  ok('S3-TC8', 'an honestly-flagged ungrounded quote is not a failure',
    /No hallucinated citations/.test(honestBody)
      && /Honestly flagged ungrounded: [1-9]/.test(honestBody),
    'the case reports it, prints it verbatim, and does not treat it as fatal');
  if (honestPath && existsSync(honestPath)) rmSync(honestPath);
if (honestPath && existsSync(honestPath.replace(/.md$/, '.json'))) rmSync(honestPath.replace(/.md$/, '.json'));

  // TC7: the SAME absent quote, now marked grounded. Must auto-fail.
  d = new DatabaseSync(DB_COPY);
  d.prepare('UPDATE requirements SET grounded=1 WHERE req_id=?').run(victim.req_id);
  d.close();
  const fatal = node(['--env-file-if-exists=.env', 'evals/harness/grade.mjs', 'C2', `--results=${RESULTS}`], { DB_PATH: DB_COPY });
  const fatalPath = fatal.out.match(/-> (\S+\.md)/)?.[1];
  const fatalBody = fatalPath && existsSync(fatalPath) ? readFileSync(fatalPath, 'utf8') : '';
  ok('S3-TC7', 'NEGATIVE CONTROL: a fabricated citation marked grounded auto-fails the case',
    fatal.code === 1 && /FATAL — 1 requirement/.test(fatalBody)
      && /a sentence that appears nowhere/.test(fatalBody),
    `exit=${fatal.code}; the result names the quote verbatim (TC6)`);
  if (fatalPath && existsSync(fatalPath)) rmSync(fatalPath);
if (fatalPath && existsSync(fatalPath.replace(/.md$/, '.json'))) rmSync(fatalPath.replace(/.md$/, '.json'));
} finally {
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(`${DB_COPY}${suffix}`)) rmSync(`${DB_COPY}${suffix}`);
  }
}

// --- report ---------------------------------------------------------------------

const width = Math.max(...results.map((r) => r.desc.length));
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(6)} ${r.desc.padEnd(width)}${r.detail ? '  ' + r.detail : ''}`);
}
const bad = results.filter((r) => !r.pass);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
if (bad.length) { console.error('INSTRUMENT VERIFICATION FAILED'); process.exit(1); }
console.log('The ruler measures what it says it measures.');
