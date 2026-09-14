// Matching extracted requirements to labelled ones (ADR 0008).
//
// The whole instrument is here, and it is deliberately dull: an extracted requirement
// matches a label when one of its citation spans OVERLAPS a region that label was drawn
// from, and the `kind` agrees. No string similarity, no embedding, no edit distance, no
// model, and no tuned constant anywhere — a headline accuracy figure produced by a
// matcher with a knob on it is a figure someone can turn.
//
// Overlap rather than equality because the model quotes the minimal span carrying the
// requirement and the label quotes the sentence; requiring identical spans would measure
// how the answer key was punctuated.

import { overlaps } from './labels.mjs';

/**
 * @param extracted  [{ req_id, kind, statement, citations: [{start_char, end_char}] }]
 * @param labels     [{ label_id, kind, statement }]
 * @param regionsByLabel  Map<label_id, [{start_char, end_char}]>
 *
 * Returns { rows, matched, misses, counts, recall, precision }.
 *
 * Verdicts, one per extracted requirement:
 *   match          overlaps an unclaimed label of the same kind
 *   over_split     overlaps a label another extraction already claimed — counted as a
 *                  false positive, because splitting one requirement into three is three
 *                  cards for an engineer to reconcile, not one requirement found harder
 *   wrong_kind     overlaps a label but calls it something else
 *   false_positive overlaps no label at all
 */
export function matchRequirements(extracted, labels, regionsByLabel) {
  const claimed = new Map();   // label_id -> req_id that claimed it
  const rows = [];

  for (const e of extracted) {
    const spans = e.citations ?? [];
    const touching = labels.filter((l) =>
      spans.some((s) => overlaps(s, regionsByLabel.get(l.label_id) ?? [])));
    const sameKind = touching.filter((l) => l.kind === e.kind);
    const free = sameKind.find((l) => !claimed.has(l.label_id));

    if (free) {
      claimed.set(free.label_id, e.req_id);
      rows.push({ req_id: e.req_id, verdict: 'match', label_id: free.label_id, statement: e.statement });
    } else if (sameKind.length) {
      rows.push({
        req_id: e.req_id, verdict: 'over_split', label_id: sameKind[0].label_id,
        statement: e.statement,
        detail: `already matched by ${claimed.get(sameKind[0].label_id)}`,
      });
    } else if (touching.length) {
      rows.push({
        req_id: e.req_id, verdict: 'wrong_kind', label_id: touching[0].label_id,
        statement: e.statement,
        detail: `extracted as ${e.kind}, labelled ${touching[0].kind}`,
      });
    } else {
      rows.push({ req_id: e.req_id, verdict: 'false_positive', label_id: null, statement: e.statement });
    }
  }

  const misses = labels.filter((l) => !claimed.has(l.label_id));
  const counts = {
    extracted: extracted.length,
    labelled: labels.length,
    match: rows.filter((r) => r.verdict === 'match').length,
    over_split: rows.filter((r) => r.verdict === 'over_split').length,
    wrong_kind: rows.filter((r) => r.verdict === 'wrong_kind').length,
    false_positive: rows.filter((r) => r.verdict === 'false_positive').length,
    missed: misses.length,
  };

  return {
    rows,
    misses,
    counts,
    // Reported alongside the counts, never instead of them: a rate over fourteen items
    // moves for uninteresting reasons (docs/reporting.md).
    recall: labels.length ? counts.match / labels.length : null,
    precision: extracted.length ? counts.match / extracted.length : null,
  };
}
