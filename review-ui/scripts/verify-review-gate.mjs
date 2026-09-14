// The instrument for E4: does the gate hold for a caller who never loaded the page?
//
// Everything here talks to the HTTP API, never to the functions directly. The browser is not
// involved at any point — which is the whole claim: **the disabled button is a courtesy, the
// endpoint is the check, and the trigger is the guarantee.**
//
// Usage:  .\run.cmd review-ui/scripts/verify-review-gate.mjs
//
// Needs the review service running (`.\run.cmd` with no arguments tells you).

import { run as exec, get, all } from '../db.mjs';
import { ingest, getDocument } from '../ingest.mjs';
import { assemble } from '../assemble.mjs';

const BASE = `http://localhost:${process.env.SERVICE_PORT ?? 3000}`;

let failures = 0;
let checks = 0;
const say = (id, pass, msg) => {
  checks++;
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${msg}`);
};

const post = async (path, body) => {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const getJson = async (path) => (await fetch(BASE + path)).json();

// --- a version of our own, so nothing here touches a graded run ---------------------------
const PRODUCT = `verify-review-${Date.now()}`;
const SRC = 'Marcus (Head of Product): Every chart must export as PNG.\n'
  + 'Priya (Eng Lead): And the first chart paints in under two seconds.';

const env = ingest({
  doc_type: 'transcript', product_id: PRODUCT, source_channel: 'webhook', raw_text: SRC,
});
const doc = getDocument(env.doc_id);

const at = (q) => ({ quote: q, start_char: SRC.indexOf(q), end_char: SRC.indexOf(q) + q.length, match_kind: 'exact' });
const reqs = [
  {
    req_id: 'REQ-001', kind: 'functional', statement: 'Every chart exports as PNG.',
    stakeholder: 'Marcus (Head of Product)', confidence: 'high', grounded: true,
    citations: [at('Every chart must export as PNG')],
  },
  {
    // Ungrounded ON PURPOSE: its quote is not in the document, and code said so.
    req_id: 'REQ-002', kind: 'nonfunctional', statement: 'Charts paint instantly.',
    stakeholder: 'Priya (Eng Lead)', confidence: 'low', grounded: false,
    citations: [{ quote: 'charts paint instantly', start_char: 0, end_char: 0, match_kind: 'not_found' }],
  },
];

const built = assemble(doc, reqs, null,
  { document_subject: 'a charting product', concerns_product: true }, [], [],
  {
    epics: [{ epic_id: 'EPIC-001', title: 'Charts', summary: null }],
    features: [{ feature_id: 'FEAT-001', epic_id: 'EPIC-001', title: 'Chart export', req_ids: ['REQ-001'] }],
    stories: [{
      story_id: 'STORY-001', feature_id: 'FEAT-001', as_a: 'analyst',
      i_want: 'a PNG', so_that: 'I can paste it',
      acceptance_criteria: [{ criterion: 'The PNG matches the chart resolution.', req_id: 'REQ-001' }],
    }],
    factors: [{ feature_id: 'FEAT-001', reach: 9, impact: 2, confidence: 0.9, effort: 3, rationale: 'x', citations: [], priority_score: 5.4 }],
    unclustered: [],
  });

const V = built.payload.prd_version_id;
say('TC0', built.status === 'ok' && Number.isInteger(V), `a version to review: v${V}`);

const RID = `${V}-REQ-001`;
const UNGROUNDED = `${V}-REQ-002`;
const SID = `${V}-STORY-001`;

// --- TC1: the screen's data is all derived ---------------------------------------------------
const review = await getJson(`/api/prd-versions/${V}/review`);
say('TC1', review.readiness.total === 3 && review.readiness.decided === 0,
  `readiness is computed from rows: ${review.readiness.decided} of ${review.readiness.total} decided`);
say('TC1', review.figures.grounded === 1 && review.figures.grounded_of === 2,
  `the rate carries its denominator: ${review.figures.grounded} of ${review.figures.grounded_of} grounded`);
say('TC1', review.trend.available === false && review.trend.reason === 'no prior version',
  'the trend says "no prior version" rather than showing zero');
say('TC1', review.caveats.some((c) => c.includes('could not be verified')),
  `the caveat line is computed from state: "${review.caveats[0] ?? '(none)'}"`);

// --- TC2: the endpoint refuses mid-review, for a caller with no browser ------------------------
const early = await post(`/api/prd-versions/${V}/sign-off`);
say('TC2', early.status === 409 && early.body.reason === 'items_undecided',
  `sign-off mid-review is refused: ${early.body.reason} — ${early.body.detail}`);
say('TC2', Array.isArray(early.body.missing) && early.body.missing.length === 3,
  `and it NAMES what is undecided: ${(early.body.missing ?? []).join(', ')}`);

// --- TC3: an ungrounded requirement cannot take the plain approve path -------------------------
const plain = await post(`/api/prd-versions/${V}/decisions`,
  { item_type: 'requirement', item_id: UNGROUNDED, decision: 'approve' });
say('TC3', plain.status === 409 && plain.body.reason === 'ungrounded_requires_override',
  'approving an unverified requirement through the plain path is refused');

const noReason = await post(`/api/prd-versions/${V}/decisions`,
  { item_type: 'requirement', item_id: UNGROUNDED, decision: 'approve_ungrounded' });
say('TC3', noReason.status === 409 && noReason.body.reason === 'reason_required',
  'and the override without a reason is refused BY THE TRIGGER, not by the form');

const override = await post(`/api/prd-versions/${V}/decisions`,
  { item_type: 'requirement', item_id: UNGROUNDED, decision: 'approve_ungrounded', reason: 'Checked with Priya by hand.' });
say('TC3', override.status === 200 && override.body.figures.approved_ungrounded === 1,
  `the override is recorded and counted SEPARATELY: approved=${override.body.figures.approved}, overrides=${override.body.figures.approved_ungrounded}`);

// --- TC4: a decision on another version's item is refused ---------------------------------------
const foreign = await post(`/api/prd-versions/${V}/decisions`,
  { item_type: 'requirement', item_id: 'DOES-NOT-EXIST', decision: 'approve' });
say('TC4', foreign.status === 400,
  'a decision on an item that is not on this version is refused — otherwise it would count toward readiness invisibly');

// --- TC5: an edit is append-only, rewrites the statement, and leaves the rate -------------------
const edited = await post(`/api/prd-versions/${V}/decisions`, {
  item_type: 'requirement', item_id: RID, decision: 'edit',
  reason: 'Names the format but not the resolution.', after_text: 'Every chart exports as a PNG at the rendered resolution.',
});
say('TC5', edited.status === 200, 'an edit with a reason is accepted');
const afterEdit = await getJson(`/api/prd-versions/${V}/review`);
const editedReq = afterEdit.requirements.find((r) => r.req_id === RID);
say('TC5', editedReq.statement.includes('rendered resolution') && editedReq.pm_authored === true,
  'the statement is rewritten and marked as the PM\'s own words');
say('TC5', afterEdit.figures.grounded_of === 1,
  `and it LEAVES the grounding rate: ${afterEdit.figures.grounded} of ${afterEdit.figures.grounded_of} — `
  + 'the rate can never be improved by editing');
say('TC5', editedReq.citations.length === 1,
  'the citations stay, marked as coming from the original extraction');

// --- TC6: readiness needs the story too ---------------------------------------------------------
const stillNot = await post(`/api/prd-versions/${V}/sign-off`);
say('TC6', stillNot.status === 409 && stillNot.body.missing.some((m) => m.startsWith('story:')),
  `with every requirement decided, the story still blocks: ${stillNot.body.missing.join(', ')}`);

await post(`/api/prd-versions/${V}/decisions`, { item_type: 'story', item_id: SID, decision: 'approve' });

// --- TC7: and now it goes through ----------------------------------------------------------------
const signed = await post(`/api/prd-versions/${V}/sign-off`);
say('TC7', signed.status === 200 && signed.body.state === 'approved',
  `with everything decided, sign-off succeeds: ${signed.body.state}`);
say('TC7', signed.body.overrides_used === 1,
  `and the response carries the override count separately: ${signed.body.overrides_used}`);

// --- TC8: the trigger, re-proven here rather than assumed settled by E1-S1 -------------------------
// The first version of this row set the just-approved version to 'approved' again and
// expected a refusal. It is a no-op — the trigger fires `WHEN NEW.state IS NOT OLD.state` —
// and nothing "reaches" approved there, so the assertion was wrong and the code was right.
// What must be refused is a MOVE, so this walks it backwards.
let refused = false;
let message = '';
try {
  exec("UPDATE prd_versions SET state='in_review' WHERE prd_version_id=?", [V]);
} catch (err) { refused = true; message = err.message; }
say('TC8', refused, `an approved version cannot be walked back to in_review: ${message.slice(0, 60)}`);

// A DIFFERENT version, on the same connection, immediately after a real sign-off. E4-S3 asks
// for this specifically: the marker must not be a door that stays open.
const other = all("SELECT prd_version_id FROM prd_versions WHERE state='in_review' AND prd_version_id<>? LIMIT 1", [V]);
if (other.length) {
  let refused2 = false;
  try {
    exec("UPDATE prd_versions SET state='approved' WHERE prd_version_id=?", [other[0].prd_version_id]);
  } catch { refused2 = true; }
  say('TC8', refused2,
    `and a DIFFERENT version on the same connection is refused too (v${other[0].prd_version_id}) — the marker did not stay open`);
} else {
  say('TC8', false, 'no second in_review version to test the marker against — produce a run first');
}

// --- TC9: sign-off is refused once approved --------------------------------------------------------
const again = await post(`/api/prd-versions/${V}/sign-off`);
say('TC9', again.status === 409 && again.body.reason === 'not_in_review',
  `signing off an approved version is refused: ${again.body.reason}`);

// --- TC10: the action history is whole ---------------------------------------------------------------
const actions = all(
  `SELECT a.decision FROM review_actions a JOIN review_sessions s ON s.session_id=a.session_id
   WHERE s.prd_version_id=? ORDER BY a.action_id`, [V]);
say('TC10', actions.length === 3,
  `every decision left a row, append-only: ${actions.map((a) => a.decision).join(', ')}`);
say('TC10', get('SELECT COUNT(*) AS n FROM review_sessions WHERE prd_version_id=?', [V]).n === 1,
  'and they are all in ONE session — a second would split the history');

console.log('');
if (failures) console.error(`FAILED — ${failures} of ${checks} checks.`);
else {
  console.log(`${checks}/${checks} passed, none of it through a browser.`);
  console.log('Readiness is recomputed at the endpoint from the rows; an unverified item cannot');
  console.log('take the plain approve path; an edit leaves the grounding rate; and the trigger');
  console.log('refuses a hand-run UPDATE on a different version immediately after a real sign-off.');
}
process.exitCode = failures ? 1 : 0;
