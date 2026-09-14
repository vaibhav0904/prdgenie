// Cutting a contested passage out of a document, so it can be read on its own (BUG-023).
//
// THE MEASUREMENT THIS EXISTS FOR. A requirement spoken inside a disagreement is discarded
// with the disagreement: the extractor reduces a contested exchange to the one decision that
// came out of it and drops everything else said while arguing. The same sentence, in the same
// 6406-character document, moved out of the argument, is extracted 3 of 3; inside it, 0 of 7.
//
// One condition recovers it without moving anything: **the exchange on its own** — 776
// characters, 3 of 3, and it recovers the forty-one-million-row scale too. So the fix is not
// to ask the model to read better. It is to give it less to reduce, and that means cutting a
// passage out of the text — which is this file.
//
// The model says WHERE (a noticing task, and a different one from the reduction that fails).
// Code says WHAT: it locates both quotes with the same matcher a citation goes through, and a
// passage it cannot locate is DROPPED WITH A REASON rather than guessed at. Same division as
// grounding, for the same reason.

import { locate } from './grounding.mjs';

/** Why a passage was refused. A closed set, so a drop can be counted rather than read. */
export const PASSAGE_DROPS = Object.freeze([
  'opening_not_found',
  'closing_not_found',
  'ends_before_it_begins',
  'too_large_to_be_a_passage',
  'over_the_per_run_limit',
]);

// A passage that is most of the document is not a passage — re-reading it would recreate the
// exact condition that loses the requirement, while costing another model call to do it.
export const MAX_SHARE_OF_DOCUMENT = 0.6;

// Cost is bounded per run, and the bound is stated rather than discovered on a bill. Documents
// with more arguments than this get the first few; the rest are dropped, counted and named.
export const MAX_PASSAGES = 3;

/** Expand a span outwards to whole lines, so a speaker's name is never cut in half. */
function toLineBounds(text, start, end) {
  const from = text.lastIndexOf('\n', start) + 1;
  const nl = text.indexOf('\n', end);
  return { start: from, end: nl === -1 ? text.length : nl };
}

/**
 * @param rawText    the immutable source document (ADR 0003 — never mutated, only sliced)
 * @param contested  the model's `contested_passages`: {about, opening_quote, closing_quote}
 * @returns {{passages: object[], dropped: object[]}}
 */
export function cutPassages(rawText = '', contested = []) {
  const passages = [];
  const dropped = [];
  const text = String(rawText);

  const drop = (p, reason, detail) => dropped.push({
    about: p?.about ?? null, reason, ...(detail ? { detail } : {}),
  });

  for (const p of Array.isArray(contested) ? contested : []) {
    if (passages.length >= MAX_PASSAGES) { drop(p, 'over_the_per_run_limit'); continue; }

    const open = locate(text, { quote: p?.opening_quote ?? '' });
    if (open.match_kind === 'not_found') { drop(p, 'opening_not_found'); continue; }

    // The closing quote is searched with the opening offset as its hint, so a phrase that
    // occurs more than once resolves to the occurrence that follows the opening rather than
    // to the first one in the document.
    const close = locate(text, { quote: p?.closing_quote ?? '', start_char: open.end_char });
    if (close.match_kind === 'not_found') { drop(p, 'closing_not_found'); continue; }

    if (close.end_char <= open.start_char) {
      drop(p, 'ends_before_it_begins', `open@${open.start_char} close@${close.end_char}`);
      continue;
    }

    const { start, end } = toLineBounds(text, open.start_char, close.end_char);
    const share = text.length ? (end - start) / text.length : 1;
    if (share > MAX_SHARE_OF_DOCUMENT) {
      drop(p, 'too_large_to_be_a_passage', `${(share * 100).toFixed(0)}% of the document`);
      continue;
    }

    // Two arguments that overlap are one argument seen twice. Merging rather than sending
    // both keeps the cost bound honest and stops the same text being read twice.
    const overlapping = passages.find((q) => start < q.end_char && q.start_char < end);
    if (overlapping) {
      overlapping.start_char = Math.min(overlapping.start_char, start);
      overlapping.end_char = Math.max(overlapping.end_char, end);
      overlapping.passage = text.slice(overlapping.start_char, overlapping.end_char);
      overlapping.merged_with = [...(overlapping.merged_with ?? []), p?.about ?? null];
      continue;
    }

    passages.push({
      about: String(p?.about ?? '').slice(0, 200),
      start_char: start,
      end_char: end,
      passage: text.slice(start, end),
      share_of_document: Number(share.toFixed(3)),
    });
  }

  return { passages, dropped };
}

/**
 * Merge the second pass's requirements into the first pass's, AFTER both have been grounded.
 *
 * After, and not before, because grounding is what rewrites a citation's offsets to the span
 * the text actually contains. Two passes describing the same sentence agree on the span only
 * once code has located both; comparing the model's own hints would miss the duplicate and
 * ship it twice.
 *
 * Pass 1 always wins. It saw the whole document, so its statement resolves referents the
 * passage alone cannot, and a tie decided the other way would let a narrow reading overwrite
 * a broad one.
 */
const overlaps = (a, b) => a.start_char !== null && b.start_char !== null
  && a.start_char < b.end_char && b.start_char < a.end_char;

export function mergePasses(first = [], second = []) {
  const kept = [...first];
  const merged = [];
  const duplicates = [];

  for (const r of second) {
    const cites = (r.citations ?? []).filter((c) => Number.isInteger(c.start_char));
    const twin = kept.find((k) => (k.citations ?? []).some(
      (kc) => cites.some((rc) => overlaps(kc, rc))));

    if (twin) {
      duplicates.push({ req_id: r.req_id, duplicate_of: twin.req_id, statement: r.statement });
      continue;
    }
    // Nothing ungrounded is added by the second pass. Pass 1 keeps its ungrounded items
    // because a PM can see and judge them; a second pass volunteering an unlocatable quote
    // has invented something, and there is no reason to carry it.
    if (r.grounded !== true) {
      duplicates.push({ req_id: r.req_id, dropped: 'ungrounded_from_second_pass', statement: r.statement });
      continue;
    }
    kept.push(r);
    merged.push({ req_id: r.req_id, statement: r.statement });
  }

  return { requirements: kept, merged, duplicates };
}
