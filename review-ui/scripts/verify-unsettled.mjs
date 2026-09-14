// The instrument for BUG-007's second box: unsettled positions.
//
// Shape and grounding are code, so they are tested without spending a model call. Whether
// the model actually USES the box correctly — both sides of T3's auth argument in, and the
// tablet decision left out — is measured by producing fixtures, and those numbers live on
// the card.
//
// The trap this file exists to catch: a drawer the model can put anything in would remove
// this bug's symptom and cost the requirement list instead. So every rule is exercised in
// both directions, and the well-formed case is checked as hard as the malformed ones.
//
// Usage:  .\run.cmd review-ui/scripts/verify-unsettled.mjs

import {
  DROP_REASONS, groundUnsettled, reconcile, assertModelDidNotSetOwnedFields,
} from '../unsettled.mjs';

let failures = 0;
let checks = 0;
const say = (id, pass, msg) => {
  checks++;
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${msg}`);
};

const exercised = new Set();
const drops = (r) => { for (const d of r.dropped) exercised.add(d.reason); return r; };

const TEXT = 'Dara said every upload should overwrite silently. '
  + 'Wen said an upload must never replace an existing file. '
  + 'Ivo said we will decide it next week.';

const p = (over) => ({
  subject: 'replacing an uploaded file',
  position: 'An upload should overwrite the existing file silently.',
  stakeholder: 'Dara',
  citations: [{ quote: 'every upload should overwrite silently', start_char: 0, end_char: 0 }],
  ...over,
});

// --- TC10: every drop path fires, under its own reason -------------------------------------
const cases = [
  ['TC10', 'an entry with no position is dropped', p({ position: '   ' }), 'empty_position'],
  ['TC10', 'an entry with no citation is dropped — a position nobody said is not a position',
    p({ citations: [] }), 'no_citation'],
];
for (const [id, msg, item, reason] of cases) {
  const r = drops(groundUnsettled(TEXT, [item]));
  say(id, r.unsettled_positions.length === 0 && r.dropped[0]?.reason === reason,
    `${msg} (reason=${r.dropped[0]?.reason ?? 'NOT DROPPED'})`);
}

// BUG-019's gate, on the second output. Every new output needs its own copy of every gate
// the old output has, and that lesson is one card old.
const notProduct = drops(groundUnsettled(TEXT, [p({}), p({ stakeholder: 'Wen' })],
  { concernsProduct: false }));
say('TC10', notProduct.unsettled_positions.length === 0 && notProduct.dropped.length === 2
  && notProduct.dropped.every((d) => d.reason === 'document_not_about_product'),
  'a document that is not about the product has no product argument in it either');

// --- TC11: the keeping direction, checked as hard as the dropping one ----------------------
const both = groundUnsettled(TEXT, [
  p({}),
  p({
    position: 'An upload must never replace an existing file.',
    stakeholder: 'Wen',
    citations: [{ quote: 'an upload must never replace an existing file', start_char: 0, end_char: 0 }],
  }),
]);
say('TC11', both.unsettled_positions.length === 2 && both.dropped.length === 0,
  `both sides of one argument are kept as two entries (${both.unsettled_positions.length} kept)`);
say('TC11', both.unsettled_positions.every((x) => x.grounded === true),
  'and code grounded each of them against the document');
say('TC11', both.unsettled_positions.every((x) => x.citations.every((c) => c.match_kind === 'exact')),
  'code set match_kind itself, on every citation');
say('TC11', both.unsettled_positions.map((x) => x.stakeholder).join(',') === 'Dara,Wen',
  'each entry keeps whose position it was — the PM has to know who to go back to');
say('TC11', groundUnsettled(TEXT, [p({})]).unsettled_positions.length === 1,
  'ONE citation is enough for a position: the other side is a separate entry with its own quote');

// --- TC9: fabricated evidence is visible, not silently trusted ------------------------------
const fake = groundUnsettled(TEXT, [p({
  position: 'Uploads should be disabled entirely.',
  citations: [{ quote: 'Dara said uploads should be switched off for good', start_char: 0, end_char: 0 }],
})]);
say('TC9', fake.unsettled_positions.length === 1 && fake.unsettled_positions[0].grounded === false,
  'a position whose quote is not in the document is KEPT and flagged ungrounded, not dropped');
say('TC9', fake.ungrounded === 1, `and the envelope counts it (ungrounded=${fake.ungrounded})`);
say('TC9', assertModelDidNotSetOwnedFields([p({ grounded: true })]).length === 1,
  'a model-supplied `grounded` is reported as an offender, not ignored');
say('TC9', assertModelDidNotSetOwnedFields([
  p({ citations: [{ quote: 'x', start_char: 0, end_char: 0, match_kind: 'exact' }] }),
]).length === 1, 'a model-supplied `match_kind` is reported as an offender');
say('TC9', assertModelDidNotSetOwnedFields([p({})]).length === 0,
  'a clean inbound payload produces no offenders');

// --- TC18: the extractor's two outputs are reconciled against each other --------------------
//
// Measured before it was written: given the box, the model files both sides correctly 3 runs
// of 3 and then leaves one or both of them in `requirements` as well. This resolves that
// contradiction in favour of the model's own explicit judgement — and it must not touch
// anything else, which is what the second half of these rows is for.
const req = (over) => ({
  req_id: 'REQ-001', kind: 'functional', statement: 'An upload overwrites the existing file.',
  grounded: true,
  citations: [{ quote: 'every upload should overwrite silently', start_char: 10, end_char: 47, match_kind: 'exact' }],
  ...over,
});
const positions = groundUnsettled(TEXT, [p({})]).unsettled_positions;

const dup = reconcile([req({}), req({
  req_id: 'REQ-002', statement: 'Charts export as PNG.',
  citations: [{ quote: 'Ivo said we will decide it next week', start_char: 200, end_char: 236, match_kind: 'exact' }],
})], positions);
say('TC18', dup.requirements.length === 1 && dup.requirements[0].req_id === 'REQ-002',
  `the requirement citing the same span as an unsettled position is withdrawn (${dup.requirements.length} kept)`);
say('TC18', dup.withdrawn.length === 1 && dup.withdrawn[0].req_id === 'REQ-001'
  && Boolean(dup.withdrawn[0].position),
  'and the withdrawal names both the requirement and the position it duplicated');
say('TC18', (positions[0].also_stated_as ?? []).length === 1,
  'nothing is deleted: the statement is attached to the position, where a PM will read it');

say('TC18', reconcile([req({
  req_id: 'REQ-003', statement: 'Unrelated.',
  citations: [{ quote: 'Ivo said we will decide it next week', start_char: 200, end_char: 236, match_kind: 'exact' }],
})], groundUnsettled(TEXT, [p({})]).unsettled_positions).requirements.length === 1,
  'MUST NOT FIRE: a requirement citing a different span is untouched');
say('TC18', reconcile([req({})], []).requirements.length === 1,
  'MUST NOT FIRE: with no unsettled positions, every requirement survives');
say('TC18', reconcile([req({
  citations: [{ quote: 'made up', start_char: 10, end_char: 47, match_kind: 'not_found' }],
})], groundUnsettled(TEXT, [p({})]).unsettled_positions).requirements.length === 1,
  'MUST NOT FIRE: an unresolved citation cannot withdraw anything — a span that was never found is not a span');
// The position's quote resolves to [10, 48); a requirement starting exactly at 48 touches it
// and does not overlap it. The first version of this row used 47 and failed — the quote is
// 38 characters, not 37. **The test was wrong and the code was right**, which is worth one
// line here because the opposite conclusion is the expensive one to reach.
say('TC18', reconcile([req({
  citations: [{ quote: 'x', start_char: 48, end_char: 60, match_kind: 'exact' }],
})], groundUnsettled(TEXT, [p({})]).unsettled_positions).requirements.length === 1,
  'MUST NOT FIRE: touching at the boundary is not overlapping');

// --- TC14: unsettled positions can never block assembly -------------------------------------
//
// The rule E3-S4 set for open questions, applied to the second new output rather than
// rediscovered the hard way later.
const { ingest, getDocument } = await import('../ingest.mjs');
const { assemble } = await import('../assemble.mjs');

const PRODUCT = `verify-unsettled-${Date.now()}`;
const SRC = 'Priya (Eng Lead): Charts must export as PNG.\nMarcus (Head of Product): And p95 under two seconds.';
const env = ingest({ doc_type: 'transcript', product_id: PRODUCT, source_channel: 'webhook', raw_text: SRC });
const doc = getDocument(env.doc_id);
const reqs = [{
  req_id: 'REQ-001', kind: 'functional', statement: 'Charts export as PNG.',
  stakeholder: 'Priya (Eng Lead)', confidence: 'high', grounded: true,
  citations: [{ quote: 'Charts must export as PNG', start_char: 0, end_char: 25, match_kind: 'exact' }],
}];
const extraction = { document_subject: 'an analytics dashboard product', concerns_product: true };

const runWith = (raw) => {
  const g = groundUnsettled(SRC, raw);
  return { env: assemble(doc, reqs, null, extraction, [], g.unsettled_positions), g };
};

const none = runWith([]);
const junk = runWith([{ position: '', citations: [] }, { position: 'no quote', citations: [] }]);
const real = runWith([{
  subject: 'export format', position: 'Charts should also export as SVG.', stakeholder: 'Priya (Eng Lead)',
  citations: [{ quote: 'Charts must export as PNG', start_char: 0, end_char: 25 }],
}]);

for (const [name, r] of [['none', none], ['all malformed', junk], ['well formed', real]]) {
  say('TC14', r.env.status === 'ok' && r.env.payload.state === 'in_review',
    `${name}: assembles to in_review (status=${r.env.status})`);
}
say('TC14', none.env.payload.total === junk.env.payload.total
  && junk.env.payload.total === real.env.payload.total,
  `the requirement count is identical across all three (${real.env.payload.total})`);
say('TC14', junk.g.dropped.length === 2 && junk.env.payload.unsettled_positions === 0,
  'both malformed entries were dropped and counted, and neither reached the PRD');
say('TC14', real.env.payload.unsettled_positions === 1,
  'the well-formed one did reach it — so "0" above means dropped, not broken');

const { getVersion } = await import('../assemble.mjs');
const stored = getVersion(real.env.payload.prd_version_id);
say('TC14', (stored?.content?.unsettled_positions ?? []).length === 1,
  'and it is readable in the stored version content, where E4 will render it');

// --- TC12: coverage, derived from the run ----------------------------------------------------
const unexercised = DROP_REASONS.filter((r) => !exercised.has(r));
const unknown = [...exercised].filter((r) => !DROP_REASONS.includes(r));
console.log();
say('COV', unexercised.length === 0 && unknown.length === 0,
  `drop reasons in unsettled.mjs: ${DROP_REASONS.length}. Exercised here: ${exercised.size}.`
  + (unexercised.length ? ` NEVER FIRED: ${unexercised.join(', ')}` : '')
  + (unknown.length ? ` NOT IN THE CONTRACT: ${unknown.join(', ')}` : ''));

console.log();
if (failures) {
  console.error(`FAILED — ${failures} of ${checks} checks.`);
} else {
  console.log(`${checks}/${checks} passed. Both sides of an argument have somewhere to go, code`);
  console.log('decides whether each quote is real, and no arrangement of them can stop a PRD.');
  console.log('');
  console.log('This is the CODE half of BUG-007. Whether the model files the right things here');
  console.log('is measured by producing fixtures, and a green run here does not close that card.');
}
process.exitCode = failures ? 1 : 0;
