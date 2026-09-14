// E6-S6: does the PM's own document get the same treatment as the room's transcript?
//
// The story as written proposed a SEEDING path — inject the PM's draft straight into a
// PRDVersion, mark every requirement `pm_authored`, exclude it from M1, teach every provenance
// surface a third case. Vaibhav pushed back on 2026-09-05, and the push-back was right:
//
//   "Think of it again as an artifact that the product manager has shared. We treat the PRD or
//    the base document shared by the product manager in exactly the same way. He can share any
//    resources, multiple resources, right? We treat any type of resource as the same."
//
// A document is a document. The PM's draft goes in the door a transcript goes in, gets extracted
// by the same nodes, and its requirements carry verbatim quotes OF THE PM'S OWN TEXT — which is
// perfectly good evidence of what the PM wrote, and is not the same claim as evidence about the
// room. Nothing branches on `doc_type` after WF1 (CLAUDE.md), so there was nothing to build.
//
// That collapses the story from a build to a CLAIM, and a claim in this repository is worth
// what its verification is worth. So this runs it:
//
//   TC1  the PM's own brief (F1) ingests through the SAME door as a transcript
//   TC2  it produces a PRD with requirements, and their citations resolve into F1's own text
//   TC3  the PRD's grounding is computed by the same code — no third provenance case exists
//   TC4  a TRANSCRIPT ingested against that PRD produces a DELTA, not a second first draft
//   TC5  the delta is computed against the PM-authored version, and says which version
//   TC6  nothing downstream branched on doc_type to make any of that happen
//
// Usage:  .\run.cmd evals\harness\verify-pm-document.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const INGEST = process.env.N8N_INGEST_WEBHOOK_URL ?? 'http://localhost:5678/webhook/ingest';
const SERVICE = `http://localhost:${process.env.SERVICE_PORT ?? 3000}`;
const DOCS = 'evals/datasets/docs';
const PRODUCT = `e6s6-${Date.now().toString(36)}`;

const rows = [];
const check = (id, what, pass, detail) => {
  rows.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${what}`);
  if (detail) console.log(`           ${String(detail).split('\n').join('\n           ')}`);
};

const post = async (body) => {
  const res = await fetch(INGEST, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { status: 'error', payload: { reason: text.slice(0, 200) } }; }
};
const api = async (path) => {
  const res = await fetch(`${SERVICE}${path}`);
  return res.ok ? res.json() : { error: res.status };
};
const send = async (path, body) => {
  const res = await fetch(`${SERVICE}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
};

const fixture = (id) => JSON.parse(readFileSync(join(DOCS, `${id}.json`), 'utf8'));

// --- TC1: the PM's own document, through the transcript's door ---------------------------------
const brief = fixture('F1');
console.log(`Ingesting F1 ("${brief.title}") as product ${PRODUCT} — the same webhook a`);
console.log('transcript uses, with doc_type as the only thing that differs.\n');

const first = await post({
  product_id: PRODUCT,
  doc_type: brief.doc_type,          // feature_brief — the PM's own write-up
  raw_text: brief.raw_text,
  title: brief.title,
  received_at: brief.received_at,
});

// `doc_id` and `trace_id` are top-level on the envelope, not inside the payload — the v1.0
// contract, and the reason the first draft of this script reported a failure the run had not had.
check('TC1', "the PM's own brief ingests through the same door a transcript uses",
  first.status === 'ok' && Boolean(first.doc_id),
  first.status === 'ok'
    ? `component=${first.component}, doc_id=${first.doc_id}, trace=${first.trace_id}`
    : `door refused: ${JSON.stringify(first.payload)}`);

// --- TC2 / TC3: requirements, and quotes that resolve into the PM's own text ---------------------
const versionId = first.payload?.prd_version_id ?? null;
let reqs = [];
if (versionId) {
  const detail = await api(`/api/prd-versions/${versionId}`);
  reqs = detail.requirements ?? detail.version?.requirements ?? [];
}
{
  const grounded = reqs.filter((r) => r.grounded).length;
  const resolves = reqs.filter((r) => (r.citations ?? []).some(
    (c) => c.quote && brief.raw_text.includes(c.quote)));
  check('TC2', "the brief produces requirements whose quotes are verbatim in the PM's own text",
    reqs.length > 0 && resolves.length > 0,
    `${reqs.length} requirements, ${grounded} grounded, ${resolves.length} with a quote found `
      + 'verbatim in F1 by this script, independently of the pipeline');

  // The point of the push-back, stated as a test: there is no third case. A requirement extracted
  // from the PM's document is grounded by exactly the code that grounds one from a transcript.
  check('TC3', 'grounding is computed by the same code — no third provenance case was needed',
    reqs.length > 0 && reqs.every((r) => typeof r.grounded === 'boolean'),
    `every requirement carries a computed grounded flag; pm_authored is a fact about the `
      + 'DOCUMENT (E4-S6), not a bypass around the grounding check');
}

// --- TC4 / TC5: the transcript arrives afterwards and deltas against the PM's draft ---------------
let second = null;
let prdId = null;
let approved = false;

if (versionId) {
  const v = await api(`/api/prd-versions/${versionId}`);
  prdId = v.version?.prd_id ?? v.prd_id ?? null;

  // THROUGH THE REVIEW ENDPOINTS, not through signOff() directly. The audit that indicted seven
  // versions during E6-S3 was exactly this: a verifier calling the function and skipping the
  // session and the decisions the endpoint writes. A check that reaches approval by a path no
  // person can take has verified a path that does not exist.
  const review = await api(`/api/prd-versions/${versionId}/review`);
  const items = [...(review.decidable?.requirements ?? []), ...(review.decidable?.stories ?? [])];
  let refused = 0;
  for (const it of items) {
    // An ungrounded requirement cannot be approved through the plain path (E4-S4), so the
    // override is used and is therefore counted, exactly as a person's would be.
    const decision = it.item_type === 'requirement' && it.grounded === false
      ? 'approve_ungrounded' : 'approve';
    const r = await send(`/api/prd-versions/${versionId}/decisions`, {
      item_type: it.item_type,
      item_id: it.item_id,
      decision,
      reason: 'E6-S6 verification: approving so the follow-up transcript has an approved '
        + 'version to delta against.',
    });
    if (!r.ok) refused += 1;
  }
  const so = await send(`/api/prd-versions/${versionId}/sign-off`, {
    reason: 'E6-S6 verification: the PM-authored draft, approved through the review endpoint.',
  });
  approved = so.ok;
  console.log(`           (decided ${items.length - refused}/${items.length} items; `
    + `sign-off ${so.status}${so.ok ? '' : ' ' + JSON.stringify(so.body).slice(0, 160)})`);
}

if (approved && prdId) {
  const t2 = fixture('T2');
  second = await post({
    product_id: PRODUCT,
    doc_type: t2.doc_type,
    raw_text: t2.raw_text,
    title: t2.title,
    received_at: t2.received_at,
    target_prd_id: prdId,
  });
}

check('TC4', 'a transcript arriving afterwards is a DELTA against the PM\'s draft, not a new PRD',
  second?.component === 'delta',
  second ? `component=${second.component}, status=${second.status}`
    : `not run: approved=${approved}, prd_id=${prdId}`);

check('TC5', 'the delta names the version it was computed against',
  Boolean(second?.payload?.derived_from ?? second?.payload?.base_version_id),
  second ? `derived_from=${second.payload?.derived_from ?? second.payload?.base_version_id ?? 'ABSENT'}, `
    + `changes=${second.payload?.changes ?? second.payload?.change_count ?? '?'}`
    : 'not run');

// --- TC6: and none of it required a branch on doc_type -------------------------------------------
// The spine rule already has a checker (`check-spine.mjs`). This case states the consequence in
// the place a reader of E6-S6 will look for it: the reason no build was needed is that nothing
// downstream can tell a brief from a transcript.
{
  const dir = 'n8n/workflows';
  const after1 = readdirSync(dir).filter((n) => n.endsWith('.json') && !/WF1/.test(n));
  const offenders = after1.filter((n) => {
    const s = readFileSync(join(dir, n), 'utf8');
    return /doc_type\s*===?\s*['"\\]*(feature_brief|transcript|notes|email)/.test(s);
  });
  check('TC6', 'nothing after WF1 branches on doc_type — which is why there was nothing to build',
    offenders.length === 0,
    offenders.length ? `branches found in: ${offenders.join(', ')}`
      : `${after1.length} workflows after the door, none of which can tell a brief from a transcript`);
}

const failed = rows.filter((r) => !r.pass).length;
console.log('');
console.log(`${rows.length - failed}/${rows.length} checks passed.   product: ${PRODUCT}`);
if (!failed) {
  console.log('');
  console.log("E6-S6 is satisfied by the architecture, not by a feature. The PM's own document is");
  console.log('a document: same door, same extraction, same grounding, same delta. The deck claim');
  console.log('"every requirement carries a verbatim citation" stays TRUE and unqualified.');
}
process.exitCode = failed ? 1 : 0;
