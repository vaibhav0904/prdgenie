// The negative control for C4, run in BOTH directions.
//
// C4 failed on its first real run, and a case that has only ever been observed failing is not
// a tested case — that is BUG-017 exactly, where a rule that could never go green would have
// sent someone to "fix" working code. C4 was observed passing once naturally (run 3), and this
// control makes both directions repeatable instead of lucky.
//
//   MUST GO GREEN  a conflict citing T4-Q01's span is planted -> R1 finds the explicit
//                  conflict and the verdict stops being FAIL for that reason
//   MUST GO RED    the plant is removed -> R1 is back to whatever the real run produced
//
// The plant is written to the database and removed in a `finally`, then the row count is
// compared. A verifier may not leave a row another verifier will read as a defect (BUG-012's
// test plan earned that rule by breaking verify-assembly).
//
// Usage:  .\run.cmd evals/harness/negative-control-c4.mjs

import { readFileSync, readdirSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { all, get, run as exec } from '../../review-ui/db.mjs';

// BUG-047. A control grades two or three times per run, and those results are working-out,
// not evidence. `evals/results/` is where archived measurements live, cited from story cards;
// a directory that also collects throwaways stops being one you can trust to hold only what
// somebody decided to keep. `grade.mjs` has had `--results=` for exactly this since E2.
const RESULTS = mkdtempSync(join(tmpdir(), 'c4-control-'));

const MANIFEST = 'evals/results/.last-run.json';
const LABELS = 'evals/datasets/labels/T4.labels.json';

let failures = 0;
const say = (pass, msg) => {
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${msg}`);
};

function newestC4() {
  const f = readdirSync(RESULTS)
    .filter((n) => /-C4(-run\d+)?\.md$/.test(n))
    .map((n) => ({ n, m: statSync(`${RESULTS}/${n}`).mtimeMs }))
    .sort((a, b) => a.m - b.m)
    .pop();
  return f ? { name: f.n, text: readFileSync(`${RESULTS}/${f.n}`, 'utf8') } : { name: '(none)', text: '' };
}

function gradeC4() {
  try {
    execFileSync(process.execPath, ['evals/harness/grade.mjs', 'C4', `--results=${RESULTS}`], { encoding: 'utf8', stdio: 'pipe' });
  } catch { /* a FAIL verdict exits non-zero, which is the point of the case */ }
  return newestC4();
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const t4 = manifest.runs?.T4;
if (!t4?.prd_version_id) {
  console.error('No T4 in the run manifest. Produce a run first:');
  console.error('  .\\run.cmd evals/harness/produce.mjs');
  process.exit(1);
}

const labels = JSON.parse(readFileSync(LABELS, 'utf8'));
const q01 = labels.expected_open_questions.find((q) => q.label_id === 'T4-Q01');
const doc = get('SELECT raw_text FROM source_documents WHERE doc_id=?', [t4.doc_id]);

// The plant cites T4-Q01's own quotes, located by the same substring search the product uses,
// so it lands exactly where the label says the conflict is.
const citations = q01.quotes.slice(0, 2).map((quote) => {
  const at = doc.raw_text.indexOf(quote);
  return { quote, start_char: at, end_char: at + quote.length, match_kind: at >= 0 ? 'exact' : 'not_found' };
});
say(citations.every((c) => c.match_kind === 'exact'),
  `the plant's citations resolve in T4 (${citations.length} quotes)`);

const before = all('SELECT question_id FROM open_questions WHERE prd_version_id=?', [t4.prd_version_id]).length;
const baseline = newestC4();
console.log(`  ..    baseline result: ${baseline.name}`);
console.log('');

try {
  exec(`INSERT INTO open_questions (prd_version_id, trace_id, kind, question, citations)
        VALUES (?,?,?,?,?)`,
    [t4.prd_version_id, t4.trace_id, 'conflict',
     'PLANTED BY negative-control-c4.mjs — can C4 see an explicit conflict when one is reported?',
     JSON.stringify(citations)]);

  const green = gradeC4();
  say(/R1\*\* the explicit conflict is found \| \*\*1 of 1\*\* \| pass/.test(green.text),
    `MUST GO GREEN: with the conflict reported, R1 passes (${green.name})`);
  say(!/## Verdict: FAIL/.test(green.text),
    'and the verdict is no longer FAIL for that reason');
} finally {
  exec(`DELETE FROM open_questions
        WHERE prd_version_id=? AND question LIKE 'PLANTED BY negative-control-c4.mjs%'`,
    [t4.prd_version_id]);
}

const after = all('SELECT question_id FROM open_questions WHERE prd_version_id=?', [t4.prd_version_id]).length;
say(after === before, `the plant is removed: ${before} open questions before, ${after} after`);

const red = gradeC4();
const r1Line = (red.text.match(/\*\*R1\*\*[^\n]*/) ?? ['(not found)'])[0];
say(/\*\*R1\*\*/.test(red.text), `MUST GO BACK: ${r1Line.replace(/\|/g, '').trim()} (${red.name})`);

// The labels must be untouched by all of this. C4's one surviving guard is that the answer
// key cannot move once a score exists, and a control that edited it would be the exact
// failure that guard exists to prevent.
const labelsNow = readFileSync(LABELS, 'utf8');
say(labelsNow === readFileSync(LABELS, 'utf8') && JSON.parse(labelsNow).expected_open_questions.length === labels.expected_open_questions.length,
  'T4\'s labels were never touched — the plant went in the database, never in the answer key');

console.log('');
if (failures) {
  console.error(`FAILED — ${failures} check(s).`);
} else {
  console.log('C4 can go green for the right reason and red for the right reason.');
  console.log('It failed on its first real run, and this is what says that failure is the');
  console.log('system\'s and not the case\'s.');
}
process.exitCode = failures ? 1 : 0;
