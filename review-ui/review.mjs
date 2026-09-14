// The review gate: what a PM decides, and what the screen is allowed to claim.
//
// Everything here is COMPUTED FROM ROWS at the moment it is asked for. There is no
// `is_ready` column, no stored summary and no cached rate (docs/contracts.md §4). Derived
// state goes stale, and a stale readiness flag is the one that lets a half-reviewed document
// through.
//
// The division this file exists to hold:
//
//   the browser  disables a button as a COURTESY
//   this file    recomputes readiness at sign-off, from the rows, for a caller who never
//                loaded the page
//   the trigger  refuses the state change regardless (ADR 0006)
//
// Three layers, and only the last two are guarantees.

import { all, get } from './db.mjs';

/** Every item on a version that a human has to decide about. */
export function decidableItems(versionId) {
  const requirements = all(
    `SELECT req_id AS item_id, statement AS text, grounded, pm_authored
     FROM requirements WHERE prd_version_id=? ORDER BY req_id`, [versionId])
    .map((r) => ({ ...r, item_type: 'requirement', grounded: Boolean(r.grounded), pm_authored: Boolean(r.pm_authored) }));

  const stories = all(
    `SELECT story_id AS item_id, i_want AS text FROM stories WHERE prd_version_id=? ORDER BY story_id`,
    [versionId]).map((s) => ({ ...s, item_type: 'story' }));

  return { requirements, stories };
}

/**
 * The decisions taken so far, latest per item.
 *
 * Actions are APPEND-ONLY: correcting a decision is another action with its own reason, never
 * a mutation (E4-S1). So "the decision" is the most recent row, and the history stays whole.
 */
export function decisions(versionId) {
  const rows = all(
    `SELECT a.item_type, a.item_id, a.decision, a.reason, a.before_text, a.after_text, a.created_at
     FROM review_actions a JOIN review_sessions s ON s.session_id = a.session_id
     WHERE s.prd_version_id=? ORDER BY a.action_id`, [versionId]);

  const latest = new Map();
  for (const r of rows) latest.set(`${r.item_type}:${r.item_id}`, r);
  return { all: rows, latest };
}

/**
 * Readiness, recomputed from the rows every single time.
 *
 * **Every requirement and every story must carry a decision.** A rejected item counts as
 * decided — it is excluded from the approved content with its reason, which was the E4
 * decision on 2026-09-01, and blocking sign-off on a rejection would make rejecting expensive
 * enough that nobody would do it.
 */
export function readiness(versionId) {
  const { requirements, stories } = decidableItems(versionId);
  const { latest } = decisions(versionId);
  const items = [...requirements, ...stories];

  const undecided = items
    .filter((i) => !latest.has(`${i.item_type}:${i.item_id}`))
    .map((i) => ({ item_type: i.item_type, item_id: i.item_id }));

  return {
    ready: items.length > 0 && undecided.length === 0,
    total: items.length,
    decided: items.length - undecided.length,
    undecided,
    // Named separately because "nothing to decide" and "everything decided" are different
    // states that would otherwise both read as ready.
    empty: items.length === 0,
  };
}

/**
 * The screen's own numbers, computed at render.
 *
 * A rate never appears without its denominator (docs/reporting.md): "12 of 14", never "86%"
 * alone. The percentage is provided beside the counts, never instead of them.
 */
export function figures(versionId) {
  const { requirements, stories } = decidableItems(versionId);
  const { all: actions } = decisions(versionId);

  // M1's exclusions, both of them, in one place: an edited requirement and a first-party one
  // are out of the grounding rate. A rate that counted either would rise for the wrong reason.
  const counted = requirements.filter((r) => !r.pm_authored);
  const grounded = counted.filter((r) => r.grounded).length;

  const byDecision = {};
  for (const a of actions) byDecision[a.decision] = (byDecision[a.decision] ?? 0) + 1;

  const version = get(
    'SELECT state, park_reason, degraded FROM prd_versions WHERE prd_version_id=?', [versionId]);

  return {
    requirements: requirements.length,
    requirements_excluded_from_grounding: requirements.length - counted.length,
    grounded,
    grounded_of: counted.length,
    grounding_rate: counted.length ? grounded / counted.length : null,
    ungrounded: counted.length - grounded,
    stories: stories.length,
    epics: get('SELECT COUNT(*) AS n FROM epics WHERE prd_version_id=?', [versionId]).n,
    features: get('SELECT COUNT(*) AS n FROM features WHERE prd_version_id=?', [versionId]).n,
    open_questions: get('SELECT COUNT(*) AS n FROM open_questions WHERE prd_version_id=?', [versionId]).n,
    // Overrides are counted SEPARATELY, everywhere, always. They never blend into approvals
    // (docs/reporting.md).
    approved: byDecision.approve ?? 0,
    approved_ungrounded: byDecision.approve_ungrounded ?? 0,
    rejected: byDecision.reject ?? 0,
    edited: byDecision.edit ?? 0,
    state: version?.state ?? null,
    park_reason: version?.park_reason ?? null,
    degraded: Boolean(version?.degraded),
  };
}

/**
 * The caveat line, COMPUTED FROM STATE and never written by hand.
 *
 * That it is computed is the whole point: a hand-written caveat is a caveat someone has to
 * remember to remove, and the one that never gets removed is the one nobody believes. This
 * returns an empty list for a clean version, and the screen shows nothing.
 */
export function caveats(versionId) {
  const f = figures(versionId);
  const out = [];

  if (f.park_reason) out.push(`This version is parked: ${f.park_reason}. It is not a complete PRD.`);
  if (f.degraded) out.push('This version was produced by a degraded run — a stage failed and the run continued.');
  if (f.ungrounded > 0) {
    out.push(`${f.ungrounded} of ${f.grounded_of} requirements could not be verified against the source.`);
  }
  if (f.approved_ungrounded > 0) {
    out.push(`${f.approved_ungrounded} unverified item(s) were approved on a reviewer's judgement, not on evidence.`);
  }
  if (f.requirements_excluded_from_grounding > 0) {
    out.push(`${f.requirements_excluded_from_grounding} requirement(s) are excluded from the grounding rate: `
      + 'they were edited by the reviewer or came from a document the PM wrote themselves.');
  }
  if (f.epics === 0 && f.requirements > 0) out.push('No epics were produced: this PRD is a flat list.');
  return out;
}

/**
 * The version a version was derived from, or null — read from the content `applyDelta` wrote,
 * never guessed from the numbering (E6-S3).
 *
 * Returns the same `{ prd_version_id }` shape the fallback query does, so the caller does not
 * have to know which answered.
 */
export function predecessorOf(versionId) {
  const row = get('SELECT content FROM prd_versions WHERE prd_version_id=?', [versionId]);
  if (!row) return null;
  let from = null;
  try { from = JSON.parse(row.content)?.derived_from ?? null; } catch { return null; }
  if (from === null || from === undefined) return null;
  // The row must still exist. A `derived_from` pointing at nothing is a dangling reference, and
  // returning it would hand the caller a version id that fetches an empty comparison.
  const exists = get('SELECT prd_version_id FROM prd_versions WHERE prd_version_id=?', [from]);
  return exists ?? null;
}

/**
 * VERSION HISTORY, the read model behind the browsable chain (E6-S3).
 *
 * Every version of one PRD, newest first, with its state, when it was approved, what it was
 * derived from, and what changed between it and that predecessor.
 *
 * **The changes are READ from `prd_changes`, never recomputed by diffing text.** A diff produced
 * now describes today's parser; the row describes what was decided, and it has to survive the
 * text it describes being replaced. That is the whole point of a changelog, and it is the one
 * property of this function worth guarding — `verify-version-chain` asserts it from the source.
 */
export function versionHistory(prdId, limit = 50) {
  // BOUNDED, AND THE BOUND IS STATED. `PRD-forgesight` carries 1,206 versions — a read model
  // that returns all of them is a several-megabyte response and a page nobody can scroll. The
  // cap is on the RESPONSE, never on the truth: `versions_total` is counted separately, so a
  // reader is told what they are not being shown rather than being shown a short list that
  // looks complete.
  const total = get('SELECT COUNT(*) AS n FROM prd_versions WHERE prd_id=?', [prdId])?.n ?? 0;
  if (!total) return null;
  const versions = all(
    `SELECT prd_version_id, version_no, state, created_at, approved_at, trace_id, content
       FROM prd_versions WHERE prd_id=? ORDER BY version_no DESC LIMIT ?`, [prdId, limit]);

  const changes = all(
    `SELECT prd_version_id, kind, req_id, old_text, new_text, doc_id
       FROM prd_changes
      WHERE prd_version_id IN (SELECT prd_version_id FROM prd_versions WHERE prd_id=?)
      ORDER BY change_id`, [prdId]);
  const changesTotal = changes.length;

  const byVersion = new Map();
  for (const c of changes) {
    if (!byVersion.has(c.prd_version_id)) byVersion.set(c.prd_version_id, []);
    byVersion.get(c.prd_version_id).push(c);
  }

  return {
    prd_id: prdId,
    versions_total: total,
    versions_shown: versions.length,
    changes_total: changesTotal,
    // Printed rather than assumed to be one. It is not one on `PRD-forgesight`, and a screen
    // that shows the chain must not imply a tidiness the rows do not have (E6-S3).
    //
    // Counted over the WHOLE PRD, not over the page: a caveat that said "one approved version"
    // because the other nineteen fell off the end of a LIMIT would be the most misleading
    // number on the screen.
    approved_count: get(
      "SELECT COUNT(*) AS n FROM prd_versions WHERE prd_id=? AND state='approved'", [prdId])?.n ?? 0,
    superseded_count: get(
      "SELECT COUNT(*) AS n FROM prd_versions WHERE prd_id=? AND state='superseded'", [prdId])?.n ?? 0,
    versions: versions.map((v) => {
      const mine = byVersion.get(v.prd_version_id) ?? [];
      let content = {};
      try { content = JSON.parse(v.content) ?? {}; } catch { /* a version whose content is
        unreadable is still a version, and saying so beats dropping it from its own history */ }
      return {
        prd_version_id: v.prd_version_id,
        version_no: v.version_no,
        state: v.state,
        created_at: v.created_at,
        approved_at: v.approved_at,
        trace_id: v.trace_id,
        derived_from: content.derived_from ?? null,
        requirements: Array.isArray(content.requirements) ? content.requirements.length : null,
        source_doc_ids: content.source_doc_ids ?? [],
        changes: mine,
        change_counts: mine.reduce((acc, c) => ({ ...acc, [c.kind]: (acc[c.kind] ?? 0) + 1 }), {}),
      };
    }),
  };
}

/**
 * The trend against the previous version.
 *
 * **Returns "no prior version" until E6 makes one exist** (decided 2026-09-01). It is not
 * faked, hidden, or shown as zero — a zero would read as "no change", which is a claim, and
 * there is nothing to compare against.
 */
export function trend(versionId) {
  const v = get('SELECT prd_id, version_no FROM prd_versions WHERE prd_version_id=?', [versionId]);
  if (!v) return { available: false, reason: 'no such version' };

  // A LOWER VERSION NUMBER IS NOT A PREDECESSOR, and the first version of this function
  // assumed it was. Every fixture in this project ingests under one `prd_id`, so "the
  // previous version" was the previous unrelated document — and the screen would have shown
  // "requirements: 6 -> 13" as though something had grown.
  //
  // A version has a predecessor when it was produced FROM one: WF3 writes `prd_changes` rows
  // describing what moved. Until E6 builds that, no version has one, and this returns "no
  // prior version" — which is what E4-S5 asks for, and is not the same as showing zero.
  // THE PREDECESSOR IS THE ONE IT WAS DERIVED FROM (E6-S3), read off the version's own content.
  // The paragraph above says a lower version number is not a predecessor, and until this story
  // the function then picked one by number anyway — made safe only by the `prd_changes` guard,
  // because only WF3 writes those rows. "Safe because of a second fact" is not the same as
  // correct, and `derived_from` is what `applyDelta` wrote down at the moment it knew.
  let prior = predecessorOf(versionId);

  // The old guard, kept as a FALLBACK for versions minted before `derived_from` was recorded.
  // Those have `prd_changes` rows and nothing else to go on, so the number is the best available
  // answer for them and the worst available answer for anything newer.
  if (!prior) {
    const derived = get('SELECT COUNT(*) AS n FROM prd_changes WHERE prd_version_id=?', [versionId]);
    if (!derived?.n) return { available: false, reason: 'no prior version' };
    prior = get(`SELECT prd_version_id FROM prd_versions
                  WHERE prd_id=? AND version_no < ? ORDER BY version_no DESC LIMIT 1`,
    [v.prd_id, v.version_no]);
  }
  if (!prior) return { available: false, reason: 'no prior version' };
  const now = figures(versionId);
  const was = figures(prior.prd_version_id);
  return {
    available: true,
    prior_version_id: prior.prd_version_id,
    requirements: [was.requirements, now.requirements],
    grounded: [was.grounded, now.grounded],
  };
}
