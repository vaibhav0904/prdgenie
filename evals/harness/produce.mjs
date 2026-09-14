// Replays the fixtures through the REAL doors, so grading always describes a run that
// actually happened.
//
// A "run" means the whole pipeline a PM triggers — ingest AND generate — not just the
// door. Grading a database that only ever had documents in it would measure nothing
// (E2-S1, TC8).
//
// This file produces runs and grades nothing. Grading and running are separate commands
// (evals/README.md rule 3) — if they were one, a failing grade could be "fixed" by
// changing how the run is produced, which is the same disease as tuning labels.
//
// Usage:
//   .\run.cmd evals\harness\produce.mjs                every fixture, each in its own product
//   .\run.cmd evals\harness\produce.mjs T1 T3          named fixtures
//   .\run.cmd evals\harness\produce.mjs --ingest-only  doors only, no model spend
//   node ... evals/harness/produce.mjs --manifest=<path>     write the manifest elsewhere

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadFixtures, productFor, PRODUCT_PREFIX } from './labels.mjs';

// The run manifest. Grading and label-checking join on this rather than trying to
// recognise a run from its text — which fails silently exactly where redaction rewrote a
// fixture, i.e. on the fixture that mattered most (BUG-003).
//
// --manifest exists so a verification run can exercise this producer without destroying
// the manifest describing the run that is currently being graded.
const DEFAULT_MANIFEST = 'evals/results/.last-run.json';

const INGEST = process.env.N8N_INGEST_WEBHOOK_URL ?? 'http://localhost:5678/webhook/ingest';

// Which product each fixture is ingested as, and why there are ten of them rather than one:
// `labels.mjs`, `productFor`. It lives there because it is corpus structure, and because a
// check that wants to ask "which road would this fixture take" must be able to import the rule
// without importing a script that replays the corpus.

const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const INGEST_ONLY = flags.includes('--ingest-only');
const MANIFEST = flags.find((f) => f.startsWith('--manifest='))?.slice('--manifest='.length)
  ?? DEFAULT_MANIFEST;

const available = loadFixtures();
const fixtures = available.filter((f) => !wanted.length || wanted.includes(f.fixture_id));

if (!fixtures.length) {
  console.error(wanted.length
    ? `No fixtures matched: ${wanted.join(', ')}`
    : 'No fixtures in evals/datasets/docs/. E1-S3 writes them.');
  process.exit(1);
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({
    status: 'error', payload: { reason: 'non-JSON response', missing: [`HTTP ${res.status}`] },
  }));
}

console.log(`Replaying ${fixtures.length} of ${available.length} fixture(s)`);
console.log(`  door:     ${INGEST}`);
console.log(`  products: ${PRODUCT_PREFIX}-<fixture>, one each`);
console.log(`  pipeline: ${INGEST_ONLY ? '(skipped: --ingest-only)' : 'whichever road the door chooses'}\n`);

const failures = [];
const manifest = {
  produced_at: new Date().toISOString(),
  product_prefix: PRODUCT_PREFIX,
  // Coverage is part of the record, not a footnote: a grader reading this manifest can
  // tell whether it describes the whole dataset or a slice of it (BUG-003).
  fixtures_available: available.length,
  fixtures_attempted: fixtures.length,
  ingest_only: INGEST_ONLY,
  runs: {},
};

for (const f of fixtures) {
  const id = f.fixture_id.padEnd(3);
  const product = productFor(f.fixture_id);
  try {
    // ONE POST, through the fork (BUG-052). WF1 chooses the road and CALLS it, and because the
    // door responds with its last node, what comes back is the envelope of whichever workflow
    // ran — `doc_id`, `trace_id`, the component that answered, and every count the manifest
    // records. The producer no longer drives generate by hand, and no longer knows there is a
    // second webhook.
    const env = await post(INGEST, {
      product_id: product,
      doc_type: f.doc_type,
      raw_text: f.raw_text,
      title: f.title ?? null,
      received_at: f.received_at ?? null,
      target_prd_id: f.target_prd_id ?? null,
      // `--ingest-only` is the ONE honest use of the flag that used to be here unconditionally:
      // "the door and nothing else", for a run that must not spend anything. On the normal path
      // it is absent, and the pipeline runs because the door chose to run it.
      ...(INGEST_ONLY ? { dispatch: false } : {}),
    });

    if (env.status === 'error') {
      // One fixture failing stops nothing else — but the command still ends non-zero.
      console.log(`  FAIL  ${id} door: ${env.payload?.reason ?? 'unknown'} ${JSON.stringify(env.payload?.missing ?? [])}`);
      failures.push(f.fixture_id);
      continue;
    }

    const p = env.payload ?? {};
    const record = { product_id: product, doc_id: env.doc_id, trace_id: env.trace_id };
    manifest.runs[f.fixture_id] = record;

    if (INGEST_ONLY) {
      // The door's own envelope, which carries the routing decision and its reason. Recorded
      // because "it would have gone to generate" is the claim this corpus rests on, and a claim
      // recorded from the run is one a check can read back (verify-corpus-routing).
      record.route = p.route ?? null;
      record.route_reason = p.route_reason ?? null;
      console.log(`  ok    ${id} ${env.doc_id}  ${product}  -> ${p.route ?? '?'}  (ingest only)`);
      continue;
    }

    // WHICH WORKFLOW ANSWERED, from the reply rather than from the expectation. The generate
    // path answers as `assembler` or `validator`; the delta path answers as `delta`. A fixture
    // that came back from the delta is this whole card happening again, and it is recorded here
    // so the grader is reading a run whose road is known.
    record.component = env.component ?? null;
    record.generate_status = env.status ?? 'unknown';
    record.prd_version_id = p.prd_version_id ?? null;
    record.state = p.state ?? null;
    record.park_reason = p.reason ?? null;
    record.total = p.total ?? p.requirements_kept ?? null;
    record.grounded = p.grounded ?? null;

    if (env.component === 'delta') {
      console.log(`  FAIL  ${id} ${env.doc_id}  the DOOR sent this to the delta — ${product} has an approved version`);
      failures.push(f.fixture_id);
    } else if (env.status === 'ok') {
      console.log(`  ok    ${id} ${env.doc_id}  v${p.prd_version_id} ${p.state}  ${p.grounded}/${p.total} grounded`);
    } else if (env.status === 'needs_review') {
      console.log(`  park  ${id} ${env.doc_id}  parked: ${p.reason}  (kept ${p.requirements_kept ?? 0})`);
    } else {
      console.log(`  FAIL  ${id} ${env.doc_id}  ${p.reason ?? env.status ?? 'unknown'}`);
      failures.push(f.fixture_id);
    }
  } catch (err) {
    console.log(`  FAIL  ${id} ${err.message}`);
    failures.push(f.fixture_id);
  }
}

mkdirSync(dirname(MANIFEST), { recursive: true });
manifest.failures = failures;
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

const produced = Object.keys(manifest.runs).length;
console.log(`\n${produced}/${fixtures.length} attempted fixtures reached storage`);
console.log(`Coverage: ${fixtures.length} of ${available.length} fixtures in the dataset`
  + (fixtures.length === available.length ? '' : '  <-- PARTIAL RUN'));
console.log(`Manifest: ${MANIFEST}`);

if (failures.length) {
  console.error(`\nFailed: ${failures.join(', ')}`);
  console.error('Is the review service running, and are WF1 and WF2 active in n8n?');
  console.error('  .\\run.cmd review-ui/server.js');
  console.error('  .\\run.cmd n8n/scripts/import-workflows.mjs');
  process.exit(1);
}
console.log('Runs produced. Grade them with:  .\\run.cmd evals/harness/grade.mjs');
