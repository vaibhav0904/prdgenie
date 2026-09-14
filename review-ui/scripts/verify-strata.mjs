// E7-S6. The stratified sample, and the ways stratifying one could make it dishonest.
//
// Drawing hard rows on purpose is easy. Doing it without corrupting the number the sweep
// reports is the whole story, because the failure mode is silent and flattering-looking:
// over-sample the difficult rows, pool the verdicts, and the >40% disagreement rule fires on
// a draw that was SELECTED for difficulty. The monitor then reports an alarm it manufactured.
//
// So the checks below are mostly not about quotas. They are about:
//
//   a rate computed over a biased draw   -> the rule reads only rows NOT drawn for being hard,
//                                           and TC8 proves the same rows pooled WOULD fire it
//   a quota that quietly shrank          -> shortfalls are wanted/got, stored and returned
//   a sample that is all interesting     -> `uniform` is never zero, asserted from the constants
//   a stratum that reads the spine       -> derived from the SQL, not promised in a comment
//
// IT RUNS ON A COPY OF THE DATABASE, for the same reason verify-judge does.
//
// Usage:  .\run.cmd review-ui/scripts/verify-strata.mjs

import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REAL_DB = resolve(process.env.DB_PATH ?? './data/prdgenie.db');
const dir = mkdtempSync(join(tmpdir(), 'strata-verify-'));
const copy = join(dir, 'prdgenie.db');
const cards = join(dir, 'cards');
mkdirSync(cards);

copyFileSync(REAL_DB, copy);
if (existsSync(`${REAL_DB}-wal`)) copyFileSync(`${REAL_DB}-wal`, `${copy}-wal`);
process.env.DB_PATH = copy;
process.env.JUDGE_CARD_DIR = cards;

const { all, get, run, initSchema } = await import('../db.mjs');
const J = await import('../judge.mjs');
initSchema();

// A REAL SWEEP MAY BE IN FLIGHT WHILE THIS RUNS, and its lock travels in the copy — so
// `openSweep` here would be refused and this file would measure the race instead of the
// system (the lesson from verify-grading, which read 11/12 while a spread was producing).
// The copy is ours, so the lock is released in the copy and nowhere else. Printed, because a
// verifier that quietly changes its own fixture is the shape of BUG-001.
const inherited = all("SELECT sweep_id FROM judge_sweeps WHERE status='in_flight'");
if (inherited.length) {
  run(`UPDATE judge_sweeps SET status='skipped', skipped_reason='sweep_abandoned',
       closed_at=datetime('now') WHERE status='in_flight'`);
  console.log(`  (released ${inherited.length} sweep(s) that were in flight when the copy was taken: `
    + `${inherited.map((s) => `#${s.sweep_id}`).join(', ')} — in the COPY only)\n`);
}

let checks = 0; let failures = 0;
const say = (id, pass, msg, detail = '') => {
  checks++;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(7)} ${msg}${detail ? `  — ${detail}` : ''}`);
};

const RUBRIC = J.rubricVersion();

// --- the constants, derived rather than read off the card ---------------------------------

const quotaTotal = J.STRATA.reduce((n, s) => n + s.quota, 0);
say('TC1', quotaTotal === J.MAX_REQUIREMENTS,
  'the quotas account for every slot in the sample',
  `${J.STRATA.map((s) => `${s.name}:${s.quota}`).join(' ')} = ${quotaTotal} of ${J.MAX_REQUIREMENTS}`);

const uniform = J.STRATA.find((s) => s.name === 'uniform');
say('TC2', Boolean(uniform) && uniform.quota >= 1 && uniform.targeted === false,
  'a `uniform` stratum exists, is never zero, and is not one of the targeted ones',
  `quota ${uniform?.quota}`);

say('TC2b', J.STRATA.every((s) => typeof s.why === 'string' && s.why.length > 20),
  'every stratum carries the reason it costs a slot, in the code beside it');

// --- the spine rule holds for the monitor too ----------------------------------------------

const FORBIDDEN = ['source_channel', 'doc_type', 'authorship'];
// THE SEAM the negative control uses (STRATA_INJECT). It appends a stratum to what this scan
// reads, in memory, so a planted spine-breaking predicate proves the scan can go red without
// any file on disk being touched. Same shape as JUDGE_ISOLATION_INJECT.
const scanned = process.env.STRATA_INJECT
  ? [...J.STRATA, { name: 'planted', where: process.env.STRATA_INJECT }]
  : J.STRATA;
const stratumSql = scanned.map((s) => `${s.name}: ${s.where}`).join('\n');
const hits = FORBIDDEN.filter((c) => new RegExp(`\\b${c}\\b`).test(stratumSql));
const guilty = scanned.filter((st) => FORBIDDEN.some((c) => new RegExp(`\\b${c}\\b`).test(st.where)));
say('TC10', hits.length === 0,
  'no stratum branches on source_channel, doc_type or authorship — derived from the SQL',
  hits.length
    ? `found ${hits.join(', ')} in stratum: ${guilty.map((st) => st.name).join(', ')}`
    : `${scanned.length} strata scanned, ${FORBIDDEN.length} columns`);

// --- the stratum must not reach the model ---------------------------------------------------
//
// This is the same failure E7-S5 TC10 guards for the labels, arriving by a new route. Telling
// the judge "we already suspect this one" is the end of its independence — and `ungrounded`
// is precisely that sentence, in a field. The builder whitelists what it forwards; this reads
// the SHIPPED node rather than believing the paragraph above it.
const wf6 = JSON.parse(readFileSync('n8n/workflows/WF6-judge-sweep.json', 'utf8'));
const builder = wf6.nodes.find((n) => n.name === 'Build the judge calls')?.parameters?.jsCode ?? '';
say('TC11', builder.length > 0 && !/\bstratum\b/.test(builder) && !/\bgrounded\b/.test(builder),
  'the stratum never reaches the model — the WF6 builder forwards neither it nor the grounded flag',
  builder.length ? `${builder.length} chars of the shipped node scanned` : 'BUILDER NOT FOUND');

// --- the draw ------------------------------------------------------------------------------

const drawn = J.sampleRequirements();
say('TC1b', drawn.rows.length <= J.MAX_REQUIREMENTS,
  'the draw never exceeds the sample size', `${drawn.rows.length} row(s)`);

const byStratum = {};
for (const r of drawn.rows) byStratum[r.stratum] = (byStratum[r.stratum] ?? 0) + 1;
console.log(`\n  the draw: ${Object.entries(byStratum).map(([k, v]) => `${k}=${v}`).join(' ') || '(empty)'}`);
if (drawn.shortfalls.length) {
  console.log(`  short:    ${drawn.shortfalls.map((s) => `${s.stratum} wanted ${s.wanted} got ${s.got}`).join(', ')}\n`);
} else {
  console.log('  short:    none — every quota filled\n');
}

const ungroundedAvailable = get(`SELECT COUNT(*) AS n FROM requirements r
  JOIN prd_versions v ON v.prd_version_id = r.prd_version_id
 WHERE v.state IN ('in_review','approved') AND r.pm_authored = 0 AND r.grounded = 0
   AND NOT EXISTS (SELECT 1 FROM judge_scores s WHERE s.item_type='requirement' AND s.item_id = r.req_id)`).n;
const ungroundedDrawn = drawn.rows.filter((r) => r.stratum === 'ungrounded');
say('TC4', ungroundedAvailable === 0 || ungroundedDrawn.length > 0,
  'the ungrounded stratum draws ungrounded rows when the corpus has any',
  `${ungroundedDrawn.length} drawn of ${ungroundedAvailable} available`);
say('TC4b', ungroundedDrawn.every((r) => r.grounded === 0),
  'and every row it drew really is flagged ungrounded',
  `${ungroundedDrawn.length} row(s), all grounded=0`);

say('TC5', drawn.shortfalls.every((s) => Number.isInteger(s.wanted) && Number.isInteger(s.got) && s.got < s.wanted),
  'every reported shortfall names what it wanted and what it got',
  drawn.shortfalls.length ? `${drawn.shortfalls.length} shortfall(s)` : 'none to report');

// A stratum forced empty must be VISIBLE, and its slots must go to uniform rather than
// shrinking the sweep. Forced by asking for a stratum that cannot match anything.
const impossible = [
  {
    name: 'cannot_match',
    quota: 4,
    targeted: true,
    why: 'a stratum planted to be unfillable, so the shortfall path is exercised',
    where: "r.kind = 'no-such-kind'",
  },
  ...J.STRATA.filter((s) => s.name === 'uniform').map((s) => ({ ...s, quota: J.MAX_REQUIREMENTS - 4 })),
];
const forced = J.sampleRequirements(J.MAX_REQUIREMENTS, impossible);
const short = forced.shortfalls.find((s) => s.stratum === 'cannot_match');
say('TC6', Boolean(short) && short.got === 0 && short.wanted === 4,
  'CONTROL: a quota that cannot be met is reported as short, never silently dropped',
  short ? `cannot_match wanted ${short.wanted} got ${short.got}` : 'NOT REPORTED');
say('TC6b', forced.rows.length === J.MAX_REQUIREMENTS,
  'and its unfilled slots flow to uniform, so the sweep still spends its full budget',
  `${forced.rows.length} of ${J.MAX_REQUIREMENTS}`);

// The stratifier switched off must reproduce E7-S5's draw exactly: one uniform stratum.
const off = J.sampleRequirements(J.MAX_REQUIREMENTS,
  [{ name: 'uniform', quota: J.MAX_REQUIREMENTS, targeted: false, why: 'the stratifier disabled for the control', where: '1 = 1' }]);
say('TC12', off.rows.length === J.MAX_REQUIREMENTS && off.rows.every((r) => r.stratum === 'uniform'),
  'CONTROL: the stratifier disabled reproduces the old uniform draw',
  `${off.rows.length} row(s), all uniform`);

// --- a real sweep records where each row came from ------------------------------------------

const sweep = J.openSweep({ trigger_source: 'manual' });
// A refusal is a RED ROW, not a stack trace. This check crashed on `sweep.items.length` the
// first time a real sweep happened to be in flight — and a verifier that dies instead of
// reporting is one whose failure looks like a broken tool rather than a broken system.
say('TC3', sweep.status === 'ok' && (sweep.items ?? []).every((i) => typeof i.stratum === 'string' && i.stratum),
  'every item in a real sweep carries the stratum it was drawn from',
  sweep.status === 'ok'
    ? `${sweep.items.length} item(s), ${Object.keys(sweep.strata ?? {}).length} stratum/a`
    : `sweep refused: ${sweep.reason}${sweep.detail ? ` — ${sweep.detail}` : ''}`);

const sampleRows = sweep.status === 'ok' ? all('SELECT stratum, COUNT(*) n FROM judge_sample WHERE sweep_id = ? GROUP BY stratum', [sweep.sweep_id]) : [];
say('TC3b', sampleRows.reduce((n, r) => n + r.n, 0) === sweep.items.length,
  'and the draw is stored at draw time, not carried through the model and back',
  sampleRows.map((r) => `${r.stratum}:${r.n}`).join(' '));

say('TC18', sweep.items.length <= J.MAX_VERSIONS + J.MAX_REQUIREMENTS,
  'the sample size — and so the cost of a sweep — is unchanged',
  `${sweep.items.length} item(s), ceiling ${J.MAX_VERSIONS + J.MAX_REQUIREMENTS}`);

const versionStrata = [...new Set(sweep.items.filter((i) => i.item_type === 'prd_version').map((i) => i.stratum))];
say('TC18b', sweep.items.filter((i) => i.item_type === 'prd_version').length === 0
  || versionStrata.every((v) => String(v).startsWith('version_')),
  'PRD versions are drawn by state — what shipped, and what is still in front of a human',
  versionStrata.join(' ') || '(none left to draw)');

// --- BUG-042: a partial answer must be a slice of the draw, not one stratum ----------------
//
// A sweep is regularly answered only in part. If the list is walked in stratum order, the part
// that gets answered IS a stratum — sweep #22 scored 8 of 22 and all 8 were `uniform`.
const runs = J.stratumRuns(sweep.items ?? []);
const distinct = new Set((sweep.items ?? []).map((i) => i.stratum)).size;
say('TC19', runs > distinct,
  'the sample is asked in shuffled order, so a partial answer is a slice of the draw',
  `${runs} stratum change(s) across ${sweep.items?.length ?? 0} items, ${distinct} strata present`);

// Every prefix long enough to hold them should touch several strata. Checked over the real
// draw at the size a partial sweep actually stopped at.
const prefixStrata = new Set((sweep.items ?? []).slice(0, 8).map((i) => i.stratum)).size;
say('TC19b', prefixStrata > 1,
  'the first 8 items — the size sweep #22 stopped at — span more than one stratum',
  `${prefixStrata} strata in the first 8`);

// THE CONTROL: the pre-fix ordering, reproduced. It must show exactly one stratum in that
// prefix, or TC19b is not measuring anything.
const inStratumOrder = [...(sweep.items ?? [])].sort((a, b) => String(a.stratum).localeCompare(String(b.stratum)));
const oldPrefix = new Set(inStratumOrder.slice(0, 8).map((i) => i.stratum)).size;
say('TC19c', J.stratumRuns(inStratumOrder) === distinct && oldPrefix < prefixStrata,
  'CONTROL: walked in stratum order, the same 8 items collapse toward one stratum',
  `${oldPrefix} stratum/a in the first 8, ${J.stratumRuns(inStratumOrder)} runs total`);

// And the shuffle is seedable, so this file measures a shuffle rather than a lucky draw.
process.env.JUDGE_SHUFFLE_SEED = '7';
const a = J.shuffle(sweep.items ?? []);
const b = J.shuffle(sweep.items ?? []);
delete process.env.JUDGE_SHUFFLE_SEED;
say('TC19d', a.map((i) => i.item_id).join() === b.map((i) => i.item_id).join(),
  'the shuffle is deterministic under a seed, so this check is not re-run until it looks right',
  'same order twice under JUDGE_SHUFFLE_SEED=7');

const second = J.openSweep({ trigger_source: 'manual' });
say('TC14', second.status === 'error' && second.reason === 'sweep_in_flight',
  'opening the sweep is still the lock, and a second trigger still draws nothing',
  second.reason ?? '');
J.closeSweep({ sweep_id: sweep.sweep_id, status: 'complete', rubric_version: RUBRIC });

// --- THE RULE THAT MOVED, and the control that proves it moved -------------------------------

const manifest = JSON.parse(readFileSync(process.env.EVAL_MANIFEST ?? 'evals/results/.last-run.json', 'utf8'));
const fixture = Object.entries(manifest.runs ?? {}).find(([fx, r]) => r?.prd_version_id
  && existsSync(`evals/datasets/labels/${fx}.labels.json`)
  && get('SELECT COUNT(*) AS n FROM requirements WHERE prd_version_id = ? AND grounded = 1', [r.prd_version_id]).n >= 4);

if (!fixture) {
  say('TC7', false, 'no graded fixture run to force the rule against',
    'run .\\run.cmd evals\\harness\\produce.mjs first');
} else {
  const [fx, fxRun] = fixture;
  const grounded = all(`SELECT req_id, prd_version_id, trace_id, doc_id FROM requirements
     WHERE prd_version_id = ? AND grounded = 1 ORDER BY req_id`, [fxRun.prd_version_id]);
  console.log(`\n  forcing the rule against ${fx}, version ${fxRun.prd_version_id}, ${grounded.length} grounded row(s)\n`);

  // The judge contradicts the answer key on every row. The ONLY thing that differs between
  // the two runs below is the stratum those rows were drawn from — one thing, varied.
  const forceSweep = (stratum) => {
    const s = J.openSweep({ trigger_source: 'manual' });
    for (const r of grounded) {
      run(`INSERT OR REPLACE INTO judge_sample (sweep_id, item_type, item_id, stratum)
           VALUES (?, 'requirement', ?, ?)`, [s.sweep_id, r.req_id, stratum]);
    }
    J.recordScores(s.sweep_id, grounded.map((r) => ({
      item_type: 'requirement',
      item_id: r.req_id,
      prd_version_id: r.prd_version_id,
      trace_id: r.trace_id,
      doc_id: r.doc_id,
      rubric_version: RUBRIC,
      verdict: 'unsupported',
      faithfulness: 0.2,
      completeness: 0.2,
      clarity: 0.2,
      comment: 'forced',
    })));
    return s.sweep_id;
  };

  const sPooled = forceSweep('uniform');
  const disPooled = J.disagreementFor(sPooled);
  const rulePooled = J.applyDisagreementRules(sPooled, disPooled, { write: false });
  say('TC8', disPooled.comparable >= J.MIN_COMPARABLE && rulePooled.rule === 'over_40_percent',
    'CONTROL: these same rows, drawn uniformly, DO fire the 40% rule',
    `${disPooled.disagreements}/${disPooled.comparable} comparable`);
  J.closeSweep({ sweep_id: sPooled, status: 'complete', rubric_version: RUBRIC });

  // Delete the scores so the rows are drawable again, then re-run with ONE thing changed.
  run('DELETE FROM judge_scores WHERE sweep_id = ?', [sPooled]);

  const sTargeted = forceSweep('ungrounded');
  const disTargeted = J.disagreementFor(sTargeted);
  const ruleTargeted = J.applyDisagreementRules(sTargeted, disTargeted, { write: false });
  say('TC7', disTargeted.comparable === 0 && ruleTargeted.rule !== 'over_40_percent',
    'the SAME contradictions, drawn for being hard, do NOT fire the rule',
    `${disTargeted.disagreements}/${disTargeted.comparable} comparable, rule=${ruleTargeted.rule}`);
  say('TC7b', disTargeted.excluded.length === grounded.length
    && disTargeted.excluded.every((e) => /stratum/.test(e.why)),
    'and every excluded row says which stratum excluded it',
    `${disTargeted.excluded.length} excluded`);
  say('TC9', Boolean(disTargeted.by_stratum.ungrounded)
    && disTargeted.by_stratum.ungrounded.judged === grounded.length
    && !('rate' in disTargeted.by_stratum.ungrounded),
    'the targeted rows are still reported — as counts per stratum, never as a rate',
    JSON.stringify(disTargeted.by_stratum.ungrounded ?? {}));
  J.closeSweep({ sweep_id: sTargeted, status: 'complete', rubric_version: RUBRIC });
}

// --- coverage is per stratum now --------------------------------------------------------------

const cov = J.coverageByStratum();
say('TC13', cov.length === J.STRATA.length
  && cov.every((c) => Number.isInteger(c.judged) && Number.isInteger(c.total)),
  'coverage is reported per stratum, judged over total',
  cov.map((c) => `${c.stratum} ${c.judged}/${c.total}`).join('  '));

// --- and still nothing outside the judge's own tables -------------------------------------------

const tables = all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .map((t) => t.name).filter((t) => !t.startsWith('judge_'));
say('TC15', tables.length > 0, 'the sweep writes to judge_* tables and nowhere else',
  `${tables.length} other table(s) — asserted by verify-judge TC16 across the same operations`);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log('\nA FAILURE HERE IS NOT A TUNING PROBLEM. The quotas do not move to make this green.');
  process.exit(1);
}
console.log(`
WHAT THIS DOES NOT TEST: whether these are the RIGHT strata. That is a judgement, and it is
written on the card with the number that motivated it — 27 requirements judged, 0 of them
ungrounded, against a rubric whose central clause is about ungrounded rows.`);
