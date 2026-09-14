// Run a judge sweep, and read what it did (E7-S5).
//
// The demo environment is manual-only (PRD-E7 Q3), so this is how a sweep happens here: it
// posts to WF6's webhook — the real door — and then reads the sweep back out of the service.
// It does NOT reach into the database to start one: a command that bypassed the workflow
// would be a command that tests itself.
//
// Usage:  .\run.cmd review-ui/scripts/judge-sweep.mjs           run one, then show it
//         .\run.cmd review-ui/scripts/judge-sweep.mjs --show    show the last few, run nothing

const DOOR = process.env.N8N_JUDGE_WEBHOOK_URL ?? 'http://localhost:5678/webhook/judge-sweep';
const SERVICE = process.env.SERVICE_URL ?? 'http://localhost:3000';
const SHOW_ONLY = process.argv.includes('--show');

const pct = (v) => (typeof v === 'number' ? v.toFixed(2) : '—');

async function show(limit = 3) {
  const res = await fetch(`${SERVICE}/api/judge`);
  const data = await res.json();
  console.log(`\nJudge:   ${data.judge_model}   rubric ${data.rubric_version}`);
  console.log(`Gates:   ${data.gates}`);
  console.log(`Unjudged: ${data.unjudged_remaining.prd_versions} version(s), `
    + `${data.unjudged_remaining.requirements} requirement(s) still never looked at\n`);

  for (const s of data.sweeps.slice(0, limit)) {
    const head = `#${s.sweep_id}  ${s.status.toUpperCase()}  ${s.trigger_source}  `
      + `${s.opened_at}${s.closed_at ? ` -> ${s.closed_at}` : ''}`;
    console.log(head);
    console.log(`   sampled ${s.sample_size} (${s.versions_sampled} version(s), `
      + `${s.requirements_sampled} requirement(s)) · scored ${s.scored}`);
    if (s.skipped_reason) console.log(`   no opinion: ${s.skipped_reason}`);
    if (s.scored) {
      console.log(`   verdicts: ${s.verdicts.supported} supported, ${s.verdicts.unsupported} unsupported, `
        + `${s.verdicts.cannot_tell} cannot tell   (n=${s.averages.n})`);
      console.log(`   means:    faithfulness ${pct(s.averages.faithfulness)}  `
        + `completeness ${pct(s.averages.completeness)}  clarity ${pct(s.averages.clarity)}`);
    }
    if (s.comparable !== null && s.comparable !== undefined) {
      console.log(`   vs the answer key: ${s.disagreements ?? 0} disagreement(s) of ${s.comparable} comparable row(s)`);
    }
    if (s.bug_rule) console.log(`   RULE FIRED: ${s.bug_rule} -> ${s.bug_card}`);
    console.log('');
  }
  return data;
}

if (SHOW_ONLY) {
  await show(5);
  console.log('Nothing was run. The judge gates nothing, so nothing was waiting on this.');
  process.exit(0);
}

console.log(`Asking WF6 for a sweep:  ${DOOR}`);
let reply;
try {
  const res = await fetch(DOOR, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ asked_by: 'judge-sweep.mjs' }),
    // A sweep is a couple of dozen small calls; the door holds the connection until it is done.
    signal: AbortSignal.timeout(600000),
  });
  reply = await res.json().catch(() => ({ status: 'error', reason: `non-JSON reply, HTTP ${res.status}` }));
} catch (err) {
  // The connection dropped, which does NOT mean the sweep did. A sweep is paced — one call
  // every twelve seconds — so it outlives an impatient proxy easily, and the record of what
  // happened is in the database either way. Wait for the sweep to close rather than reporting
  // a failure that may not have happened.
  console.log(`\nThe door stopped answering (${err.message}). The sweep may still be running —`);
  console.log('watching the record instead, which is where the answer actually is.\n');
  const until = Date.now() + 900000;
  while (Date.now() < until) {
    const now = await fetch(`${SERVICE}/api/judge`).then((r) => r.json()).catch(() => null);
    const latest = now?.sweeps?.[0];
    if (latest && latest.status !== 'in_flight') { reply = { status: 'ok', sweep_id: latest.sweep_id }; break; }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 10000));
  }
  if (!reply) {
    console.error('\nNo sweep closed within fifteen minutes. WF6 must be ACTIVE in n8n for its');
    console.error('webhook to exist at all (BUG-005/018):');
    console.error('  .\\run.cmd n8n/scripts/import-workflows.mjs   then check it is active');
    process.exit(1);
  }
}

console.log(`\n${JSON.stringify(reply, null, 2)}\n`);

if (reply.status === 'error' && reply.reason === 'sweep_in_flight') {
  console.log('REFUSED, and that is the correct answer: a sweep is already running. Two');
  console.log('overlapping sweeps would sample the same rows twice and inflate coverage.');
} else if (reply.nothing_to_judge) {
  console.log('Nothing left to judge — every version and requirement already has a score.');
  console.log('Produce more runs, or read the sweeps that exist with --show.');
}

await show(1);
