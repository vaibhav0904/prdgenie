// The owner's weekly report (WF5), and the rules that make it honest without anyone
// remembering to be honest.
//
// Three properties, all load-bearing:
//   1. EVERY FIGURE IS SQL, from `metrics.mjs` — the same definitions the Metrics page and the
//      CLI use, windowed to a calendar week. There is no week-scoped copy of any metric.
//   2. THE CAVEATS ARE COMPUTED FROM STATE. They appear and disappear on their own. A sentence
//      somebody has to remember to add is a sentence somebody will forget to remove.
//   3. THE MODEL WRITES PROSE AND NEVER A FIGURE, and that is enforced in code rather than
//      asked for in a prompt — a prohibition holds about two runs in three (CLAUDE.md).
//
// The report is the numbers. The narrative is a courtesy, and its absence is a line of text.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from './db.mjs';
import { m1, m2, m3, m4, m5, caveat, c1Recall, uncomfortable, populationSplit,
  GUARDRAIL_PARTNER } from './metrics.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REPORTS_DIR = join(REPO, 'reports');

export const NARRATIVE_UNAVAILABLE = 'Narrative unavailable this week.';

/** Fewer than this many approvals and a median is not a median (docs/reporting.md). */
export const SMALL_WEEK = 3;

// --- when is a week ---------------------------------------------------------------------------

/** The Monday on or before `date`, and the Monday after it. Weeks are Mondays (reporting.md). */
export function weekBounds(date = new Date()) {
  const d = new Date(typeof date === 'string' ? `${date}T00:00:00Z` : date);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  const end = new Date(start.getTime() + 7 * 86400_000);
  const prior = new Date(start.getTime() - 7 * 86400_000);
  const iso = (x) => x.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end), priorStart: iso(prior), priorEnd: iso(start) };
}

// --- the model may not write a number ----------------------------------------------------------
//
// Digits and `%` are refused outright. Spelled-out numerals are refused too, because "roughly
// ninety-eight percent" is a figure the moment it is read, and a check that only looks for
// digits invites exactly that phrasing.
//
// "one" is deliberately NOT in this list. It is ordinary English — "one of the two doors", "no
// one reviewed it" — and refusing it would refuse almost every honest paragraph. The cost is
// stated rather than hidden: a commentary saying "one PRD was approved" passes this check.
// Everything from "two" upward, and every magnitude word, does not.

const NUMBER_WORDS = [
  'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
  'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  'hundred', 'thousand', 'million', 'billion',
  'percent', 'percentage', 'half', 'quarter', 'third', 'dozen', 'double', 'triple',
];

const WORD_RE = new RegExp(`\\b(${NUMBER_WORDS.join('|')})\\b`, 'gi');

/**
 * Returns the violations rather than a boolean: the caller writes them into the report's own
 * record, so a rejected narrative leaves a trace instead of vanishing.
 */
export function findFigures(text) {
  const hits = [];
  for (const m of String(text).matchAll(/\d+/g)) hits.push({ kind: 'digit', at: m.index, text: m[0] });
  for (const m of String(text).matchAll(/%|\bper\s+cent\b/gi)) hits.push({ kind: 'percent', at: m.index, text: m[0] });
  for (const m of String(text).matchAll(WORD_RE)) hits.push({ kind: 'number_word', at: m.index, text: m[0] });
  return hits.sort((a, b) => a.at - b.at);
}

/**
 * Why the narrative was dropped — a third vocabulary, and it is written down because it is
 * one (BUG-050). Not envelope reason codes and not door refusals: nothing here reaches a
 * caller, a park or a queue. It is `buildReport`'s own record of what the model sent and why
 * none of it was used, returned as `vet.reason` and read by the caller that writes the file.
 *
 * Two members is a small set to write down. It is written down because the alternative is a
 * field named `reason` whose values are governed by nothing, which is the whole of BUG-050.
 */
export const VETTING_REASONS = Object.freeze(['empty', 'contained_figures']);

/** `{ ok, commentary, violations }`. A narrative carrying a figure is DROPPED, never trimmed. */
export function vetCommentary(text) {
  const commentary = String(text ?? '').trim();
  if (!commentary) return { ok: false, commentary: NARRATIVE_UNAVAILABLE, violations: [], reason: 'empty' };
  const violations = findFigures(commentary);
  if (violations.length) {
    // Not repaired. A paragraph with the numbers edited out is a paragraph nobody wrote, and
    // the point of the rule is that the model does not supply figures at all.
    return { ok: false, commentary: NARRATIVE_UNAVAILABLE, violations, reason: 'contained_figures' };
  }
  return { ok: true, commentary, violations: [] };
}

// --- the figures --------------------------------------------------------------------------------

const pct = (v) => (v === null || v === undefined ? null : `${v}%`);

export function weekFigures(mondayISO) {
  const b = weekBounds(mondayISO);
  const win = { since: b.start, until: b.end };
  const prior = { since: b.priorStart, until: b.priorEnd };

  const approvedIn = (w) => get(`SELECT COUNT(*) AS n FROM prd_versions v
    JOIN events a ON a.name='approved' AND a.detail='prd_version_id='||v.prd_version_id
    WHERE v.state='approved' AND a.ts >= ? AND a.ts < ?`, [w.since, w.until]).n;

  return {
    bounds: b,
    approved: approvedIn(win),
    approvedPrior: approvedIn(prior),
    now: { m1: m1(win), m2: m2(win), m3: m3(win), m4: m4(win), m5: m5(win) },
    prior: { m1: m1(prior), m2: m2(prior), m3: m3(prior), m4: m4(prior), m5: m5(prior) },
    c1: c1Recall(),
    // Windowed, like everything else here. These were lifetime totals until they were
    // read under a weekly heading and looked like a week.
    uncomfortable: uncomfortable(win),
    // WHICH POPULATION THIS WEEK'S FIGURES DESCRIBE (BUG-065). Windowed on the approval, so a
    // week of verifier runs says so instead of reading as a week of product use.
    split: populationSplit(win),
  };
}

// --- the caveats, which are computed ---------------------------------------------------------

/**
 * `baselineStatus` is a parameter so both directions can be forced without writing to the
 * control plane. Production passes nothing and the row decides.
 */
export function caveatsFor(figures, baselineStatus) {
  const out = [];
  const base = caveat(baselineStatus);
  if (base.illustrative) {
    out.push({
      id: 'no_baseline',
      text: 'Efficiency figures are illustrative: no week-zero baseline exists.',
      because: `baseline_status = '${base.status}'`,
    });
  }
  if (figures.approved < SMALL_WEEK) {
    out.push({
      id: 'small_denominator',
      text: `Fewer than ${SMALL_WEEK === 3 ? 'three' : SMALL_WEEK} PRDs were approved this week, `
        + 'so the median cycle time is not a median and every rate moves for uninteresting reasons.',
      because: `${figures.approved} approved this week`,
    });
  }
  // A metric may declare its own population unrepresentative. The report carries that beside
  // the other caveats rather than only next to the figure, because the owner reads the top.
  for (const m of Object.values(figures.now)) {
    if (m.provisional) {
      out.push({
        id: `provisional_${m.id}`,
        text: `${m.id} is provisional. ${m.provisional.why}`,
        because: m.provisional.clears_when,
      });
    }
  }
  // WHICH POPULATION THE WEEK DESCRIBES (BUG-065). The owner reads the top of the report, and a
  // week whose approvals were mostly verifier runs is a week whose cycle time is not about
  // people. Computed from the rows, and it removes itself the week it stops being true.
  const sp = figures.split;
  if (sp && sp.minted_by_verifiers > 0) {
    out.push({
      id: 'mixed_population',
      text: `${sp.minted_by_verifiers} of ${sp.approved_versions} approvals this week were minted `
        + 'by a verifier rather than produced by the pipeline, so every figure below averages over '
        + 'two different things. The metrics page reports both populations separately.',
      because: `${sp.produced_by_pipeline} of ${sp.approved_versions} carry a provider call on their trace`,
    });
  }
  if (!figures.c1) {
    out.push({
      id: 'no_graded_run',
      text: 'No graded extraction run was found, so the quality figures that keep M2 and M5 '
        + 'honest are missing and both are withheld rather than quoted alone.',
      because: 'no C1 result file',
    });
  }
  return out;
}

// --- the report ---------------------------------------------------------------------------------

const line = (label, value, note) =>
  `| ${label} | ${value === null || value === undefined ? '*no data*' : value} | ${note ?? ''} |`;

function trend(now, then) {
  if (now === null || now === undefined) return 'no data this week';
  if (then === null || then === undefined) return 'no prior week to compare';
  const d = now - then;
  if (Math.abs(d) < 1e-9) return 'unchanged';
  return `${d > 0 ? 'up' : 'down'} from ${then}`;
}

/**
 * Deterministic for a given week and inputs, except `generatedAt`, which is the only line that
 * may differ between two runs of the same week (BUG-021).
 */
export function renderReport({ figures, caveats, commentary, generatedAt }) {
  const f = figures;
  const L = [];
  L.push(`# Weekly insights — week of ${f.bounds.start}`);
  L.push('');
  L.push(`*Generated ${generatedAt}. Every figure below is SQL; run them yourself with*`);
  L.push('`.\\run.cmd review-ui/scripts/query.mjs metrics`.');
  L.push('');

  if (caveats.length) {
    for (const c of caveats) L.push(`> **${c.text}** *(${c.because})*`);
    L.push('');
  }

  L.push('## What happened');
  L.push('');
  L.push(commentary);
  L.push('');

  L.push('## The numbers');
  L.push('');
  L.push('| | This week | Against last week |');
  L.push('|---|---|---|');
  L.push(line('PRDs approved', f.approved, trend(f.approved, f.approvedPrior)));
  L.push(line('M1 grounding rate', pct(f.now.m1.value), trend(f.now.m1.value, f.prior.m1.value)));
  L.push('');

  // GUARDRAIL PAIRS, adjacent and in the same table, per docs/reporting.md rule 5. Splitting
  // them across sections would satisfy "both present" while losing the point.
  L.push('### M2 accepted-unedited, with the extraction quality that keeps it honest');
  L.push('');
  L.push(`*${GUARDRAIL_PARTNER.M2.why}*`);
  L.push('');
  L.push('| | This week | Against last week |');
  L.push('|---|---|---|');
  if (f.c1) {
    L.push(line('M2 accepted-unedited', pct(f.now.m2.value), trend(f.now.m2.value, f.prior.m2.value)));
    L.push(line('— of which review actions', f.now.m2.rows.find((r) => /denominator/.test(r.label))?.value, 'the absolute count, beside the rate'));
    L.push(line(`C1 recall, weakest fixture (${f.c1.worst.fixture})`, `${f.c1.worst.recall}%`, `graded ${f.c1.graded_on}, verdict ${f.c1.verdict}`));
  } else {
    L.push(line('M2 accepted-unedited', '*withheld*', 'its guardrail partner is unavailable'));
  }
  L.push('');

  L.push('### M4 cycle time, with the edit rate that keeps it honest');
  L.push('');
  L.push(`*${GUARDRAIL_PARTNER.M4.why}*`);
  L.push('');
  L.push('| | This week | Against last week |');
  L.push('|---|---|---|');
  L.push(line('M4 cycle time, median minutes', f.now.m4.value, trend(f.now.m4.value, f.prior.m4.value)));
  L.push(line('M3 edits per requirement', f.now.m3.value, trend(f.now.m3.value, f.prior.m3.value)));
  L.push(line('— versions created this week that never reached approved',
    f.uncomfortable.find((u) => /never reached approved/.test(u.label))?.value,
    'stated here rather than hidden by M4\'s exclusion rule'));
  L.push('');

  L.push('### M5 cost, with the output it bought');
  L.push('');
  L.push(`*${GUARDRAIL_PARTNER.M5.why}*`);
  L.push('');
  L.push('| | This week | Against last week |');
  L.push('|---|---|---|');
  if (f.c1) {
    L.push(line('M5 cost per approved PRD (USD)', f.now.m5.value, trend(f.now.m5.value, f.prior.m5.value)));
    L.push(line('PRDs approved', f.approved, trend(f.approved, f.approvedPrior)));
    L.push(line('— approved versions with no model spend', f.now.m5.rows.find((r) => /NO model spend/.test(r.label))?.value, 'these drag the average toward zero'));
  } else {
    L.push(line('M5 cost per approved PRD', '*withheld*', 'its guardrail partner is unavailable'));
  }
  L.push('');

  L.push('## What this report does not flatter');
  L.push('');
  L.push('*This week only. The lifetime totals are on the Metrics page.*');
  L.push('');
  L.push('| | Count | |');
  L.push('|---|---|---|');
  for (const u of f.uncomfortable) L.push(line(u.label, u.value, u.why));
  L.push('');

  if (f.approved === 0 && f.now.m2.value === null) {
    L.push('## Nothing happened this week');
    L.push('');
    L.push('No PRD was approved and no requirement was reviewed in this period. The zeros above '
      + 'are an absence of activity, not a finding about quality — and a report that presented '
      + 'them as performance would be lying by arithmetic.');
    L.push('');
  }

  return L.join('\n') + '\n';
}

export function reportPath(mondayISO) {
  return join(REPORTS_DIR, `weekly-${weekBounds(mondayISO).start}.md`);
}

export function writeReport(mondayISO, body) {
  mkdirSync(REPORTS_DIR, { recursive: true });
  const path = reportPath(mondayISO);
  writeFileSync(path, body);
  return path;
}

/** The whole thing, for the CLI and for the endpoint alike. */
export function buildReport({ week, commentary, baselineStatus, generatedAt } = {}) {
  const figures = weekFigures(week);
  const caveats = caveatsFor(figures, baselineStatus);
  const vet = vetCommentary(commentary);
  const body = renderReport({
    figures,
    caveats,
    commentary: vet.commentary,
    generatedAt: generatedAt ?? new Date().toISOString(),
  });
  return { figures, caveats, vet, body };
}
