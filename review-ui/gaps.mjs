// Open questions: what the room never settled.
//
// The model judges which passages are unsettled and phrases the question. Code decides
// three things, and the split is the same one used everywhere else in this project:
//
//   1. whether a quote is really in the document      -> grounding.mjs, unchanged
//   2. whether an item's SHAPE is legal                -> here
//   3. whether the run assembles                       -> assemble.mjs, and open questions
//                                                         never affect it
//
// WHY MALFORMED ITEMS ARE DROPPED AND COUNTED, rather than rejected or silently fixed.
//
// Open questions must never block assembly (E3-S4, decided 2026-09-01): a PRD is not held
// hostage because the detector had an off day. So a bad item cannot fail the run. But a bad
// item that simply vanished would make a detector emitting garbage indistinguishable from
// one emitting nothing — and "0 open questions" would be a number with two very different
// meanings. So every drop is counted under its own reason and travels in the envelope.
//
// This story builds the drawer that BUG-007, BUG-004 and BUG-018 all concluded was missing.
// Each of those three found the extractor correctly noticing an unsettled argument and
// filing it as a requirement, because a requirement was the only thing it could emit.

import { locate } from './grounding.mjs';

/**
 * The closed checklist. A CONSTANT, not a tuned parameter: changing it changes what C4
 * measures, so it changes with a written note (E3-S4 technical notes).
 *
 * The prompt lists these same six. `verify-gaps.mjs` asserts the two copies agree — two
 * copies of a constant kept in step by memory is a drift waiting to happen.
 */
export const NFR_CATEGORIES = Object.freeze([
  'performance', 'security', 'accessibility', 'data retention', 'scale', 'localization',
]);

export const KINDS = Object.freeze(['conflict', 'unanswered', 'missing_nfr']);

/** Minimum citations per kind. A conflict needs BOTH sides; one quote cannot show a disagreement. */
const MIN_CITATIONS = Object.freeze({ conflict: 2, unanswered: 1, missing_nfr: 0 });

/**
 * Every reason an item can be dropped, named in one place.
 *
 * `verify-gaps.mjs` asserts it has exercised all of them — derived, not counted by hand.
 * The hand-counted version of that line read "6 of 6" and would have gone on reading it on
 * the day a seventh reason was added, which is the coverage claim BUG-003 is about: a
 * denominator that cannot grow cannot report a gap.
 */
export const DROP_REASONS = Object.freeze([
  'unknown_kind',
  'empty_question',
  'missing_nfr_with_citations',
  'category_off_checklist',
  'conflict_needs_both_sides',
  'no_citation',
  'document_not_about_product',
]);

/**
 * Fields the model may not set, for the same reason as on requirements: ignoring a
 * model-supplied `grounded` invites a later refactor to start trusting it, and that failure
 * would be silent (docs/contracts.md §1b).
 *
 * Returns a list of offenders; an empty list means the payload is clean.
 */
export function assertModelDidNotSetOwnedFields(openQuestions) {
  const offenders = [];
  (openQuestions ?? []).forEach((q, i) => {
    if ('grounded' in q && q.grounded !== null) offenders.push(`open_questions[${i}].grounded`);
    (q.citations ?? []).forEach((c, j) => {
      if ('match_kind' in c) offenders.push(`open_questions[${i}].citations[${j}].match_kind`);
    });
  });
  return offenders;
}

/**
 * Ground and shape-check a set of open questions against one document.
 *
 * Returns { open_questions, dropped, counts } where `dropped` names each rejected item and
 * why. Nothing throws: this path may not fail a run.
 *
 * `concernsProduct` is the extractor's judgement, arriving here the same way it arrives at
 * assembly — see the wholesale drop below (BUG-019).
 */
export function groundOpenQuestions(rawText, openQuestions, { concernsProduct = true } = {}) {
  const kept = [];
  const dropped = [];

  // BUG-019. G1 — an all-hands about parking permits and a coffee machine — parked
  // correctly with zero requirements and then asked "What is the biscuit budget?",
  // grounded and cited. The question was real. It was not a PRODUCT question, and nothing
  // had told the detector that was the test: `concerns_product` is judged in the
  // extraction call and was never passed on.
  //
  // WHY THE GATE IS HERE and not only in the workflow. BUG-019's own lesson is that every
  // new output needs its own copy of every gate the old output has. The wiring skips the
  // detector call for a document that is not about the product; this is the copy that holds
  // when someone re-wires it, and it is the one a test can reach without n8n.
  //
  // WHY DROPPED WHOLESALE rather than kept as commentary. "Nothing" has meant "no
  // requirements" since E1-S3, and G1 is the fixture chosen because its correct answer is
  // nothing. A PM reading a park has been told this document is not about their product; an
  // unresolved question from it cannot inform a product decision, and one absurd question
  // costs the credibility of every real one beside it. Every drop is still counted and
  // named, so a detector that produced ten of them is never invisible.
  if (concernsProduct === false) {
    for (const q of openQuestions ?? []) {
      dropped.push({
        reason: 'document_not_about_product',
        kind: q?.kind ?? null,
        question: typeof q?.question === 'string' ? q.question.trim() : '',
      });
    }
    return {
      open_questions: [],
      dropped,
      counts: { conflict: 0, unanswered: 0, missing_nfr: 0 },
      total: 0,
      grounded: 0,
      ungrounded: 0,
      not_applicable: 0,
    };
  }

  for (const q of openQuestions ?? []) {
    const kind = q?.kind;
    const question = typeof q?.question === 'string' ? q.question.trim() : '';
    const citations = Array.isArray(q?.citations) ? q.citations : [];

    if (!KINDS.includes(kind)) {
      dropped.push({ reason: 'unknown_kind', kind: kind ?? null, question });
      continue;
    }
    if (!question) {
      dropped.push({ reason: 'empty_question', kind, question });
      continue;
    }

    if (kind === 'missing_nfr') {
      // Its evidence is an absence. An item arriving WITH citations is dropped rather than
      // stripped: stripping would hide a detector that thinks an absence has a quote, and
      // that is a misunderstanding worth seeing rather than tidying away.
      if (citations.length) {
        dropped.push({ reason: 'missing_nfr_with_citations', kind, question });
        continue;
      }
      const category = typeof q.category === 'string' ? q.category.trim().toLowerCase() : '';
      if (!NFR_CATEGORIES.includes(category)) {
        dropped.push({ reason: 'category_off_checklist', kind, category: q.category ?? null, question });
        continue;
      }
      // `grounded` is null, not false. There is nothing to ground, and false would read as
      // "we looked and it wasn't there" (docs/domain.md, "Grounded").
      kept.push({ kind, category, question, citations: [], grounded: null });
      continue;
    }

    if (citations.length < MIN_CITATIONS[kind]) {
      dropped.push({
        reason: kind === 'conflict' ? 'conflict_needs_both_sides' : 'no_citation',
        kind, question, citations: citations.length,
      });
      continue;
    }

    const located = citations.map((c) => ({ quote: c.quote, ...locate(rawText, c) }));
    kept.push({
      kind,
      category: null,
      question,
      citations: located,
      // Same rule as a requirement: grounded when EVERY citation resolves. A conflict
      // half-supported by the source is not supported by it.
      grounded: located.every((c) => c.match_kind !== 'not_found'),
    });
  }

  const counts = { conflict: 0, unanswered: 0, missing_nfr: 0 };
  for (const q of kept) counts[q.kind]++;

  return {
    open_questions: kept,
    dropped,
    counts,
    total: kept.length,
    // Reported as counts rather than a rate: a rate over three items moves for
    // uninteresting reasons (docs/reporting.md).
    grounded: kept.filter((q) => q.grounded === true).length,
    ungrounded: kept.filter((q) => q.grounded === false).length,
    not_applicable: kept.filter((q) => q.grounded === null).length,
  };
}
