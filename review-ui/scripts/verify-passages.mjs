// The instrument for BUG-023's second pass: can code be trusted to cut a passage?
//
// The model says WHERE an argument was; this file is everything code does with that answer.
// It matters more than it looks: a passage cut wrongly is either a wasted model call or —
// worse — the whole document handed back to a stage whose entire purpose is to see less
// than the whole document.
//
// The endpoint is exercised over HTTP because that is how n8n reaches it; the merge is
// exercised directly, because it is a pure function and calling it through a workflow would
// only prove the workflow runs.
//
// Usage:  .\run.cmd review-ui/scripts/verify-passages.mjs
//
// Needs the review service running.

import { cutPassages, mergePasses, MAX_PASSAGES, MAX_SHARE_OF_DOCUMENT } from '../passages.mjs';
import { ingest, getDocument } from '../ingest.mjs';

const BASE = `http://localhost:${process.env.SERVICE_PORT ?? 3000}`;
const KEY = process.env.INTERNAL_API_KEY;

let failures = 0;
let checks = 0;
const say = (id, pass, msg, detail = '') => {
  checks++;
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${msg}${detail ? `  — ${detail}` : ''}`);
};

const post = async (path, body) => {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(KEY ? { 'x-internal-key': KEY } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// A document with one argument in the middle and ordinary talk either side.
//
// It has to be long enough that the argument is a genuine MINORITY of it. The first version
// of this file was seven lines, the argument came to more than 60% of them, and the cutter
// correctly refused to treat most of a document as a passage — the check working, on a
// fixture too small to exercise it. Written down because the same mistake in a real fixture
// would read as a bug in the cutter.
const DOC = [
  'Kickoff — 3 September 2026',
  'Present: Priya (Eng Lead), Wei (Design), Dana (Customer Success).',
  'Priya (Eng Lead): Charts export as PNG. Nobody disagrees, so that is settled.',
  'Dana (Customer Success): Northwind asked again about the export size. Four hundred thousand rows.',
  'Priya (Eng Lead): Anything over a hundred thousand goes to email as a download link.',
  'Dana (Customer Success): They will want to know which one is happening.',
  'Wei (Design): I will write the message for that.',
  'Priya (Eng Lead): Good. Wei, you had the refresh question.',
  'Wei (Design): I want the refresh every ten seconds.',
  'Priya (Eng Lead): Ten seconds is a streaming pipeline and we do not have one.',
  'Wei (Design): While we are on it, the pilot has to be live by the fourth of May. That is fixed.',
  'Priya (Eng Lead): Take the refresh away and write it up.',
  'Dana (Customer Success): Last one from me. An admin can revoke a shared link.',
  'Wei (Design): Revoke the link, keep the dashboard.',
  'Priya (Eng Lead): Yes. And the audit log has to cover every export, not just views.',
  'Dana (Customer Success): I will send the Northwind note round this afternoon.',
  'Priya (Eng Lead): That is everything. Wei, the message; Dana, the note.',
].join('\n');

const OPEN = 'I want the refresh every ten seconds';
const CLOSE = 'Take the refresh away and write it up';

console.log('');
console.log('BUG-023 — cutting a contested passage');
console.log('=====================================');
console.log('');

// --- TC1: the happy path -------------------------------------------------------------------
{
  const { passages, dropped } = cutPassages(DOC, [
    { about: 'refresh frequency', opening_quote: OPEN, closing_quote: CLOSE },
  ]);
  const p = passages[0];
  say('TC1a', passages.length === 1 && dropped.length === 0, 'one argument yields one passage');
  say('TC1b', Boolean(p) && p.passage.includes(OPEN) && p.passage.includes(CLOSE),
    'the passage spans both quotes');
  say('TC1c', Boolean(p) && p.passage.includes('the pilot has to be live by the fourth of May'),
    'and carries the sentence the argument was hiding — which is the whole point');
  say('TC1d', Boolean(p) && !p.passage.includes('Charts export as PNG')
    && !p.passage.includes('An admin can revoke'),
    'and NOT the settled talk either side of it');
  say('TC1e', Boolean(p) && p.passage.startsWith('Wei (Design):'),
    'the cut lands on line boundaries, so a speaker is never sliced in half', p?.passage.slice(0, 14));
}

// --- TC2: a quote code cannot place is dropped, with a reason --------------------------------
{
  const { passages, dropped } = cutPassages(DOC, [
    { about: 'invented', opening_quote: 'a sentence nobody said', closing_quote: CLOSE },
    { about: 'invented too', opening_quote: OPEN, closing_quote: 'nor this one' },
  ]);
  say('TC2', passages.length === 0 && dropped.length === 2
    && dropped[0].reason === 'opening_not_found' && dropped[1].reason === 'closing_not_found',
    'an unlocatable quote is DROPPED and named, never guessed at',
    dropped.map((d) => d.reason).join(', '));
}

// --- TC3: a passage that runs backwards ------------------------------------------------------
{
  const { passages, dropped } = cutPassages(DOC, [
    { about: 'backwards', opening_quote: CLOSE, closing_quote: OPEN },
  ]);
  say('TC3', passages.length === 0 && dropped[0]?.reason === 'ends_before_it_begins',
    'a passage whose end precedes its start is refused', dropped[0]?.detail);
}

// --- TC4: the degenerate case this exists to prevent ------------------------------------------
{
  const { passages, dropped } = cutPassages(DOC, [
    { about: 'everything', opening_quote: 'Kickoff — 3 September 2026', closing_quote: 'An admin can revoke a shared link' },
  ]);
  say('TC4', passages.length === 0 && dropped[0]?.reason === 'too_large_to_be_a_passage',
    `a "passage" larger than ${MAX_SHARE_OF_DOCUMENT * 100}% of the document is refused`,
    `${dropped[0]?.detail} — re-reading the whole document is the condition BUG-023 measures, not the fix for it`);
}

// --- TC5: cost is bounded, and the bound is stated ---------------------------------------------
{
  // DISTINCT spans, on separate lines. The first version of this row repeated the same
  // passage five times, they all merged into one, and the cap was never reached — a test
  // that passed nothing through the thing it was testing.
  const one = (q) => ({ about: q.slice(0, 20), opening_quote: q, closing_quote: q });
  const many = [
    one('Charts export as PNG'),
    one('I will write the message for that'),
    { about: 'refresh frequency', opening_quote: OPEN, closing_quote: CLOSE },
    one('Revoke the link, keep the dashboard'),
    one('I will send the Northwind note round this afternoon'),
  ];
  const { passages, dropped } = cutPassages(DOC, many);
  const over = dropped.filter((d) => d.reason === 'over_the_per_run_limit').length;
  say('TC5', passages.length === MAX_PASSAGES && over === many.length - MAX_PASSAGES,
    `no more than ${MAX_PASSAGES} passages per run, and the rest are counted rather than silently ignored`,
    `${passages.length} kept, ${over} over the limit — a document full of arguments cannot run up a bill`);
}

// --- TC6: two overlapping arguments are one argument ------------------------------------------
{
  const { passages } = cutPassages(DOC, [
    { about: 'refresh frequency', opening_quote: OPEN, closing_quote: 'we do not have one' },
    { about: 'the same argument again', opening_quote: 'Ten seconds is a streaming pipeline', closing_quote: CLOSE },
  ]);
  say('TC6', passages.length === 1 && (passages[0].merged_with ?? []).length === 1,
    'overlapping passages merge instead of being read twice', passages[0]?.merged_with?.join(', '));
}

// --- TC7: raw_text is never mutated -------------------------------------------------------------
{
  const copy = DOC;
  cutPassages(DOC, [{ about: 'x', opening_quote: OPEN, closing_quote: CLOSE }]);
  say('TC7', DOC === copy, 'the source document is sliced, never modified (ADR 0003)');
}

// --- TC8-TC10: the merge ------------------------------------------------------------------------
{
  const cite = (q, s) => ({ quote: q, start_char: s, end_char: s + q.length, match_kind: 'exact' });
  const first = [
    { req_id: 'REQ-001', statement: 'Charts export as PNG.', grounded: true, citations: [cite('Charts export as PNG', 27)] },
  ];
  const second = [
    // the same sentence, found again by the passage pass
    { req_id: 'P2-001', statement: 'Every chart exports as a PNG file.', grounded: true, citations: [cite('Charts export as PNG', 27)] },
    // genuinely new
    { req_id: 'P2-002', statement: 'The pilot is live by 4 May.', grounded: true, citations: [cite('the pilot has to be live by the fourth of May', 220)] },
    // invented — the quote did not resolve
    { req_id: 'P2-003', statement: 'The product must be beautiful.', grounded: false, citations: [{ quote: 'nowhere', start_char: null, end_char: null, match_kind: 'not_found' }] },
  ];
  const m = mergePasses(first, second);

  say('TC8', m.requirements.length === 2 && m.merged.length === 1 && m.merged[0].req_id === 'P2-002',
    'only what the first pass missed is added', `${m.requirements.length} kept, ${m.merged.length} merged`);
  say('TC9', m.duplicates.some((d) => d.duplicate_of === 'REQ-001'),
    'the same sentence found twice is recorded as a duplicate, not shipped twice',
    'and the FIRST pass wins — it saw the whole document, so its statement resolves referents the passage cannot');
  say('TC10', m.duplicates.some((d) => d.dropped === 'ungrounded_from_second_pass')
    && !m.requirements.some((r) => r.req_id === 'P2-003'),
    'an UNGROUNDED second-pass requirement is dropped, not carried',
    'pass 1 keeps its ungrounded items so a PM can judge them; a passage pass volunteering an unlocatable quote has invented something');
}

// --- TC11-TC12: through the endpoint n8n actually calls -------------------------------------------
{
  const env = ingest({
    doc_type: 'transcript', product_id: `verify-passages-${Date.now()}`,
    source_channel: 'webhook', raw_text: DOC,
  });
  const doc = getDocument(env.doc_id);

  const ok = await post('/internal/passages', {
    doc_id: doc.doc_id,
    trace_id: doc.trace_id,
    contested_passages: [{ about: 'refresh frequency', opening_quote: OPEN, closing_quote: CLOSE }],
  });
  say('TC11', ok.body.status === 'ok' && ok.body.payload?.total === 1
    && ok.body.payload.passages[0].passage.includes('fourth of May'),
    'the endpoint returns the passage n8n will send to the model',
    `${ok.body.payload?.total} passage(s)`);

  const none = await post('/internal/passages', {
    doc_id: doc.doc_id, trace_id: doc.trace_id, contested_passages: [],
  });
  say('TC12a', none.body.payload?.total === 0,
    'a document with no argument yields no passage — and therefore no model call at all');

  const bad = await post('/internal/passages', { doc_id: 'DOC-NOPE', contested_passages: [] });
  say('TC12b', bad.status === 400 && bad.body.payload?.reason === 'envelope_invalid',
    'an unknown document is refused at the boundary', bad.body.payload?.reason);
}

console.log('');
console.log(`${checks - failures}/${checks} checks passed`);
console.log('');
console.log('WHAT THIS DOES NOT SHOW: whether the second pass improves extraction. That is');
console.log('measured by C1 on T1, over three runs, and written on BUG-023.');
// Set the code rather than calling process.exit: an abrupt exit while a keep-alive socket
// from the fetch above is still open trips a libuv assertion on Windows, and a checker that
// crashes after printing PASS is a checker nobody will trust twice.
process.exitCode = failures ? 1 : 0;
