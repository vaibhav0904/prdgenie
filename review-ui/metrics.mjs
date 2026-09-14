// M1-M5, and the only place any of them is computed.
//
// ONE COPY, imported by the CLI (`query.mjs`) and by `/api/metrics` alike. The failure this
// story exists to prevent is a definition and an implementation drifting apart while both look
// finished (docs/metrics.md, the note on M4) — and the cheapest way to get two implementations
// is to let the page have its own SQL. It does not.
//
// Every metric returns { id, name, definition, sql, value, unit, rows } and `rows` is the
// aggregated evidence, not a sample: a figure whose rows are not printable cannot be
// hand-recomputed, and hand-recomputation is this story's gate.
//
// The model touches none of this. Every figure is SQL (CLAUDE.md hard rule).

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, get } from './db.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A reporting window, or all of time.
 *
 * Every metric accepts one and defaults to none, so the weekly report (E8-S2) gets its figures
 * from THESE definitions rather than from week-scoped copies of them. `col` differs per metric
 * because each measures a different act: an action is dated when it was taken, an approval when
 * the event fired.
 */
export function windowClause(col, w) {
  if (!w?.since || !w?.until) return { where: '', params: [] };
  return { where: `${col} >= ? AND ${col} < ?`, params: [w.since, w.until] };
}

/**
 * Joins a metric's own condition to the reporting window. Written out rather than nested
 * ternaries: the first version dropped the WHERE keyword whenever BOTH were present, which is
 * the only case that matters here and the only one the all-time default never exercises.
 */
// Variadic since BUG-065 added a third clause (the population predicate). Still one join, so
// there is still exactly one place the WHERE keyword can go missing.
const and = (...clauses) => {
  const parts = clauses.filter(Boolean);
  return parts.length ? 'WHERE ' + parts.join(' AND ') : '';
};

/** The median, spelled out, because this is the line docs/metrics.md warns about by name. */
export function median(xs) {
  const s = [...xs].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = s.length >> 1;
  // An even-length set has no middle element. Returning s[mid] here would be wrong on every
  // even set and right on half the odd ones, which is the kind of wrong that survives review.
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// --- THE POPULATION SPLIT (BUG-065) ----------------------------------------------------------
//
// Four fifths of the approved versions in this database were minted by a verifier, signed off a
// second later, and are the record of the checks doing their job. Every metric that divides by
// "approved versions" was therefore mostly describing the test suite. Nothing was miscomputed:
// **a number can be right about the wrong thing**, and every guard in this project was pointed
// at the first half of that sentence.
//
// The fix is not to delete those rows — they are the record of what the checks did — and not to
// add a caveat, because the page already carried caveats and a median of 1.2 seconds still read
// as the headline cycle time. It is to report TWO POPULATIONS, each with its denominator named:
// BUG-055's shape for M5, generalised to all five.
//
// THE SIGNAL IS DERIVED, NOT DECLARED. A version belongs to the pipeline population iff its
// trace carries at least one provider call. That is a fact about what happened — the pipeline
// cannot produce a PRD without calling a model — where a product-id prefix would have been a
// naming convention, and a naming convention is a thing a future fixture silently joins.
//
// ONE PREDICATE, three spellings, because three tables reach a version by different columns.
// There is no fourth spelling anywhere; a metric that needed one would be reaching for a
// population these definitions do not describe.
export const PIPELINE = {
  /** rows that already have a `prd_versions` alias in scope */
  version: (v) => `EXISTS (SELECT 1 FROM llm_calls c WHERE c.trace_id = ${v}.trace_id)`,
  /** rows carrying a prd_version_id */
  ofVersion: (col) => `EXISTS (SELECT 1 FROM prd_versions pv JOIN llm_calls c
    ON c.trace_id = pv.trace_id WHERE pv.prd_version_id = ${col})`,
  /** rows carrying a session_id */
  ofSession: (col) => `EXISTS (SELECT 1 FROM review_sessions rs
    JOIN prd_versions pv ON pv.prd_version_id = rs.prd_version_id
    JOIN llm_calls c ON c.trace_id = pv.trace_id WHERE rs.session_id = ${col})`,
};

// REACHED approved, not IS approved (BUG-073).
//
// `prd_versions.state` answers *what is this version now*. Approving a version **supersedes**
// every other approved version of its PRD, inside the same transaction (E6-S3) — correctly. So a
// version a PM took eleven minutes to approve stops being `state='approved'` the moment a
// follow-up is approved, and with it leaves the denominator of any metric that filtered on state.
//
// M4 and M5 ask historical questions: how long did approval take, what did it cost. Both already
// join the `approved` EVENT, which is the fact that it happened and never stops being true. The
// `v.state='approved'` clause that used to sit beside that join asked a second and different
// question — *and is it still the current one?* — and quietly shrank the population every time
// anybody approved anything. **One rehearsal of the demo took M4's pipeline population from 36 to
// 17 and its median from 1.81 minutes to zero.**
//
// So the join is the filter, and the state clause is gone from all five sites. This predicate
// exists for the sixth, which needs it negated: "versions that never reached approved".
export const REACHED_APPROVED = (v = 'v') =>
  `EXISTS (SELECT 1 FROM events e
     WHERE e.name = 'approved' AND e.detail = 'prd_version_id=' || ${v}.prd_version_id)`;

/** The predicate, or nothing at all — so the 'all' population's SQL is byte-identical to what
 *  was published before this fix. A restatement of an unchanged figure must not change it. */
const scoped = (scope, pred) => (scope === 'pipeline' ? pred : '');

export const POPULATIONS = ['all', 'pipeline'];

// --- M1 -------------------------------------------------------------------------------------

const M1_SQL = (w, scope) => `SELECT 100.0*SUM(grounded)/COUNT(*) AS pct, COUNT(*) AS n
                FROM requirements ${and('pm_authored = 0', w.where,
                  scoped(scope, PIPELINE.ofVersion('requirements.prd_version_id')))}`;

export function m1(window, scope = 'all') {
  const w = windowClause('created_at', window);
  const sql = M1_SQL(w, scope);
  const agg = get(sql, w.params);
  // The exclusion, shown rather than asserted: whoever reads this can see what it removed.
  const excluded = get(`SELECT COUNT(*) AS n,
      -- spine-ok: M1's exclusion is REPORTED, split by why. Nothing branches on it
      SUM(CASE WHEN d.authorship='first_party' THEN 1 ELSE 0 END) AS first_party,
      -- spine-ok: same reading; the rate is identical without the split
      SUM(CASE WHEN d.authorship<>'first_party' THEN 1 ELSE 0 END) AS edited
    FROM requirements r JOIN source_documents d ON d.doc_id = r.doc_id
    WHERE r.pm_authored = 1`);
  return {
    id: 'M1',
    name: 'Grounding rate',
    definition: 'Requirements with grounded=1 over requirements the system claims to have '
      + 'grounded. A requirement is excluded if a reviewer edited it, or if it came from a '
      + 'document the PM wrote themselves. Editing must never raise the rate.',
    sql,
    value: agg.pct === null ? null : Number(agg.pct.toFixed(DP.M1)),
    decimals: DP.M1,
    unit: '%',
    rows: [
      { label: 'requirements counted', value: agg.n },
      { label: 'of those, grounded',
        value: get(`SELECT SUM(grounded) AS n FROM requirements ${and('pm_authored = 0', w.where,
          scoped(scope, PIPELINE.ofVersion('requirements.prd_version_id')))}`, w.params).n },
      { label: 'excluded — a reviewer edited it', value: excluded.edited ?? 0 },
      { label: 'excluded — the PM wrote the document', value: excluded.first_party ?? 0 },
    ],
  };
}

// --- M2 -------------------------------------------------------------------------------------

const M2_SQL = (w, scope) => `SELECT 100.0*SUM(decision='approve')/COUNT(*) AS pct, COUNT(*) AS n
                FROM review_actions ${and(w.where,
                  scoped(scope, PIPELINE.ofSession('review_actions.session_id')))}`;

export function m2(window, scope = 'all') {
  const w = windowClause('created_at', window);
  const sql = M2_SQL(w, scope);
  const agg = get(sql, w.params);
  const byDecision = all(`SELECT decision, COUNT(*) AS n FROM review_actions ${and(w.where,
    scoped(scope, PIPELINE.ofSession('review_actions.session_id')))}
    GROUP BY decision ORDER BY n DESC`, w.params);
  return {
    id: 'M2',
    name: 'Accepted-unedited rate',
    definition: "ReviewActions with decision='approve' over all ReviewActions. Rejections and "
      + 'edits both count against.',
    sql,
    value: agg.pct === null ? null : Number(agg.pct.toFixed(DP.M2)),
    decimals: DP.M2,
    unit: '%',
    // Every decision value is printed, not just the numerator. `approve_ungrounded` is NOT
    // counted as an approval, because the definition says decision='approve' and says it
    // literally. That is a reading, and it changes the headline number, so it is shown
    // rather than buried (E8-S1 test plan).
    rows: byDecision.map((d) => ({
      label: d.decision + (d.decision === 'approve' ? '  (the numerator)' : ''),
      value: d.n,
    })).concat([{ label: 'all actions (the denominator)', value: agg.n }]),
  };
}

// --- M3 -------------------------------------------------------------------------------------

// Both halves take the window, or neither does. A windowed numerator over an all-time
// denominator is a rate about two different periods.
const M3_SQL = (w, sw, scope) => `SELECT 1.0 * (SELECT COUNT(*) FROM review_actions
                       ${and("decision='edit'", w.where,
                         scoped(scope, PIPELINE.ofSession('review_actions.session_id')))})
                    / NULLIF((SELECT COUNT(*) FROM requirements
                       WHERE prd_version_id IN (SELECT prd_version_id FROM review_sessions
                         ${and(sw.where, scoped(scope, PIPELINE.ofVersion('review_sessions.prd_version_id')))})), 0)
                AS rate`;

export function m3(window, scope = 'all') {
  const w = windowClause('created_at', window);
  const sw = windowClause('opened_at', window);
  const sql = M3_SQL(w, sw, scope);
  const agg = get(sql, [...w.params, ...sw.params]);
  const sessionScope = scoped(scope, PIPELINE.ofVersion('review_sessions.prd_version_id'));
  const reviewed = get(`SELECT COUNT(*) AS n FROM requirements
    WHERE prd_version_id IN (SELECT prd_version_id FROM review_sessions
      ${and(sw.where, sessionScope)})`, sw.params);
  return {
    id: 'M3',
    name: 'Edits per requirement',
    definition: 'ReviewActions with decision=edit over the requirements in the reviewed '
      + 'versions. A rate, not a percentage; it can exceed 1 if an item is edited twice.',
    sql,
    value: agg.rate === null ? null : Number(agg.rate.toFixed(DP.M3)),
    decimals: DP.M3,
    unit: 'edits/req',
    rows: [
      { label: 'edit actions',
        value: get(`SELECT COUNT(*) AS n FROM review_actions ${and("decision='edit'", w.where,
          scoped(scope, PIPELINE.ofSession('review_actions.session_id')))}`, w.params).n },
      { label: 'requirements in reviewed versions (the denominator)', value: reviewed.n },
      { label: 'review sessions',
        value: get(`SELECT COUNT(*) AS n FROM review_sessions ${and(sw.where, sessionScope)}`, sw.params).n },
    ],
  };
}

// --- M4 -------------------------------------------------------------------------------------
//
// MEDIAN, and the endpoints are `ingested` -> `approved`. Both halves are load-bearing and
// docs/metrics.md names this as the specific mistake the method's source project made: a mean
// in the SQL under a median in the doc, or an endpoint of `draft_created`, would flatter the
// number badly and still look finished.
//
// MIN/MAX rather than a bare join: a trace with two `ingested` rows would otherwise produce a
// cross product and silently weight that document twice.

// PER VERSION, not per trace: 23 traces carry the 30 approved versions, and grouping by
// trace silently dropped seven observations and kept only the latest approval of each.
// The `approved` event names its version in `detail`, so the join is exact rather than
// approximate — and it is the EVENT, as the definition says, not `prd_versions.approved_at`.
const M4_SQL = (w, scope) => `SELECT v.prd_version_id,
       (julianday(a.ts) - julianday(i.ingested_at)) * 1440.0 AS minutes
  FROM prd_versions v
  JOIN events a ON a.name = 'approved' AND a.detail = 'prd_version_id=' || v.prd_version_id
  JOIN (SELECT trace_id, MIN(ts) AS ingested_at FROM events
         WHERE name='ingested' GROUP BY trace_id) i ON i.trace_id = v.trace_id
 ${and(w.where, scoped(scope, PIPELINE.version('v')))}`;

export function m4(window, scope = 'all') {
  const w = windowClause('a.ts', window);
  const sql = M4_SQL(w, scope);
  const rows = all(sql, w.params);
  const mins = rows.map((r) => r.minutes);
  const neverApproved = get(`SELECT COUNT(*) AS n FROM prd_versions v
    ${and(`NOT ${REACHED_APPROVED('v')}`, scoped(scope, PIPELINE.version('v')))}`);
  // A version approved through a session that recorded no decisions was not reviewed. That is
  // a fact in the rows, not a guess about how fast is too fast, and while any exist this
  // median is timing something other than a PM reading a PRD.
  const unreviewed = get(`SELECT COUNT(*) AS n FROM prd_versions v
    JOIN review_sessions s ON s.prd_version_id = v.prd_version_id
    JOIN events a ON a.name='approved' AND a.detail='prd_version_id='||v.prd_version_id
    ${and(w.where, scoped(scope, PIPELINE.version('v')))}
      AND NOT EXISTS (SELECT 1 FROM review_actions ra WHERE ra.session_id = s.session_id)`,
    w.params).n;
  return {
    id: 'M4',
    name: 'Cycle time to approval',
    definition: 'MEDIAN minutes from the `ingested` event to the `approved` event, joined on '
      + 'trace_id, over versions that reached approved. Versions never approved are excluded '
      + 'and counted separately.',
    sql,
    value: mins.length ? Number(median(mins).toFixed(DP.M4)) : null,
    decimals: DP.M4,
    unit: 'min (median)',
    provisional: unreviewed > 0 ? {
      why: `${unreviewed} of ${rows.length} approved versions were signed off through a session `
        + 'that recorded no decisions at all. This median is timing those approvals as much as '
        + 'any review, so it describes the verification of this system rather than the use of it.',
      clears_when: 'every approved version in the period carries at least one review action',
    } : null,
    rows: [
      { label: 'approved versions measured', value: rows.length },
      { label: 'fastest', value: mins.length ? Number(Math.min(...mins).toFixed(2)) : null },
      { label: 'slowest', value: mins.length ? Number(Math.max(...mins).toFixed(2)) : null },
      // Printed beside the median on purpose: if these two diverge, someone has swapped one
      // for the other somewhere, and seeing both is how that gets noticed.
      { label: 'mean, for comparison only — NOT the metric',
        value: mins.length ? Number((mins.reduce((a, b) => a + b, 0) / mins.length).toFixed(2)) : null },
      { label: 'versions that never reached approved (excluded)', value: neverApproved.n },
      { label: 'of those measured, approved with NO review action recorded', value: unreviewed },
    ],
  };
}

// EVERY PUBLISHED FIGURE DECLARES ITS OWN RESOLUTION (BUG-055).
//
// Each metric rounds for display, and `recompute-metrics.mjs` compares the two derivations
// **at the precision the number is published at** — half a unit in the last place is float
// noise, and anything larger is a real disagreement.
//
// It used to work that resolution out by stringifying the value, which fails silently on a
// trailing zero. M5 rounds to four decimals; `(0.000962).toFixed(4)` is "0.0010", and
// `Number()` makes that `0.001` — three decimals, as far as any reader of the value can tell.
// So the checker compared at three, and a **26% error between the right and the wrong
// derivation vanished**: 0.001217 and 0.000962 are the same number at that resolution, and
// M5's control could no longer fail.
//
// The digits are now declared beside the value and used for BOTH the rounding and the
// comparison — one place, because two places for one number is two places to drift (E7-S5).
const DP = { M1: 2, M2: 2, M3: 3, M4: 2, M5: 4 };

// --- M5 -------------------------------------------------------------------------------------

// The denominator is EVERY approved PRDVersion, as the definition says — counted
// independently of the join. Counting it inside the join gave 8, because only 8 of the 30
// have model calls on their trace, and that would have divided the real spend by a quarter
// of the real output and called the answer a cost per PRD.
const M5_SQL = (w, scope) => `SELECT
  (SELECT SUM(c.cost_usd) FROM llm_calls c
    WHERE c.trace_id IN (SELECT v.trace_id FROM prd_versions v
      JOIN events a ON a.name='approved' AND a.detail='prd_version_id='||v.prd_version_id
      ${and(w.where, scoped(scope, PIPELINE.version('v')))})) AS total,
  (SELECT COUNT(*) FROM prd_versions v
    JOIN events a ON a.name='approved' AND a.detail='prd_version_id='||v.prd_version_id
    ${and(w.where, scoped(scope, PIPELINE.version('v')))}) AS approved`;

export function m5(window, scope = 'all') {
  const w = windowClause('a.ts', window);
  const sql = M5_SQL(w, scope);
  const agg = get(sql, [...w.params, ...w.params]);
  // The denominator mixes two populations whenever any approved version contributed no model
  // spend: those cost nothing because nobody ran the pipeline for them. An average over both
  // is arithmetic about two different things.
  //
  // Since BUG-065 this is the SAME predicate the population split uses, negated — which is why
  // it is written as NOT PIPELINE.version rather than spelled out a second time. At
  // scope='pipeline' it is zero by construction, and the row below says so instead of
  // printing a naked 0 that a reader would have to interpret.
  const free = get(`SELECT COUNT(*) AS n FROM prd_versions v
    JOIN events a ON a.name='approved' AND a.detail='prd_version_id='||v.prd_version_id
    ${and(w.where, `NOT ${PIPELINE.version('v')}`,
      scoped(scope, PIPELINE.version('v')))}`, w.params).n;
  const value = agg.approved ? agg.total / agg.approved : null;
  return {
    id: 'M5',
    name: 'Cost per approved PRD',
    definition: 'Sum of llm_calls.cost_usd over every trace_id that contributed to an approved '
      + 'PRDVersion, divided by the number of approved PRDVersions.',
    sql,
    value: value === null ? null : Number(value.toFixed(DP.M5)),
    decimals: DP.M5,
    unit: 'USD',
    provisional: free > 0 ? {
      why: `${free} of ${agg.approved} approved versions carry no model spend at all - they were `
        + 'made by hand while this system was being verified. Averaging over them and over real '
        + 'runs together produces a figure that is not the cost of anything. The cost of a RUN, '
        + 'which is the question a buyer actually asks, is E2-S4 and is not built.',
      clears_when: 'every approved version in the period was produced by the pipeline',
    } : null,
    rows: [
      { label: 'approved versions (the denominator)', value: agg.approved },
      { label: 'model spend on their traces (USD)', value: agg.total === null ? null : Number(agg.total.toFixed(4)) },
      // The number that decides whether this metric means anything yet. Most approved
      // versions in this database were created by hand during verification and cost
      // nothing, so the average is dragged toward zero by test data. Printed, not hidden.
      // `free`, not a second query for the same fact: this row used to recompute it with the
      // window dropped, so in a weekly report it printed an all-time count under a windowed
      // headline. One derivation, one number (BUG-065).
      { label: 'of those, with NO model spend on their trace',
        value: scope === 'pipeline' ? 0 : free },
      // THE COMPANION FIGURE, beside the headline rather than instead of it (BUG-055).
      //
      // The definition above is the one that was published and it does not change: a metric
      // renamed because a control went red is tuning wearing a better suit. But the headline
      // divides real spend by a denominator that is mostly scaffolding — most approved versions
      // in this database were built by a verification script and cost nothing — so the number a
      // reader actually wants sits next to it, with its own denominator stated.
      //
      // Not a replacement, and not a correction. Two populations, two figures, both named.
      { label: 'of those the pipeline actually produced, cost each (USD)',
        value: (agg.approved - free) > 0 && agg.total !== null
          ? Number((agg.total / (agg.approved - free)).toFixed(DP.M5)) : null },
      { label: 'model spend across ALL traces (USD)', value: Number((get('SELECT SUM(cost_usd) AS t FROM llm_calls').t ?? 0).toFixed(4)) },
      { label: 'provider calls recorded', value: get('SELECT COUNT(*) AS n FROM llm_calls').n },
    ],
  };
}

// --- the caveat -----------------------------------------------------------------------------

/**
 * Computed from `baseline_status`, never typed (docs/metrics.md, "The baseline problem").
 * A caveat that is the same string whatever the data says is a typed caveat with extra steps.
 */
export function caveat(forced) {
  // `forced` exists so the check can force each branch without writing to the control plane.
  // Production passes nothing and reads the row, exactly as before.
  const row = forced === undefined
    ? get("SELECT value FROM schema_meta WHERE key = 'baseline_status'") : { value: forced };
  const status = row?.value ?? 'none';
  const text = {
    none: 'ILLUSTRATIVE — there is no week-zero baseline yet, so no figure here is evidence '
      + 'of an improvement over anything. It describes what this system did, not what it saved.',
    pending: 'ILLUSTRATIVE — a baseline has been started but not finished. Comparisons stay '
      + 'off the table until it is.',
    recorded: 'A week-zero baseline is recorded, so efficiency figures below may be compared '
      + 'against it. The comparison is still one PM on invented documents.',
  }[status] ?? `UNKNOWN baseline_status "${status}" — treat every figure as illustrative.`;
  return { status, text, illustrative: status !== 'recorded' };
}


// --- the guardrail partner that does not live in this database ------------------------------
//
// M2 and M5 are meaningless without C1's recall beside them, and C1 lives in the eval archive,
// not in SQLite. This reads the newest recorded C1 result rather than recomputing anything:
// the stranger owns that number, and a second implementation of it here would be exactly the
// duplicate-of-a-definition problem this module exists to avoid.
//
// It returns null when no run has ever been graded, and the caller MUST refuse to render the
// metrics that depend on it. That refusal is what makes "inseparable" structural.

const RECALL_ROW = /\| ([A-Z]\d) \| [\w_]+ \|.*?\| ([\d.]+)% \| ([\d.]+)% \|/g;

export function c1Recall() {
  let files;
  try {
    files = readdirSync(join(REPO, 'evals', 'results'))
      .filter((f) => f.includes('-C1') && f.endsWith('.md')).sort();
  } catch { return null; }
  if (!files.length) return null;

  // Newest by the run number embedded in the name, not by mtime: a file copied or restored
  // out of order would otherwise silently become "the latest result".
  const rank = (f) => {
    const d = f.slice(0, 10);
    const n = Number((f.match(/-run(\d+)/) ?? [, '1'])[1]);
    return d + String(n).padStart(4, '0');
  };
  const newest = files.sort((a, b) => (rank(a) < rank(b) ? -1 : 1)).at(-1);
  const text = readFileSync(join(REPO, 'evals', 'results', newest), 'utf8');

  const fixtures = [...text.matchAll(RECALL_ROW)]
    .map((m) => ({ fixture: m[1], recall: Number(m[2]), precision: Number(m[3]) }));
  if (!fixtures.length) return null;

  const verdict = /## Verdict: (\w+)/.exec(text)?.[1] ?? 'unknown';
  return {
    source: 'evals/results/' + newest,
    graded_on: newest.slice(0, 10),
    verdict,
    fixtures,
    worst: fixtures.reduce((a, b) => (b.recall < a.recall ? b : a)),
  };
}

// --- guardrail pairs ------------------------------------------------------------------------
//
// docs/metrics.md: some metrics are meaningless alone, because the cheapest way to move one is
// to quietly ruin another. The pairing lives HERE, in the payload, not in the page's layout —
// a layout convention is one refactor away from being broken, and nothing would notice.

export const GUARDRAIL_PARTNER = {
  M2: { partner: 'C1_recall', why: 'The cheapest way to raise the accepted-unedited rate is to extract fewer, vaguer requirements that are hard to disagree with. That shows up as C1 recall falling.' },
  M4: { partner: 'M3', why: 'The cheapest way to cut cycle time is to rubber-stamp. That shows up as edits per requirement collapsing toward zero at the same time — which looks like a triumph and is the opposite.' },
  M5: { partner: 'C1_recall', why: 'Cost per PRD falls if the pipeline stops doing work. Report it beside the extraction quality it bought.' },
};

// --- the uncomfortable numbers --------------------------------------------------------------

export function uncomfortable(window) {
  // Each takes the window on its OWN timestamp: a version is dated when it was created, an
  // override when the reviewer clicked, a dead letter when the run died. Windowing all three
  // on one column would be tidier and wrong.
  const v = windowClause('created_at', window);
  return [
    { label: 'PRD versions that never reached approved',
      // Says "never reached", so it reads the event, not the state (BUG-073). Read as a state it
      // counted every SUPERSEDED version as one that never got approved — which is the opposite
      // of what happened to it.
      value: get(`SELECT COUNT(*) AS n FROM prd_versions v
        ${and(`NOT ${REACHED_APPROVED('v')}`, v.where)}`, v.params).n,
      why: 'Most are eval runs that were never signed off. A rising share on real documents would mean the review gate is a wall, not a gate.' },
    { label: 'approvals of an ungrounded requirement',
      value: get(`SELECT COUNT(*) AS n FROM review_actions ${and("decision = 'approve_ungrounded'", v.where)}`, v.params).n,
      why: 'Each one is a reviewer overriding the grounding check with a written reason. The override exists on purpose and is counted on purpose.' },
    { label: 'dead letters',
      value: get(`SELECT COUNT(*) AS n FROM dead_letters ${and('', v.where)}`, v.params).n,
      why: 'Runs that died rather than parked. Every one should have been seen by an operator.' },
  ];
}

/** The drill-down. A session that was forty seconds of `approve` has to be findable. */
export function sessions(limit = 200) {
  // `signed_off_at`, not `closed_at` — and the two timestamps are stored in different
  // formats ("2026-09-03 05:59:13" against an ISO string with a Z), so the duration is
  // computed with julianday on both and sanity-checked in verify-metrics rather than
  // assumed to line up.
  return all(`SELECT s.session_id, s.prd_version_id, s.opened_at, s.signed_off_at,
      (SELECT COUNT(*) FROM review_actions a WHERE a.session_id = s.session_id) AS actions,
      (SELECT COUNT(*) FROM review_actions a WHERE a.session_id = s.session_id AND a.decision='approve') AS approvals,
      (SELECT COUNT(*) FROM review_actions a WHERE a.session_id = s.session_id AND a.decision='approve_ungrounded') AS overrides,
      (SELECT COUNT(*) FROM review_actions a WHERE a.session_id = s.session_id AND a.decision='edit') AS edits,
      CAST((julianday(COALESCE(s.signed_off_at, s.opened_at)) - julianday(s.opened_at)) * 86400 AS INTEGER) AS seconds
    FROM review_sessions s ORDER BY s.opened_at DESC LIMIT ?`, [limit]);
}

export const METRICS = { m1, m2, m3, m4, m5 };

/**
 * ONE METRIC, TWO POPULATIONS (BUG-065).
 *
 * Calls the SAME function twice rather than writing a second implementation, because the way to
 * get two figures that disagree about their own definition is to compute them in two places.
 * The published definition does not change and the `all` figure does not change: renaming a
 * metric because its number embarrassed you is tuning wearing a better suit.
 *
 * What changes is that the number now arrives with its denominator attached, and the reader is
 * told which population they are looking at before they read a digit.
 */
export function populations(f, window) {
  const whole = f(window, 'all');
  const pipeline = f(window, 'pipeline');
  const nOf = (m) => m.rows.find((r) => /denominator|counted|measured/.test(r.label))?.value ?? null;
  return {
    ...whole,
    populations: [
      {
        scope: 'all',
        label: 'across everything the database holds',
        value: whole.value,
        n: nOf(whole),
        rows: whole.rows,
        sql: whole.sql,
      },
      {
        scope: 'pipeline',
        label: 'across runs the pipeline actually produced',
        value: pipeline.value,
        n: nOf(pipeline),
        rows: pipeline.rows,
        sql: pipeline.sql,
        // Named here once, and rendered by whoever draws the page.
        means: 'A version belongs to this population iff its trace carries at least one '
          + 'provider call — the pipeline cannot produce a PRD without calling a model. '
          + 'Everything outside it was minted by a verifier and signed off a second later.',
      },
    ],
  };
}

/**
 * How much of the wider population is scaffolding — printed once, at the top of the page, so
 * the split is a stated fact rather than something a reader has to infer from five pairs.
 */
export function populationSplit(window) {
  // Windowed on the approval event, like M4 and M5, so the weekly report's split describes the
  // week rather than all of time under a weekly heading — the mistake `uncomfortable` already
  // made once and had corrected.
  const w = windowClause('a.ts', window);
  const approved = `SELECT COUNT(*) AS n FROM prd_versions v
    JOIN events a ON a.name='approved' AND a.detail='prd_version_id='||v.prd_version_id
    ${and(w.where)}`;
  const total = get(approved, w.params).n;
  const produced = get(`${approved} AND ${PIPELINE.version('v')}`, w.params).n;
  return {
    approved_versions: total,
    produced_by_pipeline: produced,
    minted_by_verifiers: total - produced,
    pct_scaffolding: total ? Number((100 * (total - produced) / total).toFixed(1)) : null,
    predicate: 'at least one llm_calls row on the version\'s trace_id',
    why: 'The checks in this repository sign off real PRDVersions, on purpose — that is how a '
      + 'gate gets proven. Those rows are the record of the checks doing their job and are not '
      + 'deleted. They are also not what the product does, so every figure is reported over '
      + 'both populations and neither is hidden.',
  };
}

/** Everything the page needs, in one shape, so a partner cannot be dropped on the way out. */
export function allMetrics({ c1: c1Forced } = {}) {
  // `c1` may be forced to null to prove that a metric whose guardrail partner is missing comes
  // back marked unrenderable. Production passes nothing and reads the eval archive.
  const c1 = c1Forced === undefined ? c1Recall() : c1Forced;
  return {
    caveat: caveat(),
    c1,
    population_split: populationSplit(),
    metrics: Object.values(METRICS).map((f) => {
      const m = populations(f, undefined);
      const g = GUARDRAIL_PARTNER[m.id];
      if (!g) return m;
      // The pairing is carried in the payload, and a metric whose partner is missing is
      // marked UNRENDERABLE rather than shipped alone. A page cannot draw what it is not
      // given, which is the only version of "these two are inseparable" that survives a
      // future refactor of the page.
      const partner = g.partner === 'C1_recall'
        ? (c1 ? { kind: 'C1_recall', graded_on: c1.graded_on, worst: c1.worst, verdict: c1.verdict } : null)
        : { kind: g.partner };
      return { ...m, guardrail: { ...g, partner_value: partner, renderable: partner !== null } };
    }),
    uncomfortable: uncomfortable(),
    sessions: sessions(),
  };
}
