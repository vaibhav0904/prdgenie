// The grader. Reads a run that already happened and scores it against the labels.
//
// Three properties, all load-bearing:
//   1. It NEVER produces a run. Grading and running are separate commands
//      (evals/README.md rule 3), so a bad grade can never be "fixed" by changing how the
//      run was made.
//   2. It NEVER calls a model provider, for any purpose including matching. A provider
//      call inside the grader would make the headline accuracy figure a model's opinion
//      about a model (ADR 0004, ADR 0008).
//   3. A failing verdict is a non-zero exit code, and a missing run is an error naming the
//      command to produce one — never a stack trace, and never success
//      (evals/README.md rule 6).
//
// Usage:
//   .\run.cmd evals\harness\grade.mjs         every implemented case
//   .\run.cmd evals\harness\grade.mjs C1      one case

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { all, get } from '../../review-ui/db.mjs';
import { loadLabels, fixtureId } from './labels.mjs';

// One import per implemented case. A case is registered when it exists, not when it is
// planned: C5 grades a capability that has not been built, and a case written before
// its capability is a case whose threshold was guessed (PRD-E2, non-goals).
import * as C1 from './cases/C1.mjs';
import * as C2 from './cases/C2.mjs';
import * as C3 from './cases/C3.mjs';
import * as C4 from './cases/C4.mjs';
import * as C6 from './cases/C6.mjs';

const CASES = [C1, C2, C3, C4, C6];
const MANIFEST = 'evals/results/.last-run.json';
// `--results=` exists for the same reason `produce.mjs` has `--manifest=`: a negative control
// deliberately corrupts a run to prove a case can go red, and the red result file it produces
// is not a result. It goes somewhere else rather than sitting in the archive looking like one.
const RESULTS_DIR = process.argv.slice(2).find((a) => a.startsWith('--results='))
  ?.slice('--results='.length) ?? 'evals/results';
const PRODUCE = '.\\run.cmd evals/harness/produce.mjs';

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--')).map((s) => s.toUpperCase());
const cases = CASES.filter((c) => !wanted.length || wanted.includes(c.id));

if (!cases.length) {
  console.error(`No such case: ${wanted.join(', ')}. Implemented: ${CASES.map((c) => c.id).join(', ')}`);
  process.exit(1);
}

// --- is there anything to grade? ----------------------------------------------

if (!existsSync(MANIFEST)) {
  console.error('Nothing to grade: no run manifest.');
  console.error('Produce a run first:');
  console.error(`  ${PRODUCE}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
if (!Object.keys(manifest.runs ?? {}).length) {
  console.error('Nothing to grade: the manifest records no successful run.');
  console.error(`  ${PRODUCE}`);
  process.exit(1);
}
if (manifest.ingest_only) {
  console.error('Nothing to grade: the last run was --ingest-only, so no requirements exist.');
  console.error(`  ${PRODUCE}`);
  process.exit(1);
}

// --- the context every case reads ---------------------------------------------

const labels = new Map(loadLabels().map((l) => [l.fixture_id ?? fixtureId(l.file), l]));

function requirements(prdVersionId) {
  const reqs = all(
    'SELECT req_id, kind, statement, stakeholder, confidence, grounded FROM requirements WHERE prd_version_id=? ORDER BY rowid',
    [prdVersionId]);
  for (const r of reqs) {
    r.grounded = Boolean(r.grounded);
    r.citations = all(
      'SELECT quote, start_char, end_char, match_kind FROM citations WHERE req_id=? ORDER BY citation_id',
      [r.req_id]);
  }
  return reqs;
}

const document = (docId) => get('SELECT * FROM source_documents WHERE doc_id=?', [docId]);

// The two outputs C4 grades. Open questions have their own table; unsettled positions live in
// the version content, where E4 will render them (assemble.mjs says why there is no table).
function openQuestions(prdVersionId) {
  return all('SELECT kind, question, citations FROM open_questions WHERE prd_version_id=? ORDER BY question_id',
    [prdVersionId]).map((q) => ({ ...q, citations: JSON.parse(q.citations ?? '[]') }));
}

// The structure C3 grades. Each read is its own query on purpose: a single joined view would
// hide an orphan by dropping the row that has nowhere to join to, which is the exact defect
// this case exists to find.
const epics = (prdVersionId) =>
  all('SELECT epic_id, title, summary FROM epics WHERE prd_version_id=? ORDER BY epic_id', [prdVersionId]);

const features = (prdVersionId) =>
  all('SELECT feature_id, epic_id, title, req_ids, priority_score FROM features WHERE prd_version_id=? ORDER BY feature_id',
    [prdVersionId]).map((f) => ({ ...f, req_ids: JSON.parse(f.req_ids ?? '[]') }));

const stories = (prdVersionId) =>
  all('SELECT story_id, feature_id, as_a, i_want, so_that, acceptance_criteria FROM stories WHERE prd_version_id=? ORDER BY story_id',
    [prdVersionId]).map((s) => ({ ...s, acceptance_criteria: JSON.parse(s.acceptance_criteria ?? '[]') }));

const priorityFactors = (prdVersionId) =>
  all(`SELECT p.feature_id, p.reach, p.impact, p.confidence, p.effort, p.rationale
       FROM priority_factors p JOIN features f ON f.feature_id = p.feature_id
       WHERE f.prd_version_id=? ORDER BY p.feature_id`, [prdVersionId]);

function content(prdVersionId) {
  const row = get('SELECT content FROM prd_versions WHERE prd_version_id=?', [prdVersionId]);
  try { return row ? JSON.parse(row.content) : null; } catch { return null; }
}

function unsettledPositions(prdVersionId) {
  const row = get('SELECT content FROM prd_versions WHERE prd_version_id=?', [prdVersionId]);
  if (!row) return [];
  try { return JSON.parse(row.content)?.unsettled_positions ?? []; } catch { return []; }
}

const version = (versionId) =>
  get('SELECT prd_version_id, state, park_reason, degraded FROM prd_versions WHERE prd_version_id=?', [versionId]);

// The prompt's identity, so a result file says what it graded. A CONTENT hash, not a git
// hash — and it stays one now the project is under version control, because a commit hash
// names the tree the run was launched from, not the bytes the model was actually sent. A
// prompt edited and synced but not yet committed would grade under the previous commit's
// name (E2-S4 records the deviation).
const promptPath = 'n8n/prompts/extract-requirements.md';
const promptHash = existsSync(promptPath)
  ? createHash('sha256').update(readFileSync(promptPath)).digest('hex').slice(0, 12)
  : 'absent';

const callRows = all(
  `SELECT DISTINCT prompt_version, model FROM llm_calls
   WHERE trace_id IN (${Object.values(manifest.runs).map(() => '?').join(',') || "''"})`,
  Object.values(manifest.runs).map((r) => r.trace_id));

const ctx = {
  manifest,
  labels,
  requirements,
  document,
  version,
  openQuestions,
  unsettledPositions,
  epics,
  features,
  stories,
  priorityFactors,
  content,
  promptHash,
  promptVersions: [...new Set(callRows.map((r) => r.prompt_version).filter(Boolean))],
  models: [...new Set(callRows.map((r) => r.model).filter(Boolean))],
  today: new Date().toISOString().slice(0, 10),
};

// --- run the cases -------------------------------------------------------------

mkdirSync(RESULTS_DIR, { recursive: true });

/** Never overwrite a result. A superseded figure stays where it was written. */
function resultPath(caseId) {
  const base = `${RESULTS_DIR}/${ctx.today}-${caseId}`;
  if (!existsSync(`${base}.md`)) return `${base}.md`;
  let n = 2;
  while (existsSync(`${base}-run${n}.md`)) n++;
  return `${base}-run${n}.md`;
}

const summary = [];
for (const c of cases) {
  const out = c.run(ctx);
  const path = resultPath(c.id);
  writeFileSync(path, `${out.markdown}\n`);
  // A JSON sidecar beside every dated result. The markdown is what a person reads; this is
  // what the spread runner reads, because parsing a report for its own figures is how a number
  // quietly becomes whatever the formatting says it is (E2-S4).
  writeFileSync(path.replace(/\.md$/, '.json'), `${JSON.stringify({
    id: c.id,
    title: c.title,
    verdict: out.verdict,
    produced_at: new Date().toISOString(),
    prompt_versions: ctx.promptVersions,
    models: ctx.models,
    // Each case names its own headline figures, or names none. A case with no headline
    // contributes its VERDICT to a spread and nothing else, which the report says out loud.
    headline: c.headline ? c.headline(out) : null,
  }, null, 2)}\n`);
  summary.push({ id: c.id, title: c.title, verdict: out.verdict, path });
}

console.log('');
for (const s of summary) {
  console.log(`${s.verdict.padEnd(28)} ${s.id}  ${s.title}`);
  console.log(`${''.padEnd(28)} -> ${s.path}`);
}

const failed = summary.filter((s) => s.verdict === 'FAIL');
const manual = summary.filter((s) => s.verdict === 'PASS-PENDING-MANUAL-REVIEW');
console.log(`\n${summary.length - failed.length}/${summary.length} cases passed`
  + (manual.length ? ` (${manual.length} pending manual review)` : ''));

if (failed.length) {
  console.error(`FAILED: ${failed.map((s) => s.id).join(', ')}`);
  process.exit(1);
}
