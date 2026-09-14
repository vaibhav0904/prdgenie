// THE JUDGE SWEEP (E7-S5): a second opinion that gates nothing.
//
// Everything here is the part of the sweep that must not be left to a workflow: which rows
// are drawn, how many, whether a sweep may start at all, what counts as a disagreement, and
// when that disagreement becomes a card somebody has to answer. n8n calls a provider and
// carries envelopes; the rules live in code, where a test can force them.
//
// FOUR THINGS COULD MAKE THIS SIGNAL DISHONEST, and each has an answer in this file:
//
//   a sample that is not random          -> ORDER BY RANDOM() in SQL, bounded, over rows with
//                                           no score yet; never a hand-picked list
//   a sweep that counts a row twice      -> opening the sweep IS the lock (one in_flight row)
//   a judge that has seen the answer key -> the labels are read HERE, after the fact, and
//                                           never travel to the model (verify-judge TC10)
//   a failure that looks like a pass     -> a sweep that got no opinion closes `skipped` with
//                                           a reason, and a skipped sweep is not a clean one
//
// AND THE FIFTH, which is the story's title: nothing in this file is read by a gate. The
// scores reach a page and a command and stop there. `verify-judge-isolation.mjs` proves it
// from a derived file list rather than from this paragraph.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { all, get, run, tx } from './db.mjs';
import { PROVIDER_REASONS } from './llm-errors.mjs';
import { matchRequirements } from '../evals/harness/match.mjs';
import { resolveLabels } from '../evals/harness/labels.mjs';

/**
 * Why a sweep closed `skipped` — the fourth reason vocabulary, and the only one that was
 * written in `docs/contracts.md` §9 before it was written in code (BUG-050).
 *
 * A skip is not a failure of the run and not a refusal of a call: the sweep opened, drew its
 * sample, and could not come back with opinions. Either the provider would not answer — the
 * §5 codes, reused verbatim rather than paraphrased, so an operator reads one vocabulary —
 * or one of the three conditions below.
 *
 * Derived from `PROVIDER_REASONS` rather than retyped: §9 says "a provider reason code from
 * §5's set", and a copy of that list here would be a second place to forget when the set
 * grows (BUG-036 grew it once already).
 */
export const SKIP_REASONS = Object.freeze([
  ...PROVIDER_REASONS,
  // opened, never closed, and the next sweep found it past ABANDON_AFTER_MS
  'sweep_abandoned',
  // every row already has a score — a real answer, and not an error
  'nothing_left_to_judge',
  // the sample, the calls and the replies were not the same length. The sweep would rather
  // say nothing than attach an opinion to the wrong row.
  'judge_misaligned',
]);

export const RUBRIC_FILE = 'n8n/prompts/judge-item.md';
// What the sweep EXPECTS to call. It is not the record: WF0 chooses the model, and the sweep
// row stores what actually answered, read off the call. Two places naming a model is two
// places that can disagree, and on 2026-09-03 they did.
export const JUDGE_MODEL = 'gemini-3.8-flash';

// The bounds, from PRD-E7 Q3. They are constants rather than settings: a sample size that
// can be raised for one sweep is a sample size that means nothing across sweeps.
export const MAX_VERSIONS = 2;
export const MAX_REQUIREMENTS = 20;

// --- the strata: which rows the money is spent on (E7-S6) ----------------------------------
//
// A uniform draw of twenty is a fair sample of a corpus that is 98.5% grounded, which means
// it is almost never a sample of the case the rubric was written for. On 2026-09-04, after
// twenty-seven requirements had been judged, ZERO of them were ungrounded -- and "a flagged
// ungrounded item is never a violation" is the rubric's central defensive clause.
//
// So the sample is drawn by quota instead. Two rules keep that from becoming a lie:
//
//   1. `uniform` is never zero. A sample made only of interesting rows describes nothing.
//   2. A row drawn BECAUSE it is hard does not count toward the disagreement rate. Otherwise
//      the sampler manufactures its own alarm: over-sample the difficult rows, pool the
//      result, and >40% fires on a draw that was chosen for being difficult.
//
// No stratum reads `source_channel`, `doc_type` or `authorship` -- the spine rule holds for
// the monitor too, and `verify-strata.mjs` derives that from the SQL rather than trusting
// this paragraph. Every stratum below is an OUTCOME property: what the grounding code
// decided, what a human decided, what kind of requirement it is.
//
// Quotas are constants for the same reason MAX_REQUIREMENTS is: a quota that can be raised
// for one sweep is a quota that means nothing across sweeps.
export const STRATA = [
  {
    name: 'ungrounded',
    quota: 4,
    targeted: true,
    why: 'the code could not find the evidence. The defensive clause exists for these rows and had never once been applied to one',
    where: 'r.grounded = 0',
  },
  {
    name: 'approved_anyway',
    quota: 2,
    targeted: true,
    why: 'the system said it could not find the evidence and a person shipped it regardless -- the highest-stakes rows in the database',
    where: `EXISTS (SELECT 1 FROM review_actions a
                     WHERE a.item_type='requirement' AND a.item_id = r.req_id
                       AND a.decision = 'approve_ungrounded')`,
  },
  {
    name: 'human_edited',
    quota: 2,
    targeted: true,
    why: 'a PM rewrote the sentence. Where the judge lands relative to that edit is the one place its opinion is worth something',
    where: `EXISTS (SELECT 1 FROM review_actions a
                     WHERE a.item_type='requirement' AND a.item_id = r.req_id
                       AND a.decision = 'edit')`,
  },
  {
    name: 'nonfunctional',
    quota: 3,
    targeted: true,
    why: 'the kind the extraction is weakest at, and the kind a uniform draw under-represents',
    where: "r.kind = 'nonfunctional'",
  },
  {
    name: 'constraint',
    quota: 3,
    targeted: true,
    why: 'a constraint read as a feature is the kind-confusion family this project spends its prompt budget on (BUG-030/037)',
    where: "r.kind = 'constraint'",
  },
  {
    name: 'uniform',
    quota: 6,
    targeted: false,
    why: 'the population sample. It absorbs every unfilled quota, and it is the ONLY stratum the disagreement rate is computed over',
    where: '1 = 1',
  },
];

/** The strata drawn for being hard. Their rows are judged and reported, never counted as a rate. */
export const TARGETED_STRATA = STRATA.filter((s) => s.targeted).map((s) => s.name);

// The quotas must account for every slot, or the sample size on the row is not the sample.
// Derived, not typed: changing a quota above without changing MAX_REQUIREMENTS fails here.
const QUOTA_TOTAL = STRATA.reduce((n, s) => n + s.quota, 0);
if (QUOTA_TOTAL !== MAX_REQUIREMENTS) {
  throw new Error(`strata quotas sum to ${QUOTA_TOTAL}, but MAX_REQUIREMENTS is ${MAX_REQUIREMENTS}`);
}

/**
 * Draw the requirement sample stratum by stratum.
 *
 * Each stratum draws at random from the rows it is about that no earlier stratum already
 * took and that no sweep has judged. A stratum that cannot fill its quota REPORTS the
 * shortfall -- wanted n, got m -- and the unfilled slots flow to `uniform`, so the sweep
 * still spends its full budget and the coverage claim stays true. A quota that quietly
 * shrinks is the defect BUG-003/019/032 are all instances of.
 */
export function sampleRequirements(limit = MAX_REQUIREMENTS, strata = STRATA) {
  const picked = [];
  const seen = new Set();
  const shortfalls = [];
  let carried = 0;

  const base = `
      FROM requirements r
      JOIN prd_versions v ON v.prd_version_id = r.prd_version_id
     WHERE v.state IN ('in_review','approved')
       AND r.pm_authored = 0
       AND NOT EXISTS (SELECT 1 FROM judge_scores s
                        WHERE s.item_type='requirement' AND s.item_id = r.req_id)`;

  for (const s of strata) {
    // `uniform` last, and it takes every slot the targeted strata could not fill.
    const want = Math.min(s.quota + (s.targeted ? 0 : carried), Math.max(0, limit - picked.length));
    if (want === 0) { shortfalls.push({ stratum: s.name, wanted: s.quota, got: 0 }); continue; }
    const exclude = seen.size ? ` AND r.req_id NOT IN (${[...seen].map(() => '?').join(',')})` : '';
    const rows = all(`
      SELECT r.req_id, r.doc_id, r.trace_id, r.prd_version_id, r.kind, r.subject,
             r.statement, r.grounded
        ${base}
       AND (${s.where})${exclude}
       ORDER BY RANDOM() LIMIT ?`, [...seen, want]);
    for (const r of rows) { seen.add(r.req_id); picked.push({ ...r, stratum: s.name }); }
    if (rows.length < want) {
      shortfalls.push({ stratum: s.name, wanted: want, got: rows.length });
      if (s.targeted) carried += want - rows.length;
    }
  }
  return { rows: picked, shortfalls, quota_total: QUOTA_TOTAL };
}

// A sweep whose process died must not lock out every future sweep. Thirty minutes is far
// longer than a sweep takes (twenty-two small calls) and far shorter than a day, so the
// nightly cron can never be blocked by yesterday's corpse. Releasing one is RECORDED as a
// skip with its own reason -- a lock that clears itself silently is a lock nobody can audit.
export const ABANDON_AFTER_MS = 30 * 60 * 1000;

// The disagreement rules, decided by Vaibhav on 2026-09-02 and written here so they are
// mechanical rather than a judgement made when firing them is inconvenient.
export const DISAGREEMENT_RATE = 0.40;   // > 40% of comparable rows in ONE sweep
export const CONSECUTIVE_SWEEPS = 3;     // ... or a disagreement in each of three in a row
// The 40% rule is not evaluated below this many comparable rows. Two rows can only produce
// 0%, 50% or 100%, and a rule that fires on one item out of two is measuring the draw
// (docs/reporting.md, the same reason the weekly report caveats a small denominator).
export const MIN_COMPARABLE = 3;

/** The rubric's content hash -- the same 12 hex characters sync-prompts.mjs stamps. */
export function rubricVersion(file = RUBRIC_FILE) {
  if (!existsSync(file)) return null;
  return createHash('sha256').update(readFileSync(file, 'utf8')).digest('hex').slice(0, 12);
}

// --- opening: the sample AND the lock, in one transaction ---------------------------------

/**
 * Draw a bounded random sample of unjudged output and open a sweep over it.
 *
 * Sampling and locking are one operation on purpose. If a caller could sample and then
 * decide whether to open, two callers could sample the same rows -- which is the exact
 * failure `trigger_source` exists to make visible, arriving by a different route.
 *
 * Returns { status:'ok', sweep_id, items, ... } or { status:'error', reason:'sweep_in_flight' }.
 */
export function openSweep({ trigger_source = 'manual', now = Date.now() } = {}) {
  if (!['cron', 'manual'].includes(trigger_source)) {
    return { status: 'error', reason: 'envelope_invalid', missing: ['trigger_source'] };
  }

  const released = releaseAbandoned(now);

  const inFlight = get("SELECT sweep_id, opened_at, trigger_source FROM judge_sweeps WHERE status='in_flight'");
  if (inFlight) {
    // Refused, and the refusal names the sweep in the way. Two overlapping sweeps would
    // double-sample rows and inflate coverage (PRD-E7 Q3).
    return {
      status: 'error',
      reason: 'sweep_in_flight',
      missing: [],
      detail: `sweep ${inFlight.sweep_id} (${inFlight.trigger_source}) opened ${inFlight.opened_at} has not closed`,
      sweep_id: inFlight.sweep_id,
    };
  }

  // One that shipped and one still in front of a human, rather than two of whichever is
  // commoner -- there are 32 approved versions against 1,004 in review, so a uniform pair is
  // an in_review pair roughly always, and the approved ones are what anybody would defend.
  const versions = [];
  for (const [stratum, state] of [['version_approved', 'approved'], ['version_in_review', 'in_review']]) {
    const taken = versions.map((v) => v.prd_version_id);
    const rows = all(`
    SELECT v.prd_version_id, v.trace_id, v.content
      FROM prd_versions v
     WHERE v.state = ?
       ${taken.length ? `AND v.prd_version_id NOT IN (${taken.map(() => '?').join(',')})` : ''}
       AND NOT EXISTS (SELECT 1 FROM judge_scores s
                        WHERE s.item_type='prd_version'
                          AND s.item_id = CAST(v.prd_version_id AS TEXT))
     ORDER BY RANDOM() LIMIT ?`,
    [state, ...taken, 1]);
    for (const r of rows) versions.push({ ...r, stratum });
  }
  // If one state had nothing left, the other fills the pair -- the budget is spent either way.
  if (versions.length < MAX_VERSIONS) {
    const taken = versions.map((v) => v.prd_version_id);
    const rows = all(`
    SELECT v.prd_version_id, v.trace_id, v.content, v.state
      FROM prd_versions v
     WHERE v.state IN ('in_review','approved')
       ${taken.length ? `AND v.prd_version_id NOT IN (${taken.map(() => '?').join(',')})` : ''}
       AND NOT EXISTS (SELECT 1 FROM judge_scores s
                        WHERE s.item_type='prd_version'
                          AND s.item_id = CAST(v.prd_version_id AS TEXT))
     ORDER BY RANDOM() LIMIT ?`,
    [...taken, MAX_VERSIONS - versions.length]);
    for (const r of rows) versions.push({ ...r, stratum: `version_${r.state}` });
  }

  // pm_authored requirements are excluded: a PM's own sentence is not the system's output,
  // and asking a judge whether the source supports it would score the wrong author (E4-S6).
  // The draw is STRATIFIED (E7-S6): see STRATA above for what each slot buys and why.
  const { rows: requirements, shortfalls } = sampleRequirements();

  const items = [];
  const skippedItems = [];

  for (const v of versions) {
    const doc = documentFor(v.trace_id);
    if (!doc) { skippedItems.push({ item_id: String(v.prd_version_id), why: 'no source document' }); continue; }
    items.push({
      item_type: 'prd_version',
      item_id: String(v.prd_version_id),
      prd_version_id: v.prd_version_id,
      trace_id: v.trace_id,
      doc_id: doc.doc_id,
      stratum: v.stratum,
      grounded: null,
      artefact: summariseVersion(v.content),
      source_text: doc.raw_text,
    });
  }

  for (const r of requirements) {
    const doc = get('SELECT doc_id, raw_text FROM source_documents WHERE doc_id = ?', [r.doc_id]);
    if (!doc) { skippedItems.push({ item_id: r.req_id, why: 'no source document' }); continue; }
    const citations = all('SELECT quote FROM citations WHERE req_id = ?', [r.req_id]).map((c) => c.quote);
    items.push({
      item_type: 'requirement',
      item_id: r.req_id,
      prd_version_id: r.prd_version_id,
      trace_id: r.trace_id,
      doc_id: doc.doc_id,
      stratum: r.stratum,
      grounded: r.grounded,
      artefact: JSON.stringify({ kind: r.kind, subject: r.subject, statement: r.statement, citations }, null, 1),
      source_text: doc.raw_text,
    });
  }

  // AN EMPTY SAMPLE NEVER TAKES THE LOCK. There is nothing to judge, so there is nothing to
  // hold open — and an in_flight sweep with no items would refuse every later trigger until
  // it timed out, which is a lock-out caused by having nothing to do.
  const empty = items.length === 0;

  const res = run(`INSERT INTO judge_sweeps
      (trigger_source, status, judge_model, sample_size, versions_sampled, requirements_sampled,
       skipped_reason, closed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  [trigger_source, empty ? 'complete' : 'in_flight', JUDGE_MODEL, items.length,
    items.filter((i) => i.item_type === 'prd_version').length,
    items.filter((i) => i.item_type === 'requirement').length,
    empty ? 'nothing_left_to_judge' : null,
    empty ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null]);

  const sweepId = Number(res.lastInsertRowid);
  for (const i of items) {
    run('INSERT INTO judge_sample (sweep_id, item_type, item_id, stratum) VALUES (?,?,?,?)',
      [sweepId, i.item_type, i.item_id, i.stratum ?? 'uniform']);
  }
  // The shortfalls are stored, not just returned. A stratum that could not be filled is a
  // coverage fact about this sweep, and next week nobody will have the console output.
  if (shortfalls.length) {
    run('UPDATE judge_sweeps SET shortfalls = ? WHERE sweep_id = ?',
      [JSON.stringify(shortfalls), sweepId]);
  }

  // BUG-042. The DRAW is stored above, in stratum order, because that is the record of what
  // was asked about. The ASKING is shuffled, because a sweep is regularly answered only in
  // part -- the provider runs out mid-list -- and a list in stratum order means the part that
  // gets answered is one stratum rather than a slice of the sample. Sweep #22 scored 8 of 22
  // and every one of the 8 was `uniform`.
  //
  // Not "valuable strata first", which is the tempting version: that would systematically
  // OVER-represent them whenever quota is short, and the per-stratum coverage figures would
  // start describing the provider's mood instead of the corpus. Random is the only order that
  // degrades into a subset of the draw.
  const asked = shuffle(items);

  return {
    status: 'ok',
    sweep_id: sweepId,
    trigger_source,
    judge_model: JUDGE_MODEL,
    // Travels with the sample so every figure derived from it carries its own denominator,
    // for the same reason C6's does (PRD-E7).
    sample_size: items.length,
    nothing_to_judge: empty,
    released_abandoned: released,
    unjudged_remaining: unjudgedRemaining(),
    skipped_items: skippedItems,
    // wanted vs got, per stratum. Printed by every caller: a quota that quietly shrank is
    // the same defect as a denominator that quietly shrank.
    shortfalls,
    strata: countBy(items),
    items: asked,
  };
}

/**
 * Fisher-Yates, on a copy. `JUDGE_SHUFFLE_SEED` makes it deterministic for tests -- a check
 * on a shuffle that has to be re-run until it looks right is a check that measures the draw
 * (docs/reporting.md). Setting the seed in production would defeat the point, so nothing
 * sets it but the tests, and `verify-strata` asserts the unseeded path is not in stratum order.
 */
export function shuffle(list) {
  const seed = process.env.JUDGE_SHUFFLE_SEED;
  let rnd = Math.random;
  if (seed !== undefined) {
    // xorshift32: small, deterministic, and good enough to order twenty-two items.
    let x = (Number(seed) | 0) || 0x9e3779b9;
    rnd = () => {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      return ((x >>> 0) % 100000) / 100000;
    };
  }
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** How many times the stratum changes as you walk a list. In stratum order this is the number
 *  of strata; shuffled it is much higher. The metric TC19 asserts on, so "shuffled" is a
 *  measurement rather than an impression. */
export function stratumRuns(items) {
  let runs = 0;
  let prev = null;
  for (const i of items) {
    if (i.stratum !== prev) { runs++; prev = i.stratum; }
  }
  return runs;
}

/** The document a run was about. A trace has exactly one. */
function documentFor(traceId) {
  return get('SELECT doc_id, raw_text FROM source_documents WHERE trace_id = ? ORDER BY created_at LIMIT 1',
    [traceId]);
}

/**
 * What the judge is shown of an assembled PRD: its titles, its requirement statements and
 * its stories. Not the whole JSON -- ids, scores and states are the system's bookkeeping,
 * and a judge asked to read them is being invited to have an opinion about a gate.
 */
function summariseVersion(content) {
  let prd;
  try { prd = JSON.parse(content); } catch { return String(content).slice(0, 4000); }
  const lines = [];
  for (const e of prd.epics ?? []) {
    lines.push(`EPIC ${e.title ?? ''}`.trim());
    for (const f of e.features ?? []) {
      lines.push(`  FEATURE ${f.title ?? ''}`.trim());
      for (const s of f.stories ?? []) lines.push(`    STORY as a ${s.as_a}, I want ${s.i_want}, so that ${s.so_that}`);
    }
  }
  for (const r of prd.requirements ?? []) lines.push(`REQUIREMENT [${r.kind}] ${r.statement}`);
  for (const q of prd.open_questions ?? []) lines.push(`OPEN QUESTION ${q.question}`);
  return lines.join('\n').slice(0, 12000);
}

function releaseAbandoned(now) {
  const stale = all("SELECT sweep_id, opened_at FROM judge_sweeps WHERE status='in_flight'")
    .filter((s) => now - Date.parse(`${s.opened_at.replace(' ', 'T')}Z`) > ABANDON_AFTER_MS);
  for (const s of stale) {
    run(`UPDATE judge_sweeps SET status='skipped', skipped_reason='sweep_abandoned',
         closed_at=datetime('now') WHERE sweep_id = ?`, [s.sweep_id]);
  }
  return stale.map((s) => s.sweep_id);
}

/**
 * Coverage PER STRATUM (E7-S6): judged and total, for each stratum the sampler draws from.
 *
 * One corpus-wide percentage stopped describing anything the moment 1.5% of the corpus
 * became 20% of the sample. "6,758 never judged" is true and says nothing about whether the
 * defensive clause has ever been exercised; "ungrounded: 0 of 108" says exactly that, and it
 * is the number that made this story exist.
 */
export function coverageByStratum() {
  const base = `FROM requirements r
      JOIN prd_versions v ON v.prd_version_id = r.prd_version_id
     WHERE v.state IN ('in_review','approved') AND r.pm_authored = 0`;
  return STRATA.map((st) => {
    const total = get(`SELECT COUNT(*) AS n ${base} AND (${st.where})`).n;
    const judged = get(`SELECT COUNT(*) AS n ${base} AND (${st.where})
        AND EXISTS (SELECT 1 FROM judge_scores s
                     WHERE s.item_type='requirement' AND s.item_id = r.req_id)`).n;
    return { stratum: st.name, quota: st.quota, targeted: st.targeted, judged, total, why: st.why };
  });
}

export function unjudgedRemaining() {
  return {
    prd_versions: get(`SELECT COUNT(*) AS n FROM prd_versions v
       WHERE v.state IN ('in_review','approved')
         AND NOT EXISTS (SELECT 1 FROM judge_scores s WHERE s.item_type='prd_version'
                          AND s.item_id = CAST(v.prd_version_id AS TEXT))`).n,
    requirements: get(`SELECT COUNT(*) AS n FROM requirements r
       JOIN prd_versions v ON v.prd_version_id = r.prd_version_id
      WHERE v.state IN ('in_review','approved') AND r.pm_authored = 0
        AND NOT EXISTS (SELECT 1 FROM judge_scores s WHERE s.item_type='requirement'
                         AND s.item_id = r.req_id)`).n,
  };
}

// --- the scores ----------------------------------------------------------------------------

/**
 * Store what the judge said. Nothing here writes anywhere but judge_scores: a sweep that
 * could change a requirement would be a gate wearing a monitor's clothes.
 */
export function recordScores(sweepId, scores = []) {
  const sweep = get('SELECT * FROM judge_sweeps WHERE sweep_id = ?', [sweepId]);
  if (!sweep) return { status: 'error', reason: 'unknown_sweep', missing: ['sweep_id'] };
  if (sweep.status !== 'in_flight') {
    return { status: 'error', reason: 'sweep_not_in_flight', missing: [], detail: sweep.status };
  }

  let stored = 0;
  const rejected = [];
  tx(() => {
    for (const s of scores) {
      if (!s.item_type || !s.item_id || !s.verdict) { rejected.push({ item_id: s.item_id ?? null, why: 'incomplete' }); continue; }
      if (!['supported', 'unsupported', 'cannot_tell'].includes(s.verdict)) {
        rejected.push({ item_id: s.item_id, why: `verdict "${s.verdict}" is not in the closed set` });
        continue;
      }
      // The grounded flag AT JUDGE TIME, copied from the row rather than from the model:
      // the defensive rule below is applied to what the system had already flagged when it
      // asked, not to what the flag says whenever somebody reads the score.
      // Which stratum this row was drawn from, read off OUR sample. A row that is not in
      // this sweep's sample (the forced-disagreement tests inject such rows deliberately) is
      // recorded as 'unlisted' rather than blank -- and 'unlisted' still counts toward the
      // disagreement rate, because only rows chosen FOR being hard are excluded from it.
      const stratum = get('SELECT stratum FROM judge_sample WHERE sweep_id = ? AND item_type = ? AND item_id = ?',
        [sweepId, s.item_type, String(s.item_id)])?.stratum ?? 'unlisted';
      const grounded = s.item_type === 'requirement'
        ? get('SELECT grounded FROM requirements WHERE req_id = ?', [s.item_id])?.grounded ?? null
        : null;
      run(`INSERT INTO judge_scores (sweep_id, trace_id, doc_id, prd_version_id, item_type,
             item_id, rubric_version, faithfulness, completeness, clarity, verdict,
             grounded_at_judge_time, stratum, comment)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [sweepId, s.trace_id ?? null, s.doc_id ?? null, s.prd_version_id ?? null,
        s.item_type, String(s.item_id), s.rubric_version ?? null,
        num(s.faithfulness), num(s.completeness), num(s.clarity), s.verdict,
        grounded, stratum, typeof s.comment === 'string' ? s.comment.slice(0, 2000) : null]);
      stored++;
    }
    run('UPDATE judge_sweeps SET scored = scored + ? WHERE sweep_id = ?', [stored, sweepId]);
    if (scores.length && scores[0].rubric_version) {
      run('UPDATE judge_sweeps SET rubric_version = ? WHERE sweep_id = ?',
        [scores[0].rubric_version, sweepId]);
    }
  });
  return { status: 'ok', stored, rejected };
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** stratum -> how many items of it are in this draw. */
function countBy(items) {
  const out = {};
  for (const i of items) out[i.stratum ?? 'uniform'] = (out[i.stratum ?? 'uniform'] ?? 0) + 1;
  return out;
}

// --- the answer key, read after the fact ----------------------------------------------------

const MANIFEST = process.env.EVAL_MANIFEST ?? 'evals/results/.last-run.json';
const LABELS_DIR = 'evals/datasets/labels';

/**
 * What the answer key says about each judged requirement, and where the judge differs.
 *
 * Only fixtures have an answer key, so only requirements from a fixture run are COMPARABLE.
 * Everything else is counted and named as not comparable rather than treated as agreement --
 * a denominator that silently shrinks to the rows that agree is the oldest way to be green.
 *
 * THE DEFENSIVE RULE (PRD-E7): an item the system itself flagged ungrounded is never a
 * violation. It is excluded here, in code, rather than in the rubric -- the model is asked
 * what the source supports, and is never told what we already suspect, because a judge told
 * the answer is no longer independent.
 *
 * THE SAMPLING RULE (E7-S6): a row drawn BECAUSE it is hard is excluded too. Since the sample
 * became stratified, five of every twenty rows are chosen for being difficult -- and pooling
 * them into one rate would let the sampler manufacture its own alarm, firing the >40% rule on
 * a draw that was selected for difficulty. Those rows are judged, stored and reported PER
 * STRATUM as counts; they never enter a rate. Exclusion is by targeted stratum rather than by
 * inclusion of 'uniform', so a row of unknown provenance still counts -- the conservative
 * direction, where the alarm can fire more easily rather than less.
 */
export function disagreementFor(sweepId) {
  const scores = all("SELECT * FROM judge_scores WHERE sweep_id = ? AND item_type='requirement'", [sweepId]);
  const out = {
    comparable: 0, disagreements: 0, rows: [], excluded: [], not_comparable: 0,
    // What the targeted strata said, kept beside the rate and never folded into it.
    by_stratum: {},
  };
  if (!scores.length) return out;

  const byDoc = fixturesByDoc();
  const cache = new Map();

  for (const s of scores) {
    const stratum = s.stratum ?? 'unlisted';
    if (s.grounded_at_judge_time === 0) {
      // Flagged by the system before the judge ever saw it. Not a violation, by rule.
      out.excluded.push({ item_id: s.item_id, why: 'flagged ungrounded by the system', stratum });
      tally(out.by_stratum, stratum, s.verdict);
      continue;
    }
    if (TARGETED_STRATA.includes(stratum)) {
      // Judged, stored and reported -- but drawn for being hard, so not part of the rate.
      out.excluded.push({ item_id: s.item_id, why: `drawn from the '${stratum}' stratum`, stratum });
      tally(out.by_stratum, stratum, s.verdict);
      continue;
    }
    const fixture = byDoc.get(s.doc_id);
    if (!fixture) { out.not_comparable++; continue; }

    if (!cache.has(s.prd_version_id)) cache.set(s.prd_version_id, keyVerdicts(fixture, s.prd_version_id, s.doc_id));
    const key = cache.get(s.prd_version_id);
    const keyVerdict = key?.get(s.item_id) ?? null;
    if (!keyVerdict) { out.not_comparable++; continue; }

    out.comparable++;
    tally(out.by_stratum, stratum, s.verdict);
    // The judge and the key are compared on ONE question: does the source support this
    // statement. `cannot_tell` is not a disagreement -- an honest abstention is the answer
    // a defensive rubric is supposed to allow.
    const disagrees = (s.verdict === 'unsupported' && keyVerdict === 'supported')
      || (s.verdict === 'supported' && keyVerdict === 'unsupported');
    if (disagrees) out.disagreements++;
    out.rows.push({ item_id: s.item_id, fixture, judge: s.verdict, answer_key: keyVerdict, disagrees });
  }
  return out;
}

/**
 * Per-stratum verdict counts. Counts, deliberately, not rates: over four rows a rate moves
 * for uninteresting reasons (docs/reporting.md, the same floor MIN_COMPARABLE enforces).
 */
function tally(byStratum, stratum, verdict) {
  const b = byStratum[stratum] ?? (byStratum[stratum] = { judged: 0, supported: 0, unsupported: 0, cannot_tell: 0 });
  b.judged++;
  if (verdict in b) b[verdict]++;
}

/** doc_id -> fixture id, from the run manifest. Recognising a run from its text is BUG-003. */
function fixturesByDoc() {
  const map = new Map();
  if (!existsSync(MANIFEST)) return map;
  try {
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    for (const [fixture, runRow] of Object.entries(m.runs ?? {})) {
      if (runRow?.doc_id) map.set(runRow.doc_id, fixture);
    }
  } catch { /* an unreadable manifest means nothing is comparable, which is reported */ }
  return map;
}

/**
 * req_id -> what the answer key says, using the SAME matcher C1 grades with (ADR 0008).
 *
 *   match           the key contains this requirement      -> supported
 *   false_positive  it overlaps no labelled region at all  -> unsupported
 *   over_split / wrong_kind                                -> no verdict: these are about
 *                   how a real requirement was written down, not about whether the source
 *                   supports it, and counting them either way would measure the wrong thing.
 */
function keyVerdicts(fixture, prdVersionId, docId) {
  const file = `${LABELS_DIR}/${fixture}.labels.json`;
  if (!existsSync(file)) return null;
  const doc = get('SELECT raw_text FROM source_documents WHERE doc_id = ?', [docId]);
  if (!doc) return null;
  const labelFile = JSON.parse(readFileSync(file, 'utf8'));
  const { regionsByLabel } = resolveLabels(labelFile, doc.raw_text);
  const labels = (labelFile.expected_requirements ?? [])
    .map((r) => ({ label_id: r.label_id, kind: r.kind, statement: r.statement }));

  // The WHOLE version is matched, not just the sampled rows: whether a requirement claimed
  // a label depends on what else was extracted beside it.
  const extracted = all('SELECT req_id, kind, statement FROM requirements WHERE prd_version_id = ? ORDER BY req_id',
    [prdVersionId]).map((r) => ({
    ...r,
    citations: all('SELECT start_char, end_char FROM citations WHERE req_id = ?', [r.req_id])
      .filter((c) => Number.isInteger(c.start_char)),
  }));

  const { rows } = matchRequirements(extracted, labels, regionsByLabel);
  const verdicts = new Map();
  for (const r of rows) {
    if (r.verdict === 'match') verdicts.set(r.req_id, 'supported');
    else if (r.verdict === 'false_positive') verdicts.set(r.req_id, 'unsupported');
  }
  return verdicts;
}

// --- closing, and the rule that opens a card -------------------------------------------------

/**
 * Close a sweep. `status` is 'complete' or 'skipped'; a skipped sweep carries the reason it
 * got no opinion, from the same closed set a park uses.
 *
 * A skipped sweep is NOT evaluated for disagreement -- it has no scores to disagree with,
 * and letting it count as a clean sweep would make an outage look like a good week. It also
 * does not break a run of three: it is not a sweep that agreed.
 */
export function closeSweep({ sweep_id, status = 'complete', skipped_reason = null, skipped_detail = null, rubric_version = null, judge_model = null }) {
  const sweep = get('SELECT * FROM judge_sweeps WHERE sweep_id = ?', [sweep_id]);
  if (!sweep) return { status: 'error', reason: 'unknown_sweep', missing: ['sweep_id'] };
  if (!['complete', 'skipped'].includes(status)) {
    return { status: 'error', reason: 'envelope_invalid', missing: ['status'] };
  }
  if (status === 'skipped' && !skipped_reason) {
    // A skip with no reason is the failure this whole story is about: it looks like a sweep
    // that happened (BUG-028).
    return { status: 'error', reason: 'envelope_invalid', missing: ['skipped_reason'] };
  }

  const scored = get('SELECT COUNT(*) AS n FROM judge_scores WHERE sweep_id = ?', [sweep_id]).n;
  const dis = status === 'complete' ? disagreementFor(sweep_id) : null;

  run(`UPDATE judge_sweeps SET status = ?, skipped_reason = ?, skipped_detail = ?,
        rubric_version = COALESCE(?, rubric_version),
        judge_model = COALESCE(?, judge_model),
        scored = ?, comparable = ?, disagreements = ?, closed_at = datetime('now')
       WHERE sweep_id = ?`,
  [status, skipped_reason, skipped_detail ? String(skipped_detail).slice(0, 1000) : null,
    rubric_version, judge_model, scored,
    dis?.comparable ?? null, dis?.disagreements ?? null, sweep_id]);

  const fired = status === 'complete' ? applyDisagreementRules(sweep_id, dis) : { rule: null, reasons: ['sweep skipped'] };
  return {
    status: 'ok',
    sweep_id,
    sweep_status: status,
    skipped_reason,
    skipped_detail,
    scored,
    disagreement: dis,
    bug: fired,
  };
}

/**
 * The two rules, exactly as decided. Neither assumes the judge is wrong: the card they open
 * investigates the rubric and the answer key together, because persistent disagreement is as
 * likely to mean the key is wrong (PRD-E7 Q4).
 */
export function applyDisagreementRules(sweepId, dis, { write = true } = {}) {
  const reasons = [];
  let rule = null;

  if (dis && dis.comparable >= MIN_COMPARABLE
      && dis.disagreements / dis.comparable > DISAGREEMENT_RATE) {
    rule = 'over_40_percent';
    reasons.push(`${dis.disagreements} of ${dis.comparable} comparable rows disagree `
      + `(${(100 * dis.disagreements / dis.comparable).toFixed(1)}%), over the 40% rule`);
  } else if (dis && dis.comparable > 0 && dis.comparable < MIN_COMPARABLE) {
    reasons.push(`the 40% rule was NOT evaluated: ${dis.comparable} comparable row(s), `
      + `below the floor of ${MIN_COMPARABLE}`);
  }

  const recent = all(`SELECT sweep_id, comparable, disagreements FROM judge_sweeps
     WHERE status='complete' ORDER BY sweep_id DESC LIMIT ?`, [CONSECUTIVE_SWEEPS]);
  const streak = recent.length === CONSECUTIVE_SWEEPS && recent.every((s) => (s.disagreements ?? 0) > 0);
  if (streak && !rule) {
    rule = 'three_consecutive';
    reasons.push(`each of the last ${CONSECUTIVE_SWEEPS} completed sweeps disagreed with the key `
      + `(${recent.map((s) => `#${s.sweep_id}: ${s.disagreements}/${s.comparable}`).join(', ')})`);
  }

  if (!rule) return { rule: null, reasons };

  const existing = openCardForRule(rule);
  const card = existing ?? (write ? writeBugCard(sweepId, rule, dis, reasons) : '(not written)');
  if (write) run('UPDATE judge_sweeps SET bug_rule = ?, bug_card = ? WHERE sweep_id = ?', [rule, card, sweepId]);
  return { rule, reasons, card, deduplicated: Boolean(existing) };
}

// Where an automatic card is written, and where an existing one is looked for. The override
// exists so `verify-judge.mjs` can FORCE both rules and read the card they produce without
// filing bugs into the real backlog -- a rule that is only ever tested by not firing is a
// rule nobody has seen work.
const CARD_DIR = process.env.JUDGE_CARD_DIR ?? 'stories/backlog';
const CARD_DIRS = process.env.JUDGE_CARD_DIR ? [CARD_DIR] : ['stories/backlog', 'stories/in-progress'];

/** An open card already filed by this rule. A second identical card is noise, not signal. */
function openCardForRule(rule) {
  for (const dir of CARD_DIRS) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((n) => /^BUG-\d+/.test(n))) {
      const text = readFileSync(`${dir}/${f}`, 'utf8');
      if (text.includes('**Opened automatically by a judge sweep**') && text.includes(`rule: \`${rule}\``)) {
        return f.replace(/\.md$/, '');
      }
    }
  }
  return null;
}

function nextBugNumber() {
  let max = 0;
  for (const dir of [...CARD_DIRS, 'stories/done']) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const m = f.match(/^BUG-(\d+)/);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return String(max + 1).padStart(3, '0');
}

function writeBugCard(sweepId, rule, dis, reasons) {
  const id = `BUG-${nextBugNumber()}`;
  const slug = `${id}-the-judge-and-the-answer-key-disagree.md`;
  const rows = (dis?.rows ?? []).filter((r) => r.disagrees)
    .map((r) => `| \`${r.item_id}\` | ${r.fixture} | judge: **${r.judge}** | key: **${r.answer_key}** |`)
    .join('\n') || '| (none listed) | | | |';

  const body = `# ${id}: the judge and the answer key disagree

**Severity:** minor · **Filed:** ${new Date().toISOString().slice(0, 10)}, by sweep #${sweepId}
**Opened automatically by a judge sweep** — rule: \`${rule}\` (E7-S5)

## What fired

${reasons.map((r) => `- ${r}`).join('\n')}

Sweep #${sweepId} compared ${dis?.comparable ?? 0} judged requirement(s) against the answer key
and found ${dis?.disagreements ?? 0} disagreement(s). ${dis?.not_comparable ?? 0} judged row(s)
had no answer key to compare against and were excluded, as were
${dis?.excluded?.length ?? 0} row(s) the system had already flagged ungrounded — a flagged item
is never a violation.

| item | fixture | the judge | the key |
|---|---|---|---|
${rows}

## What this card is NOT

**It is not a finding against the judge.** Persistent disagreement is as likely to mean the
answer key is wrong as the judge is (PRD-E7 Q4), and this investigation weighs the two
equally. Nothing about this card changes a label, a threshold or a gate — the judge gates
nothing, and a card it opened does not get to gate something on its behalf.

## The investigation

1. Read each disagreeing row against the **source text**, by hand, and decide which of the two
   is right — before reading either the rubric or the label file, so the reading is not led.
2. If the **key** is wrong: the labels-before-tuning rule still holds. A label is corrected in
   its own commit, with the reasoning, and every archived result naming the old key stays.
3. If the **rubric** is wrong: it is a prompt, and it is edited under PRD-E2's iteration
   budget like any other — three attempts per diagnosis, then stop and file the pattern.
4. If **neither** is wrong, the disagreement is a real ambiguity in the source. Say so here
   and close the card; that is a finding worth keeping.

## Verified by
- (fill in) the row-by-row reading, and what it decided
`;
  writeFileSync(`${CARD_DIR}/${slug}`, body);
  return id;
}

// --- reading the sweeps (a page and a command; never a gate) ---------------------------------

export function sweeps(limit = 20) {
  return all('SELECT * FROM judge_sweeps ORDER BY sweep_id DESC LIMIT ?', [limit]);
}

export function scoresFor(sweepId) {
  return all('SELECT * FROM judge_scores WHERE sweep_id = ? ORDER BY score_id', [sweepId]);
}

/** Everything a person needs to read one sweep honestly, including what it could not see. */
export function sweepSummary(sweepId) {
  const sweep = get('SELECT * FROM judge_sweeps WHERE sweep_id = ?', [sweepId]);
  if (!sweep) return null;
  const scores = scoresFor(sweepId);
  const avg = (f) => {
    const vals = scores.map((s) => s[f]).filter((v) => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  return {
    ...sweep,
    // Every average carries the count it was taken over, in the same object. A judge figure
    // without its sample size is the figure this project keeps refusing to print.
    averages: {
      faithfulness: avg('faithfulness'),
      completeness: avg('completeness'),
      clarity: avg('clarity'),
      n: scores.length,
    },
    verdicts: {
      supported: scores.filter((s) => s.verdict === 'supported').length,
      unsupported: scores.filter((s) => s.verdict === 'unsupported').length,
      cannot_tell: scores.filter((s) => s.verdict === 'cannot_tell').length,
    },
    scores,
  };
}
