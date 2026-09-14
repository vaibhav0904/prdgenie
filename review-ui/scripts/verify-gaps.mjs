// The instrument checks for E3-S4: open questions.
//
// Every row here is a claim the story makes, exercised against `gaps.mjs` directly rather
// than through a model call — the shape rules are code, and code can be tested without
// spending a run. The end-to-end behaviour (does the detector actually find T3's argument)
// is measured separately, by producing fixtures.
//
// Usage:  .\run.cmd review-ui/scripts/verify-gaps.mjs

import { readFileSync } from 'node:fs';
import {
  NFR_CATEGORIES, KINDS, DROP_REASONS, groundOpenQuestions, assertModelDidNotSetOwnedFields,
} from '../gaps.mjs';

// Every reason this file actually causes, collected as it goes, so the coverage claim at the
// bottom is derived from the run rather than typed from memory.
const exercised = new Set();
const drops = (r) => { for (const d of r.dropped) exercised.add(d.reason); return r; };

const PROMPT = 'n8n/prompts/detect-ambiguity.md';
const TEXT = 'Ravi said we should ship CSV import. Nadia said not in this release. '
  + 'Priyanka said we will pick that up next week.';

let failures = 0;
let checks = 0;
const say = (id, pass, msg) => {
  checks++;
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${msg}`);
};

// --- TC7: the two copies of the checklist agree -------------------------------------------
//
// The categories live in the prompt (so the model can choose) and in the code (so an
// off-list answer is dropped). Two copies of a constant kept in step by memory is a drift
// waiting to happen, and the drift would show up as a silent rise in the drop count.
const md = readFileSync(PROMPT, 'utf8');
const listed = [...md.matchAll(/^- `([a-z ]+)`$/gm)].map((m) => m[1]);
const missingFromPrompt = NFR_CATEGORIES.filter((c) => !listed.includes(c));
const extraInPrompt = listed.filter((c) => !NFR_CATEGORIES.includes(c));
say('TC7', listed.length > 0, `the prompt lists a checklist at all (${listed.length} entries found)`);
say('TC7', missingFromPrompt.length === 0 && extraInPrompt.length === 0,
  `prompt and code list the same ${NFR_CATEGORIES.length} categories`
  + (missingFromPrompt.length ? ` — missing from prompt: ${missingFromPrompt.join(', ')}` : '')
  + (extraInPrompt.length ? ` — extra in prompt: ${extraInPrompt.join(', ')}` : ''));

// --- TC2..TC6, TC16: shape rules, each exercised in its dropping direction ------------------
//
// Every one of these is a drop path. A drop path that has never dropped anything is
// untested, and the whole reason drops are counted rather than silent is so this file can
// see them (BUG-001's lesson, applied to a code path rather than a check).
const q = (over) => ({
  kind: 'unanswered',
  category: null,
  question: 'What is told to the accounts that asked?',
  citations: [{ quote: 'Nadia said not in this release', start_char: 0, end_char: 0 }],
  ...over,
});

const cases = [
  ['TC2', 'a fourth kind is dropped', q({ kind: 'assumption' }), 'unknown_kind'],
  ['TC2', 'an empty question is dropped', q({ question: '   ' }), 'empty_question'],
  ['TC3', 'a conflict with one citation is dropped — one quote cannot show a disagreement',
    q({ kind: 'conflict' }), 'conflict_needs_both_sides'],
  ['TC4', 'an unanswered question with no citation is dropped', q({ citations: [] }), 'no_citation'],
  ['TC5', 'a missing_nfr carrying citations is dropped, not stripped',
    q({ kind: 'missing_nfr', category: 'security' }), 'missing_nfr_with_citations'],
  ['TC6', 'a category off the checklist is dropped',
    q({ kind: 'missing_nfr', category: 'observability', citations: [] }), 'category_off_checklist'],
];

for (const [id, msg, item, reason] of cases) {
  const r = drops(groundOpenQuestions(TEXT, [item]));
  say(id, r.open_questions.length === 0 && r.dropped[0]?.reason === reason,
    `${msg} (reason=${r.dropped[0]?.reason ?? 'NOT DROPPED'})`);
}

// --- TC17 (BUG-019): a document that is not about the product asks nothing -----------------
//
// G1 parked correctly with zero requirements and then asked "What is the biscuit budget?".
// The question was real and the detector was right; it was never told that PRODUCT was the
// test. Both directions matter here more than anywhere else in this file, because a gate
// that drops everything would "fix" this bug and destroy the feature.
const threeReal = [
  {
    kind: 'conflict',
    question: 'Does CSV import ship in this release?',
    citations: [
      { quote: 'Ravi said we should ship CSV import', start_char: 0, end_char: 0 },
      { quote: 'Nadia said not in this release', start_char: 0, end_char: 0 },
    ],
  },
  q({}),
  { kind: 'missing_nfr', category: 'scale', question: 'How many tenants?', citations: [] },
];

const notProduct = drops(groundOpenQuestions(TEXT, threeReal, { concernsProduct: false }));
say('TC17', notProduct.open_questions.length === 0,
  `three well-formed questions from a non-product document are all dropped (${notProduct.open_questions.length} kept)`);
say('TC17', notProduct.dropped.length === 3
  && notProduct.dropped.every((d) => d.reason === 'document_not_about_product'),
  'each drop is counted under its own reason — a detector that produced ten is not invisible');
say('TC17', notProduct.total === 0 && notProduct.grounded === 0 && notProduct.ungrounded === 0,
  'the envelope counters agree with the empty list');

const isProduct = groundOpenQuestions(TEXT, threeReal, { concernsProduct: true });
say('TC17', isProduct.open_questions.length === 3 && isProduct.dropped.length === 0,
  `MUST NOT FIRE: the same three survive when the document IS about the product (${isProduct.open_questions.length} kept)`);
say('TC17', groundOpenQuestions(TEXT, threeReal).open_questions.length === 3,
  'and the judgement defaults to keeping — the endpoint refuses a missing one before this point, '
  + 'so a silent false here would hide that refusal');

// --- the keeping direction, so the rules are not simply "drop everything" -------------------
const good = groundOpenQuestions(TEXT, [
  {
    kind: 'conflict',
    category: null,
    question: 'Does CSV import ship in this release?',
    citations: [
      { quote: 'Ravi said we should ship CSV import', start_char: 0, end_char: 0 },
      { quote: 'Nadia said not in this release', start_char: 0, end_char: 0 },
    ],
  },
  q({}),
  { kind: 'missing_nfr', category: 'data retention', question: 'How long is imported data kept?', citations: [] },
]);
say('TC2', good.open_questions.length === 3 && good.dropped.length === 0,
  `all three legal kinds are kept (${good.open_questions.length} kept, ${good.dropped.length} dropped)`);
say('TC2', KINDS.every((k) => good.counts[k] === 1), `counts are per kind: ${JSON.stringify(good.counts)}`);

// --- TC11/TC15: code sets match_kind and grounded; the model never does ---------------------
const conflict = good.open_questions.find((x) => x.kind === 'conflict');
say('TC11', conflict.citations.every((c) => c.match_kind === 'exact'),
  'code resolved both sides of the conflict and set match_kind itself');
say('TC11', conflict.citations.every((c) => Number.isInteger(c.start_char)),
  'offsets are rewritten to where the quote was actually found');
const nfr = good.open_questions.find((x) => x.kind === 'missing_nfr');
say('TC11', nfr.grounded === null,
  'missing_nfr is grounded=null, not false — there is nothing to look for, so "not found" would be a lie');

// --- TC15: fabricated evidence is visible, not silently presented ---------------------------
const fabricated = groundOpenQuestions(TEXT, [{
  kind: 'conflict',
  category: null,
  question: 'Invented?',
  citations: [
    { quote: 'Ravi said we should ship CSV import', start_char: 0, end_char: 0 },
    { quote: 'Nadia said we would sunset the product entirely', start_char: 0, end_char: 0 },
  ],
}]);
say('TC15', fabricated.open_questions.length === 1 && fabricated.open_questions[0].grounded === false,
  'a conflict with one unlocatable quote is KEPT and flagged ungrounded, not dropped and not silently trusted');
say('TC15', fabricated.open_questions[0].citations.some((c) => c.match_kind === 'not_found'),
  'and the offending quote is marked not_found by name');
say('TC15', fabricated.ungrounded === 1, `the envelope counts it: ungrounded=${fabricated.ungrounded}`);

// --- TC8: the model may not certify its own grounding ---------------------------------------
say('TC8', assertModelDidNotSetOwnedFields([q({ grounded: true })]).length === 1,
  'a model-supplied `grounded` is reported as an offender, not ignored');
say('TC8', assertModelDidNotSetOwnedFields([
  q({ citations: [{ quote: 'x', start_char: 0, end_char: 0, match_kind: 'exact' }] }),
]).length === 1, 'a model-supplied `match_kind` is reported as an offender');
// The clean case must use a RAW model payload, not the output of groundOpenQuestions.
// Feeding the latter back in fails — correctly — because code has stamped `match_kind` on
// every citation by then. Worth stating: this assert belongs on the way IN, and running it
// on the way out would reject the system's own work.
say('TC8', assertModelDidNotSetOwnedFields([
  q({}),
  { kind: 'missing_nfr', category: 'scale', question: 'How many tenants?', citations: [] },
]).length === 0, 'a clean inbound payload produces no offenders');

// --- TC9: open questions can never block assembly ------------------------------------------
//
// Three assemblies of the same requirements: none, all-malformed, and well-formed. The PRD
// must come out identical in every respect except the open questions themselves. This is
// the acceptance criterion that says the most valuable thing a meeting leaves behind must
// not be able to stop the document it belongs to.
const { ingest, getDocument } = await import('../ingest.mjs');
const { assemble } = await import('../assemble.mjs');

const PRODUCT = `verify-gaps-${Date.now()}`;
const SRC = 'Priya (Eng Lead): Charts must export as PNG.\nMarcus (Head of Product): And p95 under two seconds.';
const env = ingest({ doc_type: 'transcript', product_id: PRODUCT, source_channel: 'webhook', raw_text: SRC });
const doc = getDocument(env.doc_id);
const reqs = [{
  req_id: 'REQ-001', kind: 'functional', statement: 'Charts export as PNG.',
  stakeholder: 'Priya (Eng Lead)', confidence: 'high', grounded: true,
  citations: [{ quote: 'Charts must export as PNG', start_char: SRC.indexOf('Charts must export as PNG'), end_char: SRC.indexOf('Charts must export as PNG') + 25, match_kind: 'exact' }],
}];
const extraction = { document_subject: 'an analytics dashboard product', concerns_product: true };

const runWith = (raw) => {
  const g = groundOpenQuestions(SRC, raw);
  const e = assemble(doc, reqs, null, extraction, g.open_questions);
  return { e, g };
};

const none = runWith([]);
const junk = runWith([
  { kind: 'assumption', question: 'x', citations: [] },
  { kind: 'conflict', question: 'one-sided', citations: [{ quote: 'Charts must export as PNG', start_char: 0, end_char: 0 }] },
  { kind: 'missing_nfr', category: 'observability', question: 'off list', citations: [] },
]);
const real = runWith([
  { kind: 'missing_nfr', category: 'data retention', question: 'How long is chart data kept?', citations: [] },
]);

for (const [name, r] of [['no open questions', none], ['all malformed', junk], ['well formed', real]]) {
  say('TC9', r.e.status === 'ok' && r.e.payload.state === 'in_review',
    `${name}: assembles to in_review (status=${r.e.status})`);
}
say('TC9', none.e.payload.total === junk.e.payload.total && junk.e.payload.total === real.e.payload.total,
  `the requirement count is identical across all three (${real.e.payload.total})`);
say('TC9', junk.g.dropped.length === 3 && junk.e.payload.open_questions === 0,
  `all three malformed items were dropped and counted, and none reached the PRD`);
say('TC9', real.e.payload.open_questions === 1,
  'the well-formed one did reach it — so "0" above means dropped, not broken');

// --- coverage, asserted rather than assumed (BUG-003) ---------------------------------------
//
// The summary is LAST on purpose. Written above the TC9 block, it printed a total that did
// not include the six checks after it, and would have exited 0 on their failure — a summary
// that reports on part of its own file.
const unexercised = DROP_REASONS.filter((r) => !exercised.has(r));
const unknown = [...exercised].filter((r) => !DROP_REASONS.includes(r));
console.log();
console.log(`Kinds in the contract: ${KINDS.length}. Kinds exercised in both directions: ${KINDS.length}.`);
say('COV', unexercised.length === 0 && unknown.length === 0,
  `drop reasons in gaps.mjs: ${DROP_REASONS.length}. Exercised here: ${exercised.size}.`
  + (unexercised.length ? ` NEVER FIRED: ${unexercised.join(', ')}` : '')
  + (unknown.length ? ` NOT IN THE CONTRACT: ${unknown.join(', ')}` : ''));
console.log();
if (failures) {
  console.error(`FAILED — ${failures} of ${checks} checks.`);
  process.exitCode = 1;
} else {
  console.log(`${checks}/${checks} passed. Every shape rule fires in the direction it is meant to,`);
  console.log('none of them fires on a well-formed item, and no arrangement of open questions');
  console.log('can stop a PRD being assembled.');
}
