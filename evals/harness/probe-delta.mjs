// E6-S1's live probe: T1 approved, T2 read against it, and the first honest churn number.
//
// This is a PROBE, not a case. C5 (E6-S5) grades the delta against `T2.labels.json` with
// thresholds; this measures the same thing once, before any of it is tuned, so that the
// prompt's first behaviour is on the record rather than remembered. Building the case in the
// story that writes the prompt would let one be shaped to the other.
//
// It spends real money: one full T1 run, one T2 ingest, one delta call.
//
// Usage:  .\run.cmd evals/harness/probe-delta.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolveLabels } from './labels.mjs';
import { matchRequirements } from './match.mjs';

const SERVICE = process.env.SERVICE_URL ?? 'http://localhost:3000';
const DELTA_DOOR = process.env.N8N_DELTA_WEBHOOK_URL ?? 'http://localhost:5678/webhook/delta';
const KEY = process.env.INTERNAL_API_KEY ?? '';
const DIR = 'evals/results';

const api = async (path, init = {}) => {
  const res = await fetch(`${SERVICE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(KEY ? { 'x-internal-key': KEY } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const produce = (fixture, manifest, extra = []) => {
  try {
    execFileSync(process.execPath, ['--env-file-if-exists=.env', 'evals/harness/produce.mjs',
      fixture, `--manifest=${manifest}`, ...extra], { stdio: 'pipe', timeout: 900000 });
  } catch { /* a park exits non-zero; the manifest is what we read */ }
  return JSON.parse(readFileSync(manifest, 'utf8')).runs[fixture] ?? null;
};

console.log('THE DELTA PROBE — T1 approved, then T2 read against it\n');

// --- 1. T1, produced and approved through the real gate ----------------------------------------

const t1 = produce('T1', `${DIR}/.probe-delta-t1.json`);
if (!t1?.prd_version_id) { console.error('T1 did not produce a version'); process.exit(1); }
console.log(`  T1 -> version ${t1.prd_version_id}, ${t1.grounded}/${t1.total} grounded`);

const { body: review } = await api(`/api/prd-versions/${t1.prd_version_id}/review`);
for (const u of review.readiness.undecided) {
  const item = u.item_type === 'requirement'
    ? review.requirements.find((r) => r.req_id === u.item_id) : null;
  const decision = item && item.grounded === false ? 'approve_ungrounded' : 'approve';
  await api(`/api/prd-versions/${t1.prd_version_id}/decisions`, {
    method: 'POST',
    body: {
      item_type: u.item_type,
      item_id: u.item_id,
      decision,
      reason: decision === 'approve' ? null : 'probe-delta.mjs: decided so a delta has something to read',
    },
  });
}
const signed = await api(`/api/prd-versions/${t1.prd_version_id}/sign-off`, { method: 'POST' });
if (signed.body?.state !== 'approved') {
  console.error(`T1 could not be approved: ${JSON.stringify(signed.body)}`);
  process.exit(1);
}
console.log(`  T1 version ${t1.prd_version_id} approved through the sign-off endpoint`);

// --- 2. T2, ingested only: the delta is what reads it -------------------------------------------

const t2 = produce('T2', `${DIR}/.probe-delta-t2.json`, ['--ingest-only']);
if (!t2?.doc_id) { console.error('T2 did not reach storage'); process.exit(1); }
console.log(`  T2 -> ${t2.doc_id}\n`);

// --- 3. the delta, through its own door ----------------------------------------------------------

const res = await fetch(DELTA_DOOR, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ doc_id: t2.doc_id }),
  signal: AbortSignal.timeout(600000),
});
const out = await res.json().catch(() => null);
if (!out || out.status !== 'ok') {
  console.error(`The delta did not come back ok:\n${JSON.stringify(out, null, 2)}`);
  process.exit(1);
}

const d = out.delta;
console.log(`Delta: ${JSON.stringify(out.counts)}   dropped: ${out.dropped.length}`);
for (const kind of ['added', 'modified', 'contradicted', 'removed']) {
  for (const item of d[kind]) {
    console.log(`  ${kind.padEnd(13)} ${item.req_id ?? '(new)'}  ${(item.statement ?? item.conflict ?? '').slice(0, 90)}`);
  }
}
for (const q of d.new_open_questions) console.log(`  open question ${q.question.slice(0, 80)}`);
for (const drop of out.dropped) console.log(`  DROPPED ${drop.kind} ${drop.item}: ${drop.why}`);

// --- 4. churn, measured against labels written on 2026-09-01 --------------------------------------
//
// T2 restates four T1 requirements almost verbatim. Every one that appears in the delta is
// churn. The mapping from label to req_id is the SAME matcher C1 grades with — nothing here
// invents a way to compare.

const labels = JSON.parse(readFileSync('evals/datasets/labels/T2.labels.json', 'utf8'));
const t1Labels = JSON.parse(readFileSync('evals/datasets/labels/T1.labels.json', 'utf8'));
const { body: doc } = await api(`/api/documents/${t1.doc_id}`);
const { regionsByLabel } = resolveLabels(t1Labels, doc.raw_text);
const { body: v1 } = await api(`/api/prd-versions/${t1.prd_version_id}`);
const extracted = (v1.requirements ?? []).map((r) => ({
  req_id: r.req_id, kind: r.kind, statement: r.statement,
  citations: (r.citations ?? []).filter((c) => Number.isInteger(c.start_char)),
}));
const { rows } = matchRequirements(extracted,
  (t1Labels.expected_requirements ?? []).map((r) => ({ label_id: r.label_id, kind: r.kind, statement: r.statement })),
  regionsByLabel);
const reqIdOf = new Map(rows.filter((r) => r.verdict === 'match').map((r) => [r.label_id, r.req_id]));

const touched = new Set([...d.modified, ...d.contradicted, ...d.removed].map((i) => i.req_id));
const restated = labels.expected_delta.unchanged_restated ?? [];
const churned = restated
  .map((u) => ({ label: u.of_label ?? u.label_id ?? u, req_id: reqIdOf.get(u.of_label ?? u.label_id ?? u) }))
  .filter((u) => u.req_id && touched.has(u.req_id));

console.log('');
console.log(`CHURN: ${churned.length} of ${restated.length} restated requirements appear in the delta`);
for (const c of churned) console.log(`  churned ${c.label} -> ${c.req_id}`);
console.log(`  (${restated.filter((u) => !reqIdOf.get(u.of_label ?? u.label_id ?? u)).length} restated label(s) `
  + 'could not be mapped to a req_id, because T1 extraction missed them — those cannot churn either way)');

const expected = { modified: 2, contradicted: 1, added: 1 };
console.log('');
console.log('Against the four labelled changes (C5 grades this properly in E6-S5):');
for (const [kind, n] of Object.entries(expected)) {
  console.log(`  ${kind.padEnd(13)} expected ${n}, delta has ${d[kind].length}`);
}

mkdirSync(DIR, { recursive: true });
const path = `${DIR}/${new Date().toISOString().slice(0, 10)}-delta-probe.json`;
writeFileSync(path, `${JSON.stringify({
  probed_at: new Date().toISOString(),
  t1_version: t1.prd_version_id,
  t2_doc: t2.doc_id,
  counts: out.counts,
  dropped: out.dropped,
  churn: { churned: churned.length, of: restated.length, items: churned },
  delta: d,
}, null, 2)}\n`);
console.log(`\nWritten: ${path}`);
console.log('\nThis is a measurement, not a gate. C5 (E6-S5) sets the thresholds: 4 of 4, churn = 0.');
