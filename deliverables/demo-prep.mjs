// Leave a version three clicks from sign-off, so the gate can be shown in the time available.
//
// WHY THIS EXISTS. Sign-off is refused until EVERY requirement and story has a decision — that
// is the product working, and on v1432 it means **25 decisions**. Demo 1 has about forty-five
// seconds. The demo as scripted could not be performed: either the sign-off never happens on
// camera, or twenty-five clicks happen in silence.
//
// So this decides the ones nobody would watch and stops. What is left is what is worth watching:
//
//   • ONE AMBER requirement — the plain approve is refused, you have to override and type a
//     reason. The moment the whole grounding story is for.
//   • Two ordinary items, so the readiness counter is visibly moving toward zero and the
//     sign-off button enables in front of the audience rather than before it.
//
// THIS IS COMPRESSION, NOT FAKERY, AND THE RECORD SAYS SO. Every decision goes through the real
// endpoint, is attributed, and carries a reason that states plainly it was made during demo
// setup. Nothing is inserted behind the gate; the sign-off itself is still yours to click, and
// the trigger still refuses everything else. If a stranger reads `review_actions` afterwards they
// find exactly what happened and when.
//
// Usage:  .\run.cmd deliverables\demo-prep.mjs 1432
//         .\run.cmd deliverables\demo-prep.mjs 1432 --undo    (not possible — see below)

import { all, get } from '../review-ui/db.mjs';
import { writeState } from './demo-state.mjs';

const SERVICE = `http://localhost:${process.env.SERVICE_PORT ?? 3000}`;
const versionId = Number(process.argv[2]);
const LEAVE = 3;

if (!Number.isFinite(versionId)) {
  console.error('Which version? Run the readiness check first — it names one:');
  console.error('    .\\run.cmd deliverables/demo-readiness.mjs');
  console.error('    .\\run.cmd deliverables/demo-prep.mjs <version>');
  process.exit(1);
}

if (process.argv.includes('--undo')) {
  console.error('There is no undo. Decisions are append-only by design (ADR 0005) — a review');
  console.error('history you can erase is not a review history. Use a different version; the');
  console.error('readiness check will name you one.');
  process.exit(1);
}

const v = get('SELECT prd_version_id, prd_id, state FROM prd_versions WHERE prd_version_id=?', [versionId]);
if (!v) { console.error(`No version ${versionId}.`); process.exit(1); }
if (v.state !== 'in_review') {
  console.error(`v${versionId} is '${v.state}', not 'in_review'. Only an in_review version can be`);
  console.error('decided or signed off — and an approved one has already been used for a demo.');
  console.error('Run the readiness check for a fresh version.');
  process.exit(1);
}

const res = await fetch(`${SERVICE}/api/prd-versions/${versionId}/review`);
if (!res.ok) { console.error(`The review service returned ${res.status}. Is it running?`); process.exit(1); }
const data = await res.json();

const items = [...(data.decidable?.requirements ?? []), ...(data.decidable?.stories ?? [])];
const decided = new Set(Object.keys(data.decisions ?? {}));
const pending = items.filter((i) => !decided.has(`${i.item_type}:${i.item_id}`) && !decided.has(i.item_id));

// What to KEEP for the camera: one ungrounded requirement first, then fill to three.
const amber = pending.filter((i) => i.item_type === 'requirement' && i.grounded === false);
const keep = new Set();
if (amber.length) keep.add(amber[0].item_id);
for (const i of pending) { if (keep.size >= LEAVE) break; keep.add(i.item_id); }

const toDecide = pending.filter((i) => !keep.has(i.item_id));

console.log('');
console.log(`  v${versionId}  ${v.prd_id}  ${v.state}`);
console.log(`  ${items.length} decidable items · ${pending.length} still undecided`);
console.log('');

let done = 0;
let failed = 0;
for (const it of toDecide) {
  const decision = it.item_type === 'requirement' && it.grounded === false ? 'approve_ungrounded' : 'approve';
  const r = await fetch(`${SERVICE}/api/prd-versions/${versionId}/decisions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      item_type: it.item_type,
      item_id: it.item_id,
      decision,
      reason: 'Decided during demo setup so the sign-off gate can be shown in the time available. '
        + 'The remaining items were decided on camera.',
    }),
  });
  r.ok ? (done += 1) : (failed += 1);
  if (!r.ok) console.log(`  could not decide ${it.item_type} ${it.item_id}: ${r.status}`);
}

const after = await (await fetch(`${SERVICE}/api/prd-versions/${versionId}/review`)).json();
const left = after.readiness?.undecided ?? [];

console.log(`  decided ${done} item(s) off camera${failed ? `, ${failed} refused` : ''}`);
console.log('');
console.log(`  LEFT FOR THE CAMERA — ${left.length}:`);
for (const u of left) {
  const item = items.find((i) => i.item_id === u.item_id);
  const flag = item?.item_type === 'requirement' && item?.grounded === false ? '  <- AMBER: plain approve is refused' : '';
  console.log(`     ${u.item_type.padEnd(12)} ${u.item_id}${flag}`);
}
console.log('');
console.log(`  Sign-off is ${after.readiness?.ready ? 'ENABLED — too few left, decide fewer next time' : 'still refused, which is correct'}.`);
console.log('');
console.log(`     ${SERVICE}/review.html?version=${versionId}`);
console.log('');
writeState('prep', {
  version: versionId,
  decided_off_camera: done,
  refused: failed,
  left: left.length,
  // The amber one is the point of the whole beat, so whether it survived is recorded rather
  // than assumed from the count.
  amber_left: left.some((u) => {
    const item = items.find((i) => i.item_id === u.item_id);
    return item?.item_type === 'requirement' && item?.grounded === false;
  }),
  ready: Boolean(after.readiness?.ready),
  review_url: `${SERVICE}/review.html?version=${versionId}`,
});

console.log('  On camera: decide those, watch the counter reach zero, then Sign off.');
console.log('  Every decision above is in `review_actions` with a reason that says it was setup.');
console.log('');
process.exitCode = failed ? 1 : 0;
