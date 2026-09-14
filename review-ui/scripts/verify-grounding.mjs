// Verifies E1-S4's deterministic half: the grounding check decides `grounded`, rewrites
// offsets to where quotes were actually found, and refuses to get looser.
//
// Does not create schema, and asserts its own coverage (BUG-001, BUG-003).

import { groundRequirements, locate, assertModelDidNotSetOwnedFields } from '../grounding.mjs';

const results = [];
const ok = (id, desc, pass, detail = '') => results.push({ id, desc, pass, detail });

const DOC = [
  'Priya (Eng Lead): The first chart must render in under two seconds.',
  'Marcus (Head of Product): Agreed — and   we   need    PNG export on every chart.',
].join('\n');

const cite = (quote, start = 0) => ({ quote, start_char: start, end_char: start + quote.length });

// --- TC8: exact match ---------------------------------------------------------
const exact = locate(DOC, cite('must render in under two seconds'));
ok('TC8', 'an exact quote is found and marked exact',
  exact.match_kind === 'exact' && DOC.slice(exact.start_char, exact.end_char) === 'must render in under two seconds',
  `${exact.match_kind} @${exact.start_char}`);

// --- TC9: whitespace-normalised fallback --------------------------------------
const loose = locate(DOC, cite('we need PNG export on every chart'));
ok('TC9', 'a quote differing only in whitespace is found via normalisation',
  loose.match_kind === 'whitespace_normalized',
  `${loose.match_kind} @${loose.start_char}`);
ok('TC9b', 'normalised offsets still index the ORIGINAL text',
  loose.start_char !== null
    && DOC.slice(loose.start_char, loose.end_char).replace(/\s+/g, ' ') === 'we need PNG export on every chart',
  JSON.stringify(DOC.slice(loose.start_char, loose.end_char)));

// --- TC10: a paraphrase is not grounded, and is kept --------------------------
const para = groundRequirements(DOC, [{
  req_id: 'REQ-001', kind: 'functional', statement: 'PNG export',
  citations: [cite('we require PNG export for all charts')],
}]);
ok('TC10', 'a paraphrase is not grounded, and the requirement is kept not dropped',
  para.requirements.length === 1 && para.requirements[0].grounded === false
    && para.requirements[0].citations[0].match_kind === 'not_found');

// --- TC11: offsets are rewritten ----------------------------------------------
const wrongHint = locate(DOC, { quote: 'PNG export', start_char: 9999, end_char: 10009 });
ok('TC11', 'a wrong model-supplied offset is replaced by the located one',
  wrongHint.match_kind === 'exact' && DOC.slice(wrongHint.start_char, wrongHint.end_char) === 'PNG export',
  `rewritten to @${wrongHint.start_char}`);

// Disambiguation: the hint chooses between real occurrences, and nothing else.
const twice = 'alpha TARGET beta TARGET gamma';
const near = locate(twice, { quote: 'TARGET', start_char: 20, end_char: 26 });
ok('TC11b', 'when a quote occurs twice, the hint picks the nearer occurrence',
  near.start_char === twice.lastIndexOf('TARGET'), `@${near.start_char}`);

// --- TC12: the matcher does not get looser ------------------------------------
const stemmed = locate(DOC, cite('must renders in under two second'));
const cased = locate(DOC, cite('MUST RENDER IN UNDER TWO SECONDS'));
ok('TC12', 'stemmed and case-changed near-matches are NOT accepted',
  stemmed.match_kind === 'not_found' && cased.match_kind === 'not_found',
  `stemmed=${stemmed.match_kind}, cased=${cased.match_kind}`);

// --- TC13: match kind recorded per citation -----------------------------------
const mixed = groundRequirements(DOC, [
  { req_id: 'R1', citations: [cite('must render in under two seconds')] },
  { req_id: 'R2', citations: [cite('we need PNG export on every chart')] },
  { req_id: 'R3', citations: [cite('nothing like this appears')] },
]);
ok('TC13', 'every citation carries a match_kind, and the summary counts them',
  mixed.requirements.every((r) => r.citations.every((c) => typeof c.match_kind === 'string'))
    && mixed.match_kinds.exact === 1 && mixed.match_kinds.whitespace_normalized === 1
    && mixed.match_kinds.not_found === 1,
  JSON.stringify(mixed.match_kinds));

ok('TC13b', 'grounding_rate is computed from the counts',
  mixed.total === 3 && mixed.grounded === 2 && Math.abs(mixed.grounding_rate - 2 / 3) < 1e-9,
  `${mixed.grounded}/${mixed.total}`);

// A requirement is grounded only if EVERY citation resolves.
const partial = groundRequirements(DOC, [{
  req_id: 'R4', citations: [cite('PNG export'), cite('this phrase is absent')],
}]);
ok('TC13c', 'one unresolvable citation makes the whole requirement ungrounded',
  partial.requirements[0].grounded === false);

// --- TC7: model-owned fields are rejected -------------------------------------
const offenders = assertModelDidNotSetOwnedFields([
  { req_id: 'R5', grounded: true, citations: [cite('PNG export')] },
]);
ok('TC7', 'a model-supplied `grounded` is reported as a schema violation',
  offenders.length === 1 && offenders[0] === 'R5.grounded', offenders.join(', '));

const clean = assertModelDidNotSetOwnedFields([
  { req_id: 'R6', grounded: null, citations: [cite('PNG export')] },
]);
ok('TC7b', 'an explicit null `grounded` is accepted (it is the contract default)',
  clean.length === 0);

// --- TC16: negative control ---------------------------------------------------
const fabricated = groundRequirements(DOC, [{
  req_id: 'R7', citations: [cite('the team agreed to ship on Tuesday')],
}]);
ok('TC16', 'a fabricated citation is caught — the check can go red',
  fabricated.grounded === 0 && fabricated.requirements[0].grounded === false);

// --- TC17: coverage ------------------------------------------------------------
const EXPECTED_ROWS = 13;
ok('TC17', 'coverage asserted: every planned assertion ran',
  results.length === EXPECTED_ROWS, `${results.length}/${EXPECTED_ROWS} assertions`);

// --- report ---------------------------------------------------------------------
const width = Math.max(...results.map((r) => r.desc.length));
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(6)} ${r.desc.padEnd(width)}${r.detail ? '  ' + r.detail : ''}`);
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.error('GROUNDING VERIFICATION FAILED'); process.exit(1); }
console.log('Grounding verified: code decides grounded, offsets are rewritten, the matcher stays strict.');
