// C3 — structure and determinism.
//
// Two questions, and the second is the one this case exists for:
//
//   1. does every link in the assembled PRD resolve?   story -> feature -> epic,
//      criterion -> requirement, feature.req_ids -> requirement
//   2. **is every stored score exactly what its stored factors say it should be?**
//
// Threshold 100% on both, no partial credit. A mismatch on (2) is not a rounding argument —
// it is **the signature of some other code path having written a score**, which is the single
// claim this product makes about numbers.
//
// THE ARITHMETIC BELOW IS A DELIBERATE DUPLICATE of `structure.mjs`, for the reason C2 states
// about grounding: a case that imported the function it grades would agree with itself by
// construction. Nine characters of duplication buy an independent check.

export const id = 'C3';
export const title = 'structure and determinism';

/** RICE, written out again on purpose. If this disagrees with the product, that is the finding. */
const riceIndependently = (f) => Math.round(((f.reach * f.impact * f.confidence) / f.effort) * 10) / 10;

export function run(ctx) {
  const runs = ctx.manifest.runs ?? {};
  const L = [];
  const rows = [];

  let epics = 0;
  let features = 0;
  let stories = 0;
  let factors = 0;
  const orphans = [];
  const scoreDiffs = [];
  const unscored = [];
  const invalid = [];
  const examined = [];
  const skipped = [];

  for (const [fx, r] of Object.entries(runs)) {
    if (!r.prd_version_id) { skipped.push(`${fx} (parked)`); continue; }
    const v = ctx.version(r.prd_version_id);
    if (!v) { skipped.push(`${fx} (no version row)`); continue; }
    examined.push(fx);

    const e = ctx.epics(r.prd_version_id);
    const f = ctx.features(r.prd_version_id);
    const s = ctx.stories(r.prd_version_id);
    const p = ctx.priorityFactors(r.prd_version_id);
    const reqIds = new Set(ctx.requirements(r.prd_version_id).map((x) => x.req_id));

    epics += e.length; features += f.length; stories += s.length; factors += p.length;

    const epicIds = new Set(e.map((x) => x.epic_id));
    const featureIds = new Set(f.map((x) => x.feature_id));

    for (const x of f) {
      if (!epicIds.has(x.epic_id)) orphans.push({ fx, kind: 'feature -> epic', id: x.feature_id, missing: x.epic_id });
      for (const rid of x.req_ids) {
        if (!reqIds.has(rid)) orphans.push({ fx, kind: 'feature -> requirement', id: x.feature_id, missing: rid });
      }
    }
    for (const x of s) {
      if (!featureIds.has(x.feature_id)) orphans.push({ fx, kind: 'story -> feature', id: x.story_id, missing: x.feature_id });
      for (const c of x.acceptance_criteria) {
        if (!reqIds.has(c.req_id)) orphans.push({ fx, kind: 'criterion -> requirement', id: x.story_id, missing: c.req_id });
      }
    }

    // --- the score, recomputed independently ------------------------------------------------
    for (const factor of p) {
      if (!featureIds.has(factor.feature_id)) {
        orphans.push({ fx, kind: 'factors -> feature', id: factor.feature_id, missing: factor.feature_id });
        continue;
      }
      const stored = f.find((x) => x.feature_id === factor.feature_id)?.priority_score;
      const expected = riceIndependently(factor);
      if (stored === null || stored === undefined) { unscored.push({ fx, feature_id: factor.feature_id }); continue; }
      if (Math.abs(stored - expected) > 1e-9) {
        scoreDiffs.push({ fx, feature_id: factor.feature_id, stored, expected, factor });
      }
    }

    // A stored PRD must still validate. A version that cannot be re-read is not a document.
    const content = ctx.content(r.prd_version_id);
    if (!content || !Array.isArray(content.requirements)) invalid.push(`${fx}: content is not readable`);

    rows.push({ fx, v: r.prd_version_id, e: e.length, f: f.length, s: s.length, p: p.length });
  }

  // --- coverage, asserted (BUG-003) -----------------------------------------------------------
  const gradable = Object.entries(runs).filter(([, r]) => r.prd_version_id).length;
  const coverageOk = examined.length === gradable && gradable > 0;

  L.push(`# C3 — structure and determinism — ${ctx.today}`);
  L.push('');
  L.push(`**Graded run:** produced ${ctx.manifest.produced_at}, ${ctx.manifest.fixtures_attempted} of ${ctx.manifest.fixtures_available} fixtures.`);
  L.push(`**Graded version:** prompts ${ctx.promptVersions.join(', ') || '(none)'}, model ${ctx.models.join(', ') || '(none)'}.`);
  L.push('**Threshold: 100%, both halves, no partial credit.** Every link resolves, and every');
  L.push('stored score equals RICE recomputed from its stored factors.');
  L.push('');
  L.push(`**Coverage:** ${examined.length} of ${gradable} gradable versions examined`
    + (skipped.length ? ` · skipped: ${skipped.join(', ')}` : '') + (coverageOk ? '' : ' — **GAP**'));
  L.push('');

  L.push('| Fixture | Version | Epics | Features | Stories | Factors |');
  L.push('|---|---|---|---|---|---|');
  for (const r of rows) L.push(`| ${r.fx} | ${r.v} | ${r.e} | ${r.f} | ${r.s} | ${r.p} |`);
  L.push(`| **total** | | **${epics}** | **${features}** | **${stories}** | **${factors}** |`);
  L.push('');

  L.push('## Every link resolves');
  L.push('');
  if (orphans.length === 0) {
    L.push(`**No orphans**, across ${features} features, ${stories} stories and ${factors} factor sets.`);
  } else {
    L.push(`**${orphans.length} orphan(s)** — each is a row pointing at something that is not there:`);
    L.push('');
    L.push('| Fixture | Link | Row | Missing |');
    L.push('|---|---|---|---|');
    for (const o of orphans.slice(0, 30)) L.push(`| ${o.fx} | ${o.kind} | \`${o.id}\` | \`${o.missing}\` |`);
  }
  L.push('');

  L.push('## Every score recomputes');
  L.push('');
  L.push(`Recomputed **${factors}** score(s) from their stored factors, with arithmetic written`);
  L.push('separately from the product\'s.');
  L.push('');
  if (scoreDiffs.length === 0 && factors > 0) {
    L.push('**Every stored score matches.** No other code path has written one.');
  } else if (factors === 0) {
    L.push('**No factors stored — nothing to recompute.** This is not a pass; it is an absence.');
  } else {
    L.push('| Fixture | Feature | Stored | Recomputed | Factors |');
    L.push('|---|---|---|---|---|');
    for (const d of scoreDiffs) {
      L.push(`| ${d.fx} | \`${d.feature_id}\` | ${d.stored} | **${d.expected}** | r=${d.factor.reach} i=${d.factor.impact} c=${d.factor.confidence} e=${d.factor.effort} |`);
    }
  }
  if (unscored.length) {
    L.push('');
    L.push(`**${unscored.length} feature(s) have factors and no stored score** — reported, because`);
    L.push('"every score matches" over zero scores is not a result.');
  }
  L.push('');

  // --- what this case cannot see ---------------------------------------------------------------
  L.push('## What this case cannot see');
  L.push('');
  L.push('**C3 checks that the structure is well-formed, not that it is any good.** A clusterer');
  L.push('that puts one requirement in each of thirty features produces a perfectly linked');
  L.push('document with no grouping in it, and every check above passes. The requirements-per-');
  L.push('feature figure is printed here for that reason and has no threshold:');
  L.push('');
  const perFeature = features ? (rows.reduce((n, r) => n + r.f, 0) ? (factors ? null : null) : null) : null;
  const reqTotal = Object.entries(runs).filter(([, r]) => r.prd_version_id)
    .reduce((n, [, r]) => n + ctx.requirements(r.prd_version_id).length, 0);
  L.push(`- requirements: **${reqTotal}** · features: **${features}** · epics: **${epics}**`);
  L.push(`- requirements per feature: **${features ? (reqTotal / features).toFixed(2) : '—'}**`);
  L.push(`- features per epic: **${epics ? (features / epics).toFixed(2) : '—'}**`);
  L.push('');
  L.push('**A ratio near 1.0 requirement per feature means the grouping is nominal** — the');
  L.push('structure exists and does no work. That is a BUG card, not a threshold, because a cap');
  L.push('on feature count would be a number chosen to make the fixtures look grouped.');
  L.push('');
  void perFeature;

  let verdict = 'PASS';
  if (!coverageOk) verdict = 'FAIL';
  else if (orphans.length || scoreDiffs.length || invalid.length) verdict = 'FAIL';
  else if (factors === 0) verdict = 'FAIL';

  L.push(`## Verdict: ${verdict}`);
  return { verdict, markdown: L.join('\n') };
}
