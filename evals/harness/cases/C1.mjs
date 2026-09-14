// C1 — extraction quality. Recall and precision against the labels, by span overlap.
//
// The case grades T1 and T3, and reports them SEPARATELY. One averaged figure over two
// documents of different difficulty would hide exactly the thing worth knowing: whether
// the system holds up on the argumentative transcript as well as the tidy one
// (PRD-E2, decided).

import { matchRequirements } from '../match.mjs';
import { resolveLabels } from '../labels.mjs';

export const id = 'C1';
export const title = 'extraction quality';
// FOUR DOCUMENT TYPES, and the threshold is applied to each fixture separately (E5-S4).
//
// **No average across types.** An average hides a type that fails badly behind three that
// pass: four fixtures at 0.95, 0.95, 0.95 and 0.35 average to 0.80 and read as "meets the
// floor" while one whole door is broken. The report groups by type and prints every fixture's
// own numbers, and the verdict is the AND of all of them.
export const FIXTURES = ['T1', 'T3', 'N1', 'E1', 'F1', 'T4'];

// **The denominator is derived, not typed.** Every fixture whose answer key carries
// requirements is graded here, or is named below with the case that grades it instead; a
// fixture in neither list fails this case rather than being quietly skipped. A hand-typed
// list cannot grow, and this one had already failed to (BUG-003/019).
//
// T4 was in neither half until BUG-030. It carried fifteen labelled requirements that no
// case read, and it holds the sharpest pair in the whole answer key: T4-R03 retains data for
// twelve months and is a `constraint`, T4-R04 deletes it after thirty days and is
// `nonfunctional`. Any narrowing of the kind rules lands there first, and C1 could not see it.
export const GRADED_ELSEWHERE = {
  G1: 'C2 — the document whose correct output is no requirements at all, a different assertion',
  H1: 'C6 — injection resistance; its requirements exist to show the payloads displaced nothing',
  H2: 'C2 — redaction, in both directions',
  T2: 'C5 — the delta case, WHICH IS NOT BUILT. T2 requirements are ungraded today, and this'
    + ' line is the record of that rather than a silence',
};
export const RECALL_FLOOR = 0.80;
export const PRECISION_FLOOR = 0.75;

export function run(ctx) {
  const perFixture = [];
  const notGraded = [];

  for (const fx of FIXTURES) {
    const run = ctx.manifest.runs?.[fx];
    const labelFile = ctx.labels.get(fx);
    if (!run?.prd_version_id || !labelFile) { notGraded.push(fx); continue; }

    const doc = ctx.document(run.doc_id);
    if (!doc) { notGraded.push(fx); continue; }

    // Labels resolve against the STORED text, which is post-redaction. Resolving against
    // the authored fixture would misalign every span and read as an extraction failure
    // (E1-S3; the reason `verify-labels --stored` exists).
    const { regionsByLabel, unresolved } = resolveLabels(labelFile, doc.raw_text);
    const labels = (labelFile.expected_requirements ?? [])
      .map((r) => ({ label_id: r.label_id, kind: r.kind, statement: r.statement }));

    const extracted = ctx.requirements(run.prd_version_id).map((r) => ({
      req_id: r.req_id,
      kind: r.kind,
      statement: r.statement,
      // A citation the grounding check could not locate has no span, so it can overlap
      // nothing. That is correct: it becomes a false positive rather than a free match.
      citations: r.citations.filter((c) => Number.isInteger(c.start_char)),
    }));

    const result = matchRequirements(extracted, labels, regionsByLabel);
    perFixture.push({ fixture: fx, doc_id: run.doc_id, version: run.prd_version_id,
      // Read from the STORED document, not from the fixture file: the report describes the
      // run that happened, and the door is what decided the type.
      doc_type: doc.doc_type,
      unresolved, ...result });
  }

  // Coverage is asserted, not assumed: a case that silently skipped its subject is a case
  // that cannot fail (BUG-003). Two halves: every fixture this case NAMES was graded, and
  // every fixture the answer key OFFERS is either named here or declared elsewhere.
  const labelled = [...ctx.labels.keys()]
    .filter((fx) => (ctx.labels.get(fx)?.expected_requirements ?? []).length > 0)
    .sort();
  const undeclared = labelled.filter((fx) =>
    !FIXTURES.includes(fx) && !Object.hasOwn(GRADED_ELSEWHERE, fx));
  const covered = notGraded.length === 0 && undeclared.length === 0;
  const passes = perFixture.filter((f) =>
    f.recall >= RECALL_FLOOR && f.precision >= PRECISION_FLOOR);
  const verdict = covered && passes.length === perFixture.length && perFixture.length
    ? 'PASS' : 'FAIL';

  return { verdict, perFixture, notGraded, covered, undeclared, labelled,
    markdown: report(ctx, perFixture, notGraded, verdict, undeclared, labelled) };
}

/**
 * The figures a spread is taken over (E2-S4). Per fixture, per metric, with the floor that
 * applies to it — so a range that crosses a floor can be recognised without the spread runner
 * knowing anything about extraction.
 *
 * They are declared HERE rather than in the spread runner for the same reason the thresholds
 * are: the case owns what it measures, and a second file deciding which of its numbers matter
 * is a second definition waiting to disagree.
 */
export function headline(out) {
  return out.perFixture.flatMap((f) => [
    { fixture: f.fixture, metric: 'recall', value: f.recall, floor: RECALL_FLOOR },
    { fixture: f.fixture, metric: 'precision', value: f.precision, floor: PRECISION_FLOOR },
  ]);
}

const pct = (x) => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);

function report(ctx, perFixture, notGraded, verdict, undeclared, labelled) {
  const L = [];
  L.push(`# C1 — extraction quality — ${ctx.today}`);
  L.push('');
  L.push(`**Graded run:** produced ${ctx.manifest.produced_at}, `
    + `${ctx.manifest.fixtures_attempted} of ${ctx.manifest.fixtures_available} fixtures.`);
  L.push(`**Graded version:** prompt \`extract-requirements\` `
    + `@ ${ctx.promptVersions.join(', ') || 'unknown'} (content hash \`${ctx.promptHash}\`), `
    + `model ${ctx.models.join(', ') || 'unknown'}.`);
  L.push(`**Threshold:** recall >= ${RECALL_FLOOR.toFixed(2)} AND `
    + `precision >= ${PRECISION_FLOOR.toFixed(2)}, **per fixture**, not averaged.`);
  L.push('');
  L.push(`**Coverage:** ${perFixture.length} of ${FIXTURES.length} fixtures this case names`
    + (notGraded.length ? ` — **NOT GRADED: ${notGraded.join(', ')}**` : ''));
  L.push(`**And of the ${labelled.length} fixtures whose answer key carries requirements** — `
    + `derived from the labels, not typed here — ${FIXTURES.length} are graded above and `
    + `${Object.keys(GRADED_ELSEWHERE).length} are declared to another case`
    + (undeclared.length ? `: **UNDECLARED: ${undeclared.join(', ')}**` : '.'));
  for (const [fx, why] of Object.entries(GRADED_ELSEWHERE)) L.push(`- \`${fx}\` — ${why}`);
  L.push('');

  L.push('| Fixture | Type | Labelled | Extracted | Matched | Missed | Over-split | Wrong kind | False positive | Recall | Precision | |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const f of perFixture) {
    const c = f.counts;
    const ok = f.recall >= RECALL_FLOOR && f.precision >= PRECISION_FLOOR;
    L.push(`| ${f.fixture} | ${f.doc_type ?? '?'} | ${c.labelled} | ${c.extracted} | ${c.match} | ${c.missed} `
      + `| ${c.over_split} | ${c.wrong_kind} | ${c.false_positive} `
      + `| ${pct(f.recall)} | ${pct(f.precision)} | ${ok ? 'pass' : '**FAIL**'} |`);
  }
  L.push('');

  // Per document type, listed rather than averaged. The spine claim is that nothing
  // downstream knows which door a document came through; this is where that claim either
  // shows up as four comparable columns or does not.
  const types = [...new Set(perFixture.map((f) => f.doc_type ?? 'unknown'))].sort();
  L.push('**By document type — listed, never averaged:**');
  L.push('');
  for (const t of types) {
    const inType = perFixture.filter((f) => (f.doc_type ?? 'unknown') === t);
    const failing = inType.filter((f) => !(f.recall >= RECALL_FLOOR && f.precision >= PRECISION_FLOOR));
    L.push(`- **${t}** — ${inType.map((f) => `${f.fixture} ${pct(f.recall)}/${pct(f.precision)}`).join(' · ')}`
      + (failing.length ? `  — **${failing.map((f) => f.fixture).join(', ')} below the floor**` : ''));
  }
  L.push('');

  for (const f of perFixture) {
    L.push(`## ${f.fixture} — per-item diff (${f.doc_id}, PRDVersion ${f.version})`);
    L.push('');
    if (f.unresolved.length) {
      L.push(`> **${f.unresolved.length} labelled quote(s) did not resolve against the stored text.** `
        + 'Check label alignment before diagnosing extraction (E1-S3).');
      L.push('');
    }
    L.push('| Extracted | Verdict | Label | Statement |');
    L.push('|---|---|---|---|');
    for (const r of f.rows) {
      L.push(`| \`${r.req_id}\` | ${r.verdict === 'match' ? 'match' : `**${r.verdict}**`} `
        + `| ${r.label_id ?? '—'} | ${trim(r.statement)}${r.detail ? ` _(${r.detail})_` : ''} |`);
    }
    L.push('');
    if (f.misses.length) {
      L.push(`**Missed — in the answer key, not in the output (${f.misses.length}):**`);
      L.push('');
      for (const m of f.misses) L.push(`- \`${m.label_id}\` (${m.kind}) ${trim(m.statement)}`);
      L.push('');
    } else {
      L.push('**Missed:** none.');
      L.push('');
    }
  }

  L.push(`## Verdict: ${verdict}`);
  L.push('');
  if (verdict === 'FAIL') {
    L.push('Per PRD-E2: at most three prompt iterations, then a BUG card naming the failure');
    L.push('*pattern*. The threshold does not move and the labels are not edited.');
  }
  return L.join('\n');
}

const trim = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, 110);
