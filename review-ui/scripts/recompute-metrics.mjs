// E8-S1's open gate, closed the only way it can be closed without Vaibhav.
//
// THE CARD ASKED FOR A HUMAN. "Each metric is hand-recomputed once by a human against the
// rows, and matches." That is not what this file is, and it must not be read as it: I wrote
// `metrics.mjs`, so me checking it is the system checking itself — BUG-001's whole lesson.
//
// WHAT THIS IS INSTEAD: a second, independent DERIVATION of the same five numbers. Different
// strategy on purpose — the shipped code aggregates in SQL, this pulls raw rows and does the
// arithmetic in JavaScript, so a mistake in a GROUP BY, a NULL, a join fan-out or an IN-clause
// de-duplication shows up as a disagreement rather than being reproduced.
//
// WHAT IT BUYS: two implementations agreeing is real evidence against arithmetic and join
// errors. WHAT IT DOES NOT BUY: agreement on what the numbers should MEAN. Both derivations
// read the same definitions, so a wrong definition is agreed on twice and this file is silent
// about it. That is exactly the half a human was for, and it stays open.
//
// The M5 half was attempted by hand once (2026-09-04) and got it WRONG first time: summing
// spend per approved version double-counts every trace that several versions share, which is
// the very defect E8-S1's shipped SQL had already fixed. That mistake is now the M5-C control
// below, which recomputes it the wrong way on every run and asserts the two answers DIFFER —
// so the figures live in the output rather than in this comment, where they would go stale.
//
// Usage:  .\run.cmd review-ui/scripts/recompute-metrics.mjs

import { all, get } from '../db.mjs';
import * as M from '../metrics.mjs';

let checks = 0; let failures = 0;
const say = (id, pass, msg, detail = '') => {
  checks++;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${msg}${detail ? `  — ${detail}` : ''}`);
};

const round = (v, n) => (v === null || v === undefined ? null : Number(v.toFixed(n)));

/**
 * Decimals the shipped value is PUBLISHED at — TAKEN FROM THE METRIC, not guessed from its
 * value (BUG-055), and never typed here: a checker carrying its own copy of those numbers is a
 * second place for them to drift.
 */
//
// Stringifying the number was the original approach and it fails on a trailing zero: M5 rounds
// to four decimals, and `Number((0.000962).toFixed(4))` is `0.001`, which reads as three. The
// checker then compared at three, and the 26% gap between M5's right and wrong derivations
// vanished — the control could not fail, which is the same as not having one.
//
// `metrics.mjs` now publishes `decimals` beside every value. The fallback stays for a metric
// that has not declared one yet, and it announces itself rather than quietly guessing.
const declaredDecimals = (metric) => {
  if (Number.isInteger(metric?.decimals)) return metric.decimals;
  const s = String(metric?.value);
  console.warn(`  note: ${metric?.id ?? 'a metric'} declares no precision; inferring from "${s}".`);
  return s.includes('.') ? s.split('.')[1].length : 0;
};

/**
 * Do the two derivations agree TO THE PRECISION THE NUMBER IS PUBLISHED AT?
 *
 * That is the claim worth making and the only one that is true: my derivation keeps full
 * float precision, the shipped one rounds for display, so comparing them at four decimals
 * makes M3 "disagree" by 0.0005 when both computed 0.13253012048. The first run of this file
 * did exactly that and reported 5/6 — a red row caused by the checker, not the code.
 * Half a unit in the last published place is the tolerance; anything larger is a real
 * disagreement and stays one.
 */
const agree = (rawMine, metric) => {
  const theirs = metric?.value;
  if (rawMine === null || theirs === null || theirs === undefined) return rawMine === theirs;
  return Math.abs(rawMine - theirs) <= 0.5 * 10 ** -declaredDecimals(metric);
};

console.log('Recomputing five numbers from raw rows, in JavaScript, against the SQL that ships.\n');

// --- DP: every metric declares the precision it is published at --------------------------------
//
// The tolerance in `agree()` is half a unit in the last published place, so a metric that
// declares nothing sends the comparison back to guessing from a stringified value — which is
// the defect this card fixed, and it would come back silently the first time somebody adds a
// sixth metric. Asserted here, derived from the metrics themselves.
{
  const shipped = [M.m1(), M.m2(), M.m3(), M.m4(), M.m5()];
  const undeclared = shipped.filter((m) => !Number.isInteger(m.decimals));
  say('DP', undeclared.length === 0, 'every metric declares the precision it is published at',
    undeclared.length
      ? `${undeclared.map((m) => m.id).join(', ')} declare none — the comparison falls back to guessing`
      : shipped.map((m) => `${m.id}:${m.decimals}dp`).join(' '));
}

// --- M1: grounding rate --------------------------------------------------------------------
// Definition: requirements with grounded=1 over requirements the system claims to have
// grounded; PM-authored excluded. No SUM(), no aggregate — every row pulled and counted.
{
  const rows = all('SELECT grounded, pm_authored FROM requirements');
  const counted = rows.filter((r) => r.pm_authored === 0);
  const grounded = counted.filter((r) => r.grounded === 1);
  const raw = (100 * grounded.length) / counted.length;
  const shipped = M.m1();
  const theirs = shipped.value;
  const mine = round(raw, declaredDecimals(shipped));
  say('M1', agree(raw, shipped), 'grounding rate',
    `mine ${mine}%  ·  shipped ${theirs}%  ·  ${grounded.length} of ${counted.length}, `
    + `${rows.length - counted.length} pm-authored row(s) set aside`);
}

// --- M2: accepted-unedited rate --------------------------------------------------------------
// Definition: decision='approve' over ALL review actions. `approve_ungrounded` is deliberately
// NOT an approval — the definition says the literal string, and that reading changes the
// headline, so it is recomputed here the same way and the tally is printed either way.
{
  const rows = all('SELECT decision FROM review_actions');
  const tally = {};
  for (const r of rows) tally[r.decision] = (tally[r.decision] ?? 0) + 1;
  const raw = (100 * (tally.approve ?? 0)) / rows.length;
  const shipped = M.m2();
  const theirs = shipped.value;
  const mine = round(raw, declaredDecimals(shipped));
  say('M2', agree(raw, shipped), 'accepted-unedited rate',
    `mine ${mine}%  ·  shipped ${theirs}%  ·  ${Object.entries(tally).map(([k, v]) => `${k}:${v}`).join(' ')}`);
}

// --- M3: edits per requirement ----------------------------------------------------------------
// Definition: edit actions over the requirements in the REVIEWED versions. The shipped version
// does it with a nested IN; this builds the set of reviewed version ids and counts membership.
{
  const edits = all("SELECT action_id FROM review_actions WHERE decision = 'edit'").length;
  const reviewed = new Set(all('SELECT prd_version_id FROM review_sessions').map((r) => r.prd_version_id));
  const inReviewed = all('SELECT prd_version_id FROM requirements')
    .filter((r) => reviewed.has(r.prd_version_id)).length;
  const raw = inReviewed ? edits / inReviewed : null;
  const shipped = M.m3();
  const theirs = shipped.value;
  const mine = raw === null ? null : round(raw, declaredDecimals(shipped));
  say('M3', agree(raw, shipped), 'edits per requirement',
    `mine ${mine}  ·  shipped ${theirs}  ·  ${edits} edit(s) over ${inReviewed} requirement(s) `
    + `in ${reviewed.size} reviewed version(s)`);
}

// --- M4: cycle time to approval ---------------------------------------------------------------
// Definition: MEDIAN minutes from `ingested` to `approved`, joined on trace_id. The shipped
// version joins in SQL; this pulls both event sets and pairs them in a Map, then takes the
// median with an explicit even/odd branch rather than a SQL window function.
{
  const ingested = new Map();
  for (const e of all("SELECT trace_id, ts FROM events WHERE name = 'ingested'")) {
    // The FIRST ingest for a trace. A trace has one, but taking the min is the safe reading
    // and it is what makes this a different implementation rather than the same one retyped.
    const prev = ingested.get(e.trace_id);
    if (!prev || e.ts < prev) ingested.set(e.trace_id, e.ts);
  }
  const mins = [];
  for (const e of all("SELECT trace_id, ts, detail FROM events WHERE name = 'approved'")) {
    const start = ingested.get(e.trace_id);
    if (!start) continue;
    mins.push((Date.parse(`${e.ts.replace(' ', 'T')}Z`) - Date.parse(`${start.replace(' ', 'T')}Z`)) / 60000);
  }
  mins.sort((a, b) => a - b);
  const mid = Math.floor(mins.length / 2);
  const raw = mins.length ? (mins.length % 2 ? mins[mid] : (mins[mid - 1] + mins[mid]) / 2) : null;
  const shipped = M.m4();
  const theirs = shipped.value;
  const mine = raw === null ? null : round(raw, declaredDecimals(shipped));
  say('M4', agree(raw, shipped), 'cycle time to approval (median minutes)',
    `mine ${mine}  ·  shipped ${theirs}  ·  ${mins.length} approved version(s) paired on trace_id`);
}

// --- M5: cost per approved PRD -----------------------------------------------------------------
// Definition: spend over every trace that contributed to an approved version, divided by the
// number of approved versions.
//
// THE TRAP, and the reason this metric is worth two implementations: several approved versions
// share a trace. Summing spend per VERSION counts those traces more than once. The shipped SQL
// avoids it with `IN (SELECT trace_id ...)`, which de-duplicates as a side effect of being a
// set membership test — easy to read past. Here the set is explicit.
{
  const approvedIds = new Set(all("SELECT detail FROM events WHERE name = 'approved'")
    .map((e) => String(e.detail ?? '').replace('prd_version_id=', '')));
  // REACHED approved, from the events, and NOT `state='approved'` as well (BUG-073). The extra
  // state filter that used to be here asked "and is it still the current version", which drops
  // every superseded version out of a cost-per-approved-PRD figure — spend that really happened,
  // on a PRD that really was approved. M4's recomputation two blocks up never had the bug, which
  // is why it, and not this one, is what caught the same mistake in the shipped SQL.
  const approved = all('SELECT prd_version_id, trace_id FROM prd_versions')
    .filter((v) => approvedIds.has(String(v.prd_version_id)));
  const traces = new Set(approved.map((v) => v.trace_id));

  let total = 0;
  for (const c of all('SELECT trace_id, cost_usd FROM llm_calls')) {
    if (traces.has(c.trace_id)) total += c.cost_usd ?? 0;
  }
  const raw = approved.length ? total / approved.length : null;
  const shipped = M.m5();
  const theirs = shipped.value;
  const mine = raw === null ? null : round(raw, declaredDecimals(shipped));
  say('M5', agree(raw, shipped), 'cost per approved PRD (USD)',
    `mine ${mine}  ·  shipped ${theirs}  ·  $${total.toFixed(4)} over ${approved.length} version(s) `
    + `on ${traces.size} distinct trace(s)`);

  // THE CONTROL. The wrong derivation — per version, so shared traces are counted once each
  // time — must produce a DIFFERENT number. If it did not, this check could not tell a correct
  // implementation from the classic wrong one, and its agreement above would mean nothing.
  let naive = 0;
  const byTrace = new Map();
  for (const c of all('SELECT trace_id, cost_usd FROM llm_calls')) {
    byTrace.set(c.trace_id, (byTrace.get(c.trace_id) ?? 0) + (c.cost_usd ?? 0));
  }
  for (const v of approved) naive += byTrace.get(v.trace_id) ?? 0;
  const naiveValue = approved.length ? round(naive / approved.length, 6) : null;
  say('M5-C', naiveValue !== null && !agree(naiveValue, shipped),
    'CONTROL: the double-counting derivation gives a different answer, so this check can fail',
    `wrong way $${naiveValue}  vs  right way $${mine}  (${approved.length} versions, ${traces.size} traces)`);
}

// --- DP-C: the control for the tolerance itself ------------------------------------------------
//
// Every row above passes when the two derivations agree. **None of them would notice a
// tolerance that had gone slack** — and a tolerance derived from a declared number is exactly
// the thing that can quietly widen, because widening it makes everything greener.
//
// So: take M5, declare it at ONE decimal, and require the same comparison to swallow a
// difference it must not. If this passes, `agree()` is reading the declaration rather than
// ignoring it.
{
  const m5 = M.m5();
  const slack = { ...m5, decimals: 1 };
  const clearlyWrong = (m5.value ?? 0) + 0.04;   // 40x M5's published resolution
  say('DP-C', agree(clearlyWrong, slack) && !agree(clearlyWrong, m5),
    'CONTROL: a slack declaration widens the tolerance, so the declaration is what is being read',
    `${clearlyWrong.toFixed(4)} vs ${m5.value} — accepted at 1dp, refused at ${m5.decimals}dp`);
}

console.log(`\n${checks - failures}/${checks} agreed`);

if (failures) {
  console.log(`
A DISAGREEMENT IS A BUG CARD, NOT AN EDIT. Two derivations differing means one of them is
wrong, and which one is a question to answer before either number is shown to anybody.`);
  process.exit(1);
}

console.log(`
WHAT THIS DOES NOT CLOSE. Both derivations read the same definitions, so they agree on the
arithmetic and say nothing about whether the definitions are the right ones. That judgement —
is 'approve_ungrounded' an approval? is the median the right statistic? — was what the human
recomputation was for, and it stays open on E8-S1's card.`);
