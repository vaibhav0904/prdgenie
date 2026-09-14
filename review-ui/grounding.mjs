// The grounding check. This is the code that decides whether a requirement is grounded —
// the model never does, and a model-supplied `grounded` is a schema violation rather than
// a value to clean up (docs/contracts.md §1b).
//
// The quote is authoritative; the offsets are hints (ADR 0003). We search the whole
// document, so a wrong offset — or a chunk-relative one — costs nothing.

/**
 * Normalise whitespace only. This is the ONE softening the matcher is allowed.
 * Nothing else is ever added: no case folding, no stemming, no fuzzy distance. Each such
 * step would make the word "grounded" mean less, and the whole product claim rests on it.
 */
function squash(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/** All exact occurrences of `quote` in `text`. */
function exactOccurrences(text, quote) {
  const out = [];
  let i = text.indexOf(quote);
  while (i !== -1) { out.push(i); i = text.indexOf(quote, i + 1); }
  return out;
}

/**
 * Locate a whitespace-normalised quote in the original text, returning ORIGINAL offsets.
 * Built by walking the original and tracking where each normalised character came from,
 * so the offsets we store always index the real document.
 */
function normalizedOccurrence(text, quote) {
  const map = [];
  let norm = '';
  let pendingSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) { pendingSpace = norm.length > 0; continue; }
    if (pendingSpace) { norm += ' '; map.push(i); pendingSpace = false; }
    norm += ch; map.push(i);
  }
  const target = squash(quote);
  if (!target) return null;
  const at = norm.indexOf(target);
  if (at === -1) return null;
  return { start_char: map[at], end_char: map[at + target.length - 1] + 1 };
}

/**
 * Resolve one citation against the document text.
 * Returns { match_kind, start_char, end_char } — offsets REWRITTEN to where the quote was
 * actually found, never the model's originals.
 */
export function locate(text, citation) {
  const quote = citation?.quote ?? '';
  if (!quote.trim()) return { match_kind: 'not_found', start_char: null, end_char: null };

  const exact = exactOccurrences(text, quote);
  if (exact.length) {
    // The offset hint earns its keep only here: disambiguating a quote that appears more
    // than once. Otherwise the first occurrence is as good as any.
    const hint = Number.isInteger(citation.start_char) ? citation.start_char : 0;
    const best = exact.reduce((a, b) => (Math.abs(a - hint) <= Math.abs(b - hint) ? a : b));
    return { match_kind: 'exact', start_char: best, end_char: best + quote.length };
  }

  const loose = normalizedOccurrence(text, quote);
  if (loose) return { match_kind: 'whitespace_normalized', ...loose };

  return { match_kind: 'not_found', start_char: null, end_char: null };
}

/**
 * Ground a set of requirements against one document.
 *
 * A requirement is grounded when EVERY one of its citations resolves. Partial grounding is
 * not a thing: a requirement half-supported by the source is not supported by it.
 *
 * Nothing is dropped. An ungrounded requirement is kept, flagged, and rendered with a
 * badge — visible beats silent (docs/domain.md, "Grounded").
 */
export function groundRequirements(rawText, requirements) {
  const out = [];
  for (const req of requirements) {
    const citations = (req.citations ?? []).map((c) => ({
      quote: c.quote,
      ...locate(rawText, c),
    }));
    const grounded = citations.length > 0 && citations.every((c) => c.match_kind !== 'not_found');
    out.push({ ...req, citations, grounded });
  }
  const total = out.length;
  const groundedCount = out.filter((r) => r.grounded).length;
  return {
    requirements: out,
    // Reported as counts, not just a rate: a rate over a small denominator moves for
    // uninteresting reasons (docs/reporting.md).
    total,
    grounded: groundedCount,
    grounding_rate: total ? groundedCount / total : 0,
    match_kinds: out.flatMap((r) => r.citations).reduce((acc, c) => {
      acc[c.match_kind] = (acc[c.match_kind] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

/**
 * Reject a model response that tries to set fields the code owns.
 * Rejecting rather than ignoring is deliberate: ignoring invites a later refactor to
 * "just use the model's value", and the failure would be silent.
 */
export function assertModelDidNotSetOwnedFields(requirements) {
  const offenders = [];
  for (const r of requirements ?? []) {
    if ('grounded' in r && r.grounded !== null) offenders.push(`${r.req_id}.grounded`);
    for (const c of r.citations ?? []) {
      if ('match_kind' in c) offenders.push(`${r.req_id}.citation.match_kind`);
    }
  }
  return offenders;
}
