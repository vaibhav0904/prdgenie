// Unsettled positions: what the room argued about and never closed (BUG-007).
//
// This is the second box the extractor was missing. Four wordings across three cards told
// the model to notice an unsettled argument and say nothing about it, and it filed both
// sides as requirements about two runs in three — because it had correctly judged them
// important and had exactly one place to put anything. The fix is not a fifth prohibition;
// it is a destination, offered IN THE CALL THAT HAS TO CHOOSE (BUG-004's proven shape).
//
// WHY THIS IS NOT THE GAP DETECTOR'S JOB, when the detector already files `conflict`.
// Because the detector runs later and in a different model call: nothing a later stage adds
// changes what an earlier one can emit, which is precisely why E3-S4 did not close BUG-007.
// The detector still writes the QUESTION; this holds the POSITIONS, and the two are produced
// by different calls looking at the same document on purpose.
//
// WHY CODE OWNS SHAPE AND GROUNDING HERE, exactly as in gaps.mjs: the model may judge, and
// it may write prose. It may not decide whether its own quote is in the document.

import { locate } from './grounding.mjs';

/**
 * Every reason an entry can be dropped, named in one place so the verifier can assert it
 * has exercised all of them (BUG-003/019 — a hand-counted denominator cannot grow).
 */
export const DROP_REASONS = Object.freeze([
  'empty_position',
  'no_citation',
  'document_not_about_product',
]);

/**
 * Fields the model may not set. Same rule, and the same reason, as requirements and open
 * questions: ignoring a model-supplied `grounded` invites a later refactor to trust it, and
 * that failure would be silent (docs/contracts.md §1b).
 */
export function assertModelDidNotSetOwnedFields(positions) {
  const offenders = [];
  (positions ?? []).forEach((p, i) => {
    if ('grounded' in p && p.grounded !== null) offenders.push(`unsettled_positions[${i}].grounded`);
    (p.citations ?? []).forEach((c, j) => {
      if ('match_kind' in c) offenders.push(`unsettled_positions[${i}].citations[${j}].match_kind`);
    });
  });
  return offenders;
}

/** Do two citation spans touch the same text? Half-open intervals, so adjacency is not overlap. */
const spansOverlap = (a, b) => a.start_char < b.end_char && b.start_char < a.end_char;

/**
 * Reconcile the extractor's two outputs against each other (BUG-007, second attempt).
 *
 * MEASURED, then written. Given the new box, the model fills it correctly and reliably —
 * both sides of T3's auth argument, grounded, right stakeholders, 3 runs of 3 — and then
 * ALSO leaves one or both of them in `requirements`. The destination fixed the harder half
 * (recognising the argument) and not the easier one (staying quiet about it), which is the
 * same withholding failure this project has now measured six times.
 *
 * WHY THIS IS NOT THE OPTION THE CARD REJECTED. BUG-007's Option 2 dropped a requirement
 * because a SECOND model — the gap detector, a separate call — had called it contested.
 * That is one model's opinion deleting another's work. This drops a requirement because
 * **the same call, in the same response, said the same sentence was an unsettled position.**
 * It is not a second opinion; it is an internal contradiction, and code resolving it in
 * favour of the model's own explicit judgement is precisely the `concerns_product` gate
 * (BUG-004): the judgement wins and the list gives way.
 *
 * NOTHING IS DELETED. The requirement's statement is attached to the position it duplicates,
 * so the PM reading the argument sees exactly what the extractor had written as agreed —
 * which is the more useful place for it than the requirement list it did not belong in.
 *
 * Overlap is by citation span, the rule ADR 0008 already uses for matching. It is
 * re-implemented in this file rather than imported from the eval harness on purpose: the
 * product must not depend on the grader.
 */
export function reconcile(requirements, positions) {
  const positionSpans = (positions ?? []).map((p) => ({
    position: p,
    spans: (p.citations ?? []).filter((c) => c.match_kind && c.match_kind !== 'not_found'),
  }));

  const kept = [];
  const withdrawn = [];

  for (const r of requirements ?? []) {
    const spans = (r.citations ?? []).filter((c) => c.match_kind && c.match_kind !== 'not_found');
    const hit = positionSpans.find((ps) => ps.spans.some((a) => spans.some((b) => spansOverlap(a, b))));
    if (!hit) {
      kept.push(r);
      continue;
    }
    hit.position.also_stated_as = [...(hit.position.also_stated_as ?? []), r.statement];
    withdrawn.push({ req_id: r.req_id, statement: r.statement, position: hit.position.position });
  }

  return { requirements: kept, withdrawn };
}

/**
 * Ground and shape-check the unsettled positions from one extraction.
 *
 * Nothing throws and nothing here can fail a run: an argument the model described badly must
 * not cost the document its requirements (the rule E3-S4 set for open questions, applied to
 * the second new output rather than rediscovered later).
 */
export function groundUnsettled(rawText, positions, { concernsProduct = true } = {}) {
  const kept = [];
  const dropped = [];

  // BUG-019's gate, copied deliberately rather than assumed: a document that is not about
  // the product has no product argument in it either. Every new output needs its own copy of
  // every gate the old output has, and that lesson is one card old.
  if (concernsProduct === false) {
    for (const p of positions ?? []) {
      dropped.push({
        reason: 'document_not_about_product',
        position: typeof p?.position === 'string' ? p.position.trim() : '',
      });
    }
    return { unsettled_positions: [], dropped, total: 0, grounded: 0, ungrounded: 0 };
  }

  for (const p of positions ?? []) {
    const position = typeof p?.position === 'string' ? p.position.trim() : '';
    const citations = Array.isArray(p?.citations) ? p.citations : [];

    if (!position) {
      dropped.push({ reason: 'empty_position', position });
      continue;
    }
    // One quote is enough here, and that is not an oversight. A `conflict` open question
    // needs two because one quote cannot show a disagreement; a POSITION is one person's,
    // and the other side is a separate entry with its own quote.
    if (!citations.length) {
      dropped.push({ reason: 'no_citation', position });
      continue;
    }

    const located = citations.map((c) => ({ quote: c.quote, ...locate(rawText, c) }));
    kept.push({
      subject: typeof p.subject === 'string' ? p.subject.trim() : null,
      position,
      stakeholder: p.stakeholder ?? null,
      citations: located,
      grounded: located.every((c) => c.match_kind !== 'not_found'),
    });
  }

  return {
    unsettled_positions: kept,
    dropped,
    total: kept.length,
    // Counts, not a rate: a rate over two items moves for uninteresting reasons.
    grounded: kept.filter((p) => p.grounded === true).length,
    ungrounded: kept.filter((p) => p.grounded === false).length,
  };
}
