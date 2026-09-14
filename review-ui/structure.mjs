// Structure: epics, features, stories, and the one number in this product that is arithmetic.
//
// Three model calls produce the shapes here (E3-S1, S2, S3) and **none of them sees
// `raw_text`** (docs/contracts.md §2). Given the source document a clusterer will happily
// invent requirements that extraction declined to make, and those would enter the PRD with no
// citation — invisible to C2, which only checks the requirements it is handed.
//
// What code owns, and it is everything that could quietly go wrong:
//
//   1. every id a model refers to must exist            -> rejected, never dropped
//   2. every requirement is placed or explicitly listed -> silent loss is the failure
//                                                          structure invites
//   3. the score                                        -> computed here, from stored factors
//
// **Structure makes bad extraction look MORE credible, not less** (E3-S1's own note). Tidy
// epics over invented requirements read as a plan. Nothing in this file can detect that; it is
// C2's job, and this file's job is to not add a second way to lose track.

/**
 * RICE, with the published scales taken as-is. **Untuned, and they stay untuned**
 * (docs/assumptions.md): a scale adjusted until the fixtures look reasonable is not a scale.
 */
export const IMPACT_VALUES = Object.freeze([0.25, 0.5, 1, 2, 3]);
export const RANGES = Object.freeze({
  reach: [1, 10],
  confidence: [0.5, 1.0],
  effort: [1, 8],
});

/**
 * PriorityScore = round(reach x impact x confidence / effort, 1).
 *
 * The only place this is computed. The model supplies four judgements and its reasoning; the
 * arithmetic is code, because no citation can check a number (CLAUDE.md).
 *
 * **What determinism buys here is reproducibility, not correctness.** The factors are still
 * model judgements and `docs/assumptions.md` says so.
 */
export function computeScore({ reach, impact, confidence, effort }) {
  return Math.round(((reach * impact * confidence) / effort) * 10) / 10;
}

const inRange = (v, [lo, hi]) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/**
 * Fields the model may not set. Same rule and same reason as `grounded` on a requirement:
 * ignoring one invites a later refactor to trust it, and that failure would be silent.
 */
export function assertModelDidNotScore(features) {
  const offenders = [];
  (features ?? []).forEach((f, i) => {
    if ('priority_score' in f && f.priority_score !== null) offenders.push(`features[${i}].priority_score`);
  });
  return offenders;
}

/**
 * Validate a clustering against the requirements it was given.
 *
 * REJECTS (schema_invalid) rather than dropping when a feature names a requirement that does
 * not exist: a dangling id means the clusterer was working from something other than its
 * input, and quietly dropping it would hide that.
 *
 * REPORTS every requirement that ended up in no feature. "Each appears in exactly one feature
 * or is listed as unclustered" is the property; a requirement that is in neither is the silent
 * loss this structure invites.
 */
export function validateClusters(requirements, clusters) {
  const known = new Set((requirements ?? []).map((r) => r.req_id));
  const epics = [];
  const features = [];
  const problems = [];
  const placed = new Map();

  (clusters?.epics ?? []).forEach((e, ei) => {
    const epicId = typeof e?.epic_id === 'string' ? e.epic_id.trim() : '';
    if (!epicId) { problems.push(`epics[${ei}].epic_id`); return; }
    if (!e.title || !String(e.title).trim()) { problems.push(`epics[${ei}].title`); return; }
    epics.push({ epic_id: epicId, title: String(e.title).trim(), summary: e.summary ?? null });

    (e.features ?? []).forEach((f, fi) => {
      const featureId = typeof f?.feature_id === 'string' ? f.feature_id.trim() : '';
      if (!featureId) { problems.push(`epics[${ei}].features[${fi}].feature_id`); return; }
      if (!f.title || !String(f.title).trim()) { problems.push(`epics[${ei}].features[${fi}].title`); return; }
      const ids = Array.isArray(f.req_ids) ? f.req_ids : [];
      for (const id of ids) {
        if (!known.has(id)) { problems.push(`epics[${ei}].features[${fi}].req_ids: unknown ${id}`); continue; }
        // A requirement in two features is not rejected — it is reported, because the honest
        // answer to "which feature owns this?" is sometimes both, and the ratio below is what
        // makes over-placement visible.
        placed.set(id, (placed.get(id) ?? 0) + 1);
      }
      features.push({
        feature_id: featureId,
        epic_id: epicId,
        title: String(f.title).trim(),
        req_ids: ids.filter((id) => known.has(id)),
      });
    });
  });

  const unclustered = [...known].filter((id) => !placed.has(id));
  const duplicated = [...placed.entries()].filter(([, n]) => n > 1).map(([id]) => id);

  return {
    epics,
    features,
    unclustered,
    duplicated,
    problems,
    // Surfaced, never capped (decided 2026-09-01). Bad clustering should be visible rather
    // than prevented by a number nobody agreed to.
    ratio: epics.length ? Number((known.size / epics.length).toFixed(1)) : null,
    accounted: known.size === unclustered.length + [...placed.keys()].length,
  };
}

/**
 * Validate drafted stories against the features and requirements they claim to come from.
 *
 * A criterion naming an unknown `req_id` is a rejection, for the clustering reason: it means
 * the drafter was working from something it was not given.
 */
export function validateStories(features, requirements, drafted) {
  const knownFeatures = new Set((features ?? []).map((f) => f.feature_id));
  const knownReqs = new Set((requirements ?? []).map((r) => r.req_id));
  const stories = [];
  const problems = [];

  (drafted?.stories ?? []).forEach((s, i) => {
    if (!knownFeatures.has(s?.feature_id)) { problems.push(`stories[${i}].feature_id: unknown ${s?.feature_id}`); return; }
    const ac = Array.isArray(s.acceptance_criteria) ? s.acceptance_criteria : [];
    for (const [j, c] of ac.entries()) {
      if (!knownReqs.has(c?.req_id)) problems.push(`stories[${i}].acceptance_criteria[${j}].req_id: unknown ${c?.req_id}`);
    }
    stories.push({
      story_id: String(s.story_id ?? `STORY-${i + 1}`),
      feature_id: s.feature_id,
      as_a: s.as_a ?? null,
      i_want: s.i_want ?? null,
      so_that: s.so_that ?? null,
      acceptance_criteria: ac.filter((c) => knownReqs.has(c?.req_id)),
    });
  });

  const withStories = new Set(stories.map((s) => s.feature_id));
  return {
    stories,
    problems,
    // Reported, not skipped: a feature nobody could write a story for is a fact about the
    // clustering, and hiding it would make the structure look more complete than it is.
    features_without_stories: [...knownFeatures].filter((id) => !withStories.has(id)),
  };
}

/**
 * Validate priority factors and compute the score.
 *
 * **Out-of-range factors are REJECTED, never clamped.** Clamping would hide a model that does
 * not understand the scale, and the scale is the only thing making the number comparable
 * between features.
 */
export function validateFactors(features, supplied) {
  const known = new Set((features ?? []).map((f) => f.feature_id));
  const factors = [];
  const problems = [];

  (supplied?.priority_factors ?? []).forEach((f, i) => {
    if (!known.has(f?.feature_id)) { problems.push(`priority_factors[${i}].feature_id: unknown ${f?.feature_id}`); return; }
    const bad = [];
    if (!inRange(f.reach, RANGES.reach)) bad.push(`reach=${f.reach}`);
    if (!IMPACT_VALUES.includes(f.impact)) bad.push(`impact=${f.impact}`);
    if (!inRange(f.confidence, RANGES.confidence)) bad.push(`confidence=${f.confidence}`);
    if (!inRange(f.effort, RANGES.effort)) bad.push(`effort=${f.effort}`);
    if (bad.length) { problems.push(`priority_factors[${i}]: ${bad.join(', ')}`); return; }

    factors.push({
      feature_id: f.feature_id,
      reach: f.reach,
      impact: f.impact,
      confidence: f.confidence,
      effort: f.effort,
      rationale: f.rationale ?? null,
      citations: Array.isArray(f.citations) ? f.citations : [],
      priority_score: computeScore(f),
    });
  });

  return {
    factors,
    problems,
    features_without_factors: [...known].filter((id) => !factors.some((f) => f.feature_id === id)),
  };
}
