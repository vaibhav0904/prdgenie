// E7-S5. The judge sweep's rules, forced rather than argued.
//
// Nothing here calls a provider. What is being tested is everything AROUND the model: which
// rows get drawn, whether a second sweep can start, whether a flagged item can be counted
// against us, and whether the two disagreement rules fire on the numbers they were given.
//
// IT RUNS ON A COPY OF THE DATABASE. The real one is left alone, so this can insert sweeps,
// contradict the answer key and open bug cards without any of it becoming a fact about the
// project. The copy carries real fixture runs, so the disagreement arithmetic is exercised
// against real extraction output and the real labels rather than against a fixture of a
// fixture.
//
// Usage:  .\run.cmd review-ui/scripts/verify-judge.mjs

import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REAL_DB = resolve(process.env.DB_PATH ?? './data/prdgenie.db');
const dir = mkdtempSync(join(tmpdir(), 'judge-verify-'));
const copy = join(dir, 'prdgenie.db');
const cards = join(dir, 'cards');
mkdirSync(cards);

// The -wal travels with the file or the copy is yesterday's database (BUG-015) — and the
// -shm must NOT: it is a shared-memory index into the WAL, and a stale one makes SQLite read
// the copy through the wrong window. Copying it made this file see a sweep it had just
// released as still in flight, which looked exactly like a bug in the lock.
copyFileSync(REAL_DB, copy);
if (existsSync(REAL_DB + '-wal')) copyFileSync(REAL_DB + '-wal', copy + '-wal');

process.env.DB_PATH = copy;
process.env.JUDGE_CARD_DIR = cards;

const { all, get, run, initSchema } = await import('../db.mjs');
const J = await import('../judge.mjs');

initSchema();

let checks = 0; let failures = 0;
const say = (id, pass, msg, detail = '') => {
  checks++;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(7)} ${msg}${detail ? `  — ${detail}` : ''}`);
};

// Everything that is NOT the judge's own two tables, so "a sweep writes nowhere else" is a
// measurement rather than a promise. The list is DERIVED from the schema (BUG-003/019/032).
const otherTables = all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .map((t) => t.name).filter((n) => !n.startsWith('judge_'));
const snapshot = () => Object.fromEntries(otherTables.map((t) =>
  [t, get(`SELECT COUNT(*) AS n FROM ${t}`).n]));
const before = snapshot();

console.log(`Database:      ${copy}  (a copy; the real one is untouched)`);
console.log(`Cards:         ${cards}`);
console.log(`Other tables:  ${otherTables.length}, derived from the schema\n`);

// --- the sample -----------------------------------------------------------------------------

// A sweep that was running when the copy was taken is an artefact of the COPY, not a state
// to test against: it would refuse every sweep below and the whole file would fail for a
// reason that has nothing to do with the rules. Released here, in the copy, with a reason.
const inherited = run(`UPDATE judge_sweeps SET status='skipped', skipped_reason='copied_mid_flight',
   closed_at=datetime('now') WHERE status='in_flight'`).changes;
all('PRAGMA wal_checkpoint(TRUNCATE)');
const stillOpen = all("SELECT sweep_id FROM judge_sweeps WHERE status='in_flight'");
if (stillOpen.length) {
  console.error(`the copy still holds ${stillOpen.length} in-flight sweep(s) after the release — `
    + 'this file cannot test a lock it is already inside');
  process.exit(1);
}
if (inherited) console.log(`  (released ${inherited} sweep(s) that were in flight when the copy was taken)\n`);

const first = J.openSweep({ trigger_source: 'manual' });
say('TC1a', first.status === 'ok', 'a sweep opens and draws a sample', `sweep ${first.sweep_id}, ${first.sample_size} item(s)`);
if (first.status !== 'ok' || !first.items?.length) {
  console.error('\nNothing to verify against: the copy has no unjudged output. Produce a run first:');
  console.error('  .\\run.cmd evals\\harness\\produce.mjs');
  process.exit(1);
}

const versions = first.items.filter((i) => i.item_type === 'prd_version');
const reqs = first.items.filter((i) => i.item_type === 'requirement');
say('TC1b', versions.length <= J.MAX_VERSIONS && reqs.length <= J.MAX_REQUIREMENTS,
  'the sample is bounded', `${versions.length} version(s) <= ${J.MAX_VERSIONS}, ${reqs.length} requirement(s) <= ${J.MAX_REQUIREMENTS}`);

const row1 = get('SELECT * FROM judge_sweeps WHERE sweep_id = ?', [first.sweep_id]);
say('TC3a', row1.trigger_source === 'manual' && row1.sample_size === first.items.length,
  'trigger_source and sample_size are stored on the sweep',
  `${row1.trigger_source}, ${row1.sample_size}`);
say('TC3b', row1.status === 'in_flight' && row1.judge_model === J.JUDGE_MODEL,
  'the sweep is in flight and names its model', `${row1.status}, ${row1.judge_model}`);

// Every item carries what the judge needs and NOTHING that would lead it.
const leaked = first.items.filter((i) => JSON.stringify(i).includes('label_id'));
say('TC10a', leaked.length === 0, 'no item in the sample carries a label id', `${leaked.length} leak(s)`);

// --- the lock -------------------------------------------------------------------------------

const sweepsBefore = get('SELECT COUNT(*) AS n FROM judge_sweeps').n;
const refused = J.openSweep({ trigger_source: 'manual' });
const sweepsAfter = get('SELECT COUNT(*) AS n FROM judge_sweeps').n;
say('TC4a', refused.status === 'error' && refused.reason === 'sweep_in_flight',
  'a second trigger is REFUSED while a sweep is in flight', refused.reason ?? '(accepted!)');
say('TC4b', sweepsAfter === sweepsBefore,
  'and the refusal drew no second sample', `${sweepsBefore} -> ${sweepsAfter} sweeps`);
say('TC4c', String(refused.detail ?? '').includes(String(first.sweep_id)),
  'the refusal names the sweep in the way', refused.detail ?? '');

// --- scoring, and never drawing the same row twice ---------------------------------------------

const RUBRIC = J.rubricVersion();
const scored = J.recordScores(first.sweep_id, first.items.map((i) => ({
  item_type: i.item_type,
  item_id: i.item_id,
  prd_version_id: i.prd_version_id,
  trace_id: i.trace_id,
  doc_id: i.doc_id,
  rubric_version: RUBRIC,
  verdict: 'supported',
  faithfulness: 0.9,
  completeness: 0.9,
  clarity: 0.9,
  comment: 'verification run, not a model opinion',
})));
say('TC8a', scored.status === 'ok' && scored.stored === first.items.length,
  'every sampled item can be scored', `${scored.stored} stored`);

const storedRubrics = all('SELECT DISTINCT rubric_version FROM judge_scores WHERE sweep_id = ?', [first.sweep_id]);
say('TC8b', storedRubrics.length === 1 && storedRubrics[0].rubric_version === RUBRIC,
  'the rubric version is stored with every score', `${RUBRIC}`);

// ... and it is the hash of the bytes the workflow actually sends.
const wf6 = readFileSync('n8n/workflows/WF6-judge-sweep.json', 'utf8');
say('TC8c', wf6.includes(`PROMPT_VERSION = '${RUBRIC}'`),
  'and that hash is the one WF6 sends, not a number typed twice', RUBRIC);

const closed1 = J.closeSweep({ sweep_id: first.sweep_id, status: 'complete', rubric_version: RUBRIC });
const closedRow = get('SELECT status, closed_at FROM judge_sweeps WHERE sweep_id = ?', [first.sweep_id]);
say('TC3c', closed1.status === 'ok' && closedRow.status === 'complete' && Boolean(closedRow.closed_at),
  'the sweep closes — and the ROW says so, not just the return value',
  `scored=${closed1.scored}, row=${closedRow.status}`);

const second = J.openSweep({ trigger_source: 'cron' });
const overlap = second.items.filter((i) => first.items.some((f) => f.item_type === i.item_type && f.item_id === i.item_id));
say('TC2', overlap.length === 0,
  'a second sweep draws only rows the first one did not score', `${overlap.length} overlapping item(s)`);
say('TC3d', get('SELECT trigger_source FROM judge_sweeps WHERE sweep_id = ?', [second.sweep_id]).trigger_source === 'cron',
  'a cron sweep is recorded as cron, never as the same thing as a manual one');

// --- the abandoned sweep ------------------------------------------------------------------------

// The second sweep is left open and back-dated: the process died holding the lock.
run("UPDATE judge_sweeps SET opened_at = datetime('now','-2 hours') WHERE sweep_id = ?", [second.sweep_id]);
const third = J.openSweep({ trigger_source: 'manual' });
const abandoned = get('SELECT status, skipped_reason FROM judge_sweeps WHERE sweep_id = ?', [second.sweep_id]);
say('TC5a', third.status === 'ok', 'an abandoned sweep does not lock out every later sweep');
say('TC5b', abandoned.status === 'skipped' && abandoned.skipped_reason === 'sweep_abandoned',
  'and releasing it is RECORDED, never silent', `${abandoned.status}/${abandoned.skipped_reason}`);

// --- a skip is not a clean sweep ------------------------------------------------------------------

const noReason = J.closeSweep({ sweep_id: third.sweep_id, status: 'skipped' });
say('TC12a', noReason.status === 'error' && noReason.missing.includes('skipped_reason'),
  'a skip with no reason is REFUSED — that is the shape of a silent failure', noReason.reason ?? '');
const skipped = J.closeSweep({ sweep_id: third.sweep_id, status: 'skipped', skipped_reason: 'llm_unauthorized' });
say('TC12b', skipped.status === 'ok' && skipped.disagreement === null,
  'a skipped sweep is closed with its reason and is NOT evaluated as agreement',
  `disagreement=${JSON.stringify(skipped.disagreement)}`);

// --- the closed set of verdicts ---------------------------------------------------------------------

const fourth = J.openSweep({ trigger_source: 'manual' });
const bad = J.recordScores(fourth.sweep_id, [{ item_type: 'requirement', item_id: 'X', verdict: 'looks fine' }]);
say('TC12c', bad.rejected.length === 1 && bad.stored === 0,
  'a verdict outside the closed set is rejected, not coerced', bad.rejected[0]?.why ?? '');
J.closeSweep({ sweep_id: fourth.sweep_id, status: 'skipped', skipped_reason: 'llm_error' });
const late = J.recordScores(fourth.sweep_id, [{ item_type: 'requirement', item_id: 'X', verdict: 'supported' }]);
say('TC12d', late.status === 'error' && late.reason === 'sweep_not_in_flight',
  'scores cannot be written into a sweep that has closed', late.reason ?? '');

// --- the defensive rule, in both directions ------------------------------------------------------

/** Open a sweep and score exactly these requirement rows with one verdict. */
function sweepOver(reqRows, verdict) {
  const s = J.openSweep({ trigger_source: 'manual' });
  // The sample is random; this test needs specific rows, so the sweep is opened for the lock
  // and the rows are attached to it directly. What is under test is the ARITHMETIC, not the draw.
  J.recordScores(s.sweep_id, reqRows.map((r) => ({
    item_type: 'requirement', item_id: r.req_id, prd_version_id: r.prd_version_id,
    trace_id: r.trace_id, doc_id: r.doc_id, rubric_version: RUBRIC, verdict,
    faithfulness: 0.5, completeness: 0.5, clarity: 0.5, comment: 'forced',
  })));
  return s.sweep_id;
}

// A fixture version with real extraction output and a real answer key.
const manifest = JSON.parse(readFileSync(process.env.EVAL_MANIFEST ?? 'evals/results/.last-run.json', 'utf8'));
const fixture = Object.entries(manifest.runs ?? {}).find(([fx, r]) =>
  r?.prd_version_id && existsSync(`evals/datasets/labels/${fx}.labels.json`)
  && get('SELECT COUNT(*) AS n FROM requirements WHERE prd_version_id = ? AND grounded = 1', [r.prd_version_id]).n >= 4);

if (!fixture) {
  say('TC9', false, 'no graded fixture run in the database to force the rules against',
    'run .\\run.cmd evals\\harness\\produce.mjs first');
} else {
  const [fx, fxRun] = fixture;
  const grounded = all('SELECT req_id, prd_version_id, trace_id, doc_id FROM requirements WHERE prd_version_id = ? AND grounded = 1 ORDER BY req_id',
    [fxRun.prd_version_id]);
  console.log(`\n  forcing the rules against ${fx}, version ${fxRun.prd_version_id}, ${grounded.length} grounded requirement(s)\n`);

  // (a) the judge contradicts the key on every row -> the 40% rule must fire
  const sA = sweepOver(grounded, 'unsupported');
  const disA = J.disagreementFor(sA);
  say('TC17a', disA.comparable >= J.MIN_COMPARABLE && disA.disagreements > 0,
    'the judge contradicting the answer key is COUNTED as disagreement',
    `${disA.disagreements}/${disA.comparable} comparable`);
  const ruleA = J.applyDisagreementRules(sA, disA);
  say('TC17b', ruleA.rule === 'over_40_percent', 'the 40% rule fires', ruleA.reasons?.[0] ?? '');
  const cardFile = readdirSync(cards).find((f) => f.startsWith(ruleA.card));
  const cardText = cardFile ? readFileSync(join(cards, cardFile), 'utf8') : '';
  say('TC17c', Boolean(cardFile), 'and it opens a BUG card automatically', cardFile ?? '(none written)');
  say('TC19a', /rule: `over_40_percent`/.test(cardText), 'the card names the rule that fired');
  say('TC19b', /answer key is wrong as the judge is/.test(cardText) && /If the \*\*key\*\* is wrong/.test(cardText)
    && /If the \*\*rubric\*\* is wrong/.test(cardText),
    'and it weighs the rubric and the labels EQUALLY, blaming neither');
  say('TC19c', /changes a label, a threshold or a gate/.test(cardText),
    'and says out loud that nothing it contains may change a label, a threshold or a gate');

  // dedupe: the same rule, again, must not open a second card
  const cardsAfterFirst = readdirSync(cards).length;
  const sDup = sweepOver([], 'unsupported');
  const ruleDup = J.applyDisagreementRules(sDup, disA);
  say('TC17d', readdirSync(cards).length === cardsAfterFirst && ruleDup.deduplicated === true,
    'the same rule firing again defers to the open card instead of filing a second',
    `${readdirSync(cards).length} card(s)`);
  J.closeSweep({ sweep_id: sDup, status: 'skipped', skipped_reason: 'llm_error' });
  J.closeSweep({ sweep_id: sA, status: 'complete', rubric_version: RUBRIC });

  // (b) THE CONTROL: agreeing with the key must NOT fire the rule
  const sB = sweepOver(grounded.slice(0, Math.min(6, grounded.length)), 'supported');
  const disB = J.disagreementFor(sB);
  const ruleB = J.applyDisagreementRules(sB, disB, { write: false });
  say('TC17e', disB.disagreements === 0 && ruleB.rule !== 'over_40_percent',
    'CONTROL: a judge that agrees with the key fires nothing',
    `${disB.disagreements}/${disB.comparable}`);
  J.closeSweep({ sweep_id: sB, status: 'complete', rubric_version: RUBRIC });

  // (c) the defensive rule: an item the system already flagged can never be a violation
  const anyReq = grounded[0];
  run('UPDATE requirements SET grounded = 0 WHERE req_id = ?', [anyReq.req_id]);
  const sC = sweepOver([anyReq], 'unsupported');
  const disC = J.disagreementFor(sC);
  say('TC9a', disC.excluded.some((e) => e.item_id === anyReq.req_id) && disC.disagreements === 0,
    'a FLAGGED-ungrounded item the judge calls unsupported is not a violation',
    `${disC.excluded.length} excluded, ${disC.disagreements} disagreement(s)`);
  J.closeSweep({ sweep_id: sC, status: 'complete', rubric_version: RUBRIC });

  // ... and the control that proves the exclusion is doing the work rather than the row being
  // uninteresting: the SAME row, unflagged, IS counted.
  run('UPDATE requirements SET grounded = 1 WHERE req_id = ?', [anyReq.req_id]);
  run('DELETE FROM judge_scores WHERE item_id = ?', [anyReq.req_id]);
  const sD = sweepOver([anyReq], 'unsupported');
  const disD = J.disagreementFor(sD);
  say('TC9b', disD.excluded.length === 0 && disD.comparable === 1 && disD.disagreements === 1,
    'CONTROL: the same row, unflagged, IS counted — the exclusion is doing the work',
    `${disD.disagreements}/${disD.comparable}`);

  // (d) the small-denominator rule: one row cannot fire a 40% rule
  const ruleD = J.applyDisagreementRules(sD, disD, { write: false });
  say('TC20', ruleD.rule !== 'over_40_percent'
    && ruleD.reasons.some((r) => r.includes('NOT evaluated')),
    'a denominator below the floor does NOT fire the 40% rule, and says so',
    ruleD.reasons.join('; '));
  J.closeSweep({ sweep_id: sD, status: 'complete', rubric_version: RUBRIC });
}

// --- the three-consecutive rule, on numbers it cannot dodge ------------------------------------

// Three completed sweeps, each disagreeing on 1 row of 5 — 20%, so the FIRST rule cannot be
// what fires. Written straight into the table: what is under test is the rule, and building
// three real sweeps that each miss 40% by construction would be building the fixture twice.
run("DELETE FROM judge_sweeps WHERE status='complete'");
for (let i = 0; i < 3; i++) {
  run(`INSERT INTO judge_sweeps (trigger_source, status, judge_model, sample_size, comparable,
        disagreements, closed_at) VALUES ('cron','complete',?,5,5,1,datetime('now'))`, [J.JUDGE_MODEL]);
}
const streakSweep = get('SELECT MAX(sweep_id) AS id FROM judge_sweeps').id;
const streak = J.applyDisagreementRules(streakSweep, { comparable: 5, disagreements: 1, rows: [], excluded: [], not_comparable: 0 });
say('TC18a', streak.rule === 'three_consecutive',
  'three consecutive sweeps that each disagreed open a card, even under 40%', streak.reasons?.[0] ?? '');
say('TC18b', readdirSync(cards).some((f) => f.startsWith(streak.card)),
  'and the card is written', streak.card ?? '');

// THE CONTROL: break the streak and the rule must go quiet.
run("UPDATE judge_sweeps SET disagreements = 0 WHERE sweep_id = (SELECT MIN(sweep_id) FROM judge_sweeps WHERE status='complete')");
const quiet = J.applyDisagreementRules(streakSweep, { comparable: 5, disagreements: 1, rows: [], excluded: [], not_comparable: 0 }, { write: false });
say('TC18c', quiet.rule === null,
  'CONTROL: one clean sweep in the three and nothing fires', `rule=${quiet.rule}`);

// --- nothing else in the database moved -----------------------------------------------------------

const after = snapshot();
// The judge's own controls edited `requirements.grounded` above, so that table is compared by
// COUNT like the others: a sweep may not INSERT or DELETE anywhere outside judge_*.
const moved = otherTables.filter((t) => before[t] !== after[t]);
say('TC16', moved.length === 0,
  'a sweep writes to judge tables and nowhere else',
  moved.length ? moved.map((t) => `${t}: ${before[t]} -> ${after[t]}`).join(', ') : `${otherTables.length} table(s) unchanged`);

// Windows will not delete a file the process still has open, and the copy is open.
const { close } = await import('../db.mjs');
close();
try { rmSync(dir, { recursive: true, force: true }); } catch { /* a temp file outliving a run is not a result */ }

console.log(`\n${checks - failures}/${checks} checks passed`);
console.log('\nWHAT THIS DOES NOT TEST: whether Gemini answers well. That is not testable here and');
console.log('is not what the sweep claims — the claim is that its sample is honest, its lock holds,');
console.log('its rules fire on the numbers they are given, and none of it reaches a gate.');
if (failures) process.exitCode = 1;
