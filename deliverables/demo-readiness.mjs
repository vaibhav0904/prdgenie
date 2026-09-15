// Is this machine ready to demo, right now?
//
// Run it before the rehearsal and again before the recording. It answers one question — GO or
// NO-GO — and when the answer is no it says which thing and what to type.
//
// WHY IT PICKS THE VERSION RATHER THAN NAMING ONE (the reason this exists at all):
//
//   **The demo consumes its own state.** Signing off a version approves it, and an approved
//   version cannot be signed off again. So the rehearsal burns whatever version the run sheet
//   names, and the recording — the run that matters — opens a screen with no sign-off button on
//   it. A hard-coded `?version=1431` in a run sheet is a trap that springs exactly once, on the
//   take you are keeping.
//
//   So this picks a fresh one from the rows each time and prints the URL. Run it again before
//   the recording and it hands you a different version, because the first is now approved.
//
// CHEAP BY DEFAULT, HONEST ABOUT IT. Everything here is free and instant except the end-to-end
// ingest, which costs about five model calls and is the only check that proves the whole path
// works rather than that each piece is up. `--live` runs it. The summary says which mode ran, so
// a cheap GO is never mistaken for a proven one.
//
// Usage:  .\run.cmd deliverables\demo-readiness.mjs
//         .\run.cmd deliverables\demo-readiness.mjs --live     also ingest a document for real

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { all, get } from '../review-ui/db.mjs';
import { writeState } from './demo-state.mjs';

const LIVE = process.argv.includes('--live');
const SERVICE = `http://localhost:${process.env.SERVICE_PORT ?? 3000}`;
const INGEST = process.env.N8N_INGEST_WEBHOOK_URL ?? 'http://localhost:5678/webhook/ingest';
const N8N = new URL(INGEST).origin;

const rows = [];
const ok = (what, detail) => { rows.push({ pass: true, what }); console.log(`  ok    ${what}`); if (detail) console.log(`        ${detail}`); };
const no = (what, fix) => { rows.push({ pass: false, what, fix }); console.log(`  FAIL  ${what}`); };

async function reach(url, init = {}, ms = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch (e) { return { ok: false, status: null, body: e.message }; }
  finally { clearTimeout(t); }
}

console.log('');
console.log('DEMO READINESS'.padEnd(52) + (LIVE ? 'live mode — a real document will be ingested' : 'cheap mode — add --live to prove the whole path'));
console.log('─'.repeat(78));
console.log('');
console.log('THE MACHINE');

// --- 1. Node and the storage layer ---------------------------------------------------------------
const major = Number(process.versions.node.split('.')[0]);
major >= 22 ? ok(`Node ${process.version}`) : no(`Node ${process.version} is too old`, 'winget install OpenJS.NodeJS.LTS, then a NEW terminal');
try { await import('node:sqlite'); ok('node:sqlite available'); }
catch { no('node:sqlite missing', 'Node 22+ ships it; nothing to install'); }

// --- 2. the two services -------------------------------------------------------------------------
const health = await reach(`${SERVICE}/api/health`);
let schema = null; try { schema = JSON.parse(health.body); } catch { /* reported below */ }
health.ok
  ? ok('review service answering', `${SERVICE} · schema v${schema?.schema_version} · ${schema?.db_path}`)
  : no(`review service NOT answering at ${SERVICE}`, 'start it in its OWN terminal:  .\\run.cmd review-ui/server.js');

const n8n = await reach(`${N8N}/healthz`);
n8n.ok ? ok('n8n answering', N8N) : no(`n8n NOT answering at ${N8N}`, 'docker start n8n-local   (then wait ~30s)');

// --- 3. every door, without starting anything -----------------------------------------------------
let doorsOk = false;
if (n8n.ok) {
  try {
    const { doorsFromWorkflows, probeDoor } = await import('../n8n/scripts/check-doors-registered.mjs');
    const doors = doorsFromWorkflows(undefined, N8N);
    const states = [];
    for (const d of doors) states.push({ ...d, state: await probeDoor(d) });
    const bad = states.filter((s) => s.state !== 'registered');
    doorsOk = doors.length > 0 && !bad.length;
    doorsOk
      ? ok(`all ${doors.length} doors registered`, 'probed with a GET, so nothing ran and nothing was stored')
      : no(`${bad.length} of ${doors.length} doors NOT registered: ${bad.map((b) => b.url.split('/').pop()).join(', ')}`,
        '.\\run.cmd n8n/scripts/import-workflows.mjs   THEN   docker restart n8n-local');
  } catch (e) { no(`could not probe the doors: ${e.message}`, 'check n8n/workflows is intact'); }
} else no('doors not probed — n8n is down', 'docker start n8n-local');

// --- 4. the provider binding, which fails silently until the first extraction ----------------------
{
  const OVERRIDE = 'n8n/workflows.local/WF0-llm-call.json';
  if (!existsSync(OVERRIDE)) {
    no('no local provider binding — every extraction will fail at the model call',
      '.\\run.cmd n8n/scripts/bind-provider-credential.mjs   THEN import   THEN restart');
  } else {
    const text = readFileSync(OVERRIDE, 'utf8');
    const unbound = [...text.matchAll(/"id"\s*:\s*"(BIND_ME_[^"]+)"/g)].map((m) => m[1]);
    unbound.length
      ? no(`provider credential still a placeholder: ${unbound.join(', ')}`,
        '.\\run.cmd n8n/scripts/bind-provider-credential.mjs   THEN import   THEN restart')
      : ok('provider credentials bound locally', `${OVERRIDE} (gitignored, per-machine)`);
  }
}

// --- 5. the callback secret both sides must agree on ------------------------------------------------
// Not the value — that it is ENFORCED. An /internal/ endpoint that answers without a key is one
// where n8n's calls would succeed for the wrong reason and a stranger's would too.
{
  const r = await reach(`${SERVICE}/internal/validate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  r.status === 401 || r.status === 403
    ? ok('the /internal/ callback key is enforced', `an unauthenticated POST is refused (${r.status})`)
    : no(`/internal/validate answered ${r.status} without a key`,
      'set INTERNAL_API_KEY in .env and re-run provision-internal-credential.mjs');
}

// --- the demo material -------------------------------------------------------------------------------
console.log('');
console.log('THE DEMO');

// --- 6. a version to open, PICKED not hard-coded ------------------------------------------------------
let pick = null;
if (health.ok) {
  // THE BASELINE HAS TO BE ONE THE FOLLOW-UP CAN CHANGE.
  //
  // This is the check that was missing, and it is the one that would have killed demo 3 on
  // camera. The picker asked "does this version have requirements, stories and an amber one",
  // which is everything demo 1 needs and nothing demo 3 needs. It picked **v1432 — a PRD built
  // from T2 itself.** Sign that off and then send T2 at it, and the delta correctly reports that
  // nothing changed: every requirement in the follow-up is already in the baseline.
  //
  // 32 of the 39 versions that passed the old filter were T2-derived. It was not close.
  //
  // So the rule is derived rather than typed: **the candidate's source text must not be the text
  // the run sheet tells you to paste.** Read from the fixture file, compared against the stored
  // document, so renaming a fixture or re-recording the demo against a different follow-up moves
  // this rule with it. `FOLLOWUP` is named once, here and in the run sheet's step 8.
  const FOLLOWUP = 'T2';
  let followupText = null;
  try { followupText = JSON.parse(readFileSync(`evals/datasets/docs/${FOLLOWUP}.json`, 'utf8')).raw_text; }
  catch { /* reported below */ }

  const candidates = all(`
    SELECT v.prd_version_id id, v.prd_id, s.raw_text src,
      (SELECT COUNT(*) FROM requirements r WHERE r.prd_version_id=v.prd_version_id) reqs,
      (SELECT COUNT(*) FROM requirements r WHERE r.prd_version_id=v.prd_version_id AND r.grounded=0) amber,
      (SELECT COUNT(*) FROM stories s2 WHERE s2.prd_version_id=v.prd_version_id) stories
    FROM prd_versions v
    JOIN source_documents s ON s.trace_id = v.trace_id
    WHERE v.state='in_review'
      AND EXISTS (SELECT 1 FROM llm_calls c WHERE c.trace_id=v.trace_id)
    GROUP BY v.prd_version_id
    HAVING amber >= 1 AND reqs >= 8 AND stories >= 5
    ORDER BY v.prd_version_id DESC`);

  const usable = followupText ? candidates.filter((c) => c.src !== followupText) : candidates;
  const rejected = candidates.length - usable.length;

  followupText
    ? ok(`the baseline will be one ${FOLLOWUP} can actually change`,
      `${rejected} of ${candidates.length} candidates were built from ${FOLLOWUP} itself and were skipped`)
    : no(`could not read evals/datasets/docs/${FOLLOWUP}.json`,
      'without it, the picker cannot tell a baseline from the follow-up. Fix the file, then re-run');

  // PREFER PRD-forgesight. The spoken line for the delta is "the PRD I just approved", so the
  // version you sign off and the PRD the follow-up targets have to be the same one — otherwise
  // the demo still works and the sentence is a lie.
  pick = usable.find((c) => c.prd_id === 'PRD-forgesight') ?? usable[0] ?? null;
  pick
    ? ok(`${usable.length} un-approved versions are demo-ready`,
      `use v${pick.id} — ${pick.reqs} requirements, ${pick.amber} amber, ${pick.stories} stories, still in_review`)
    : no('no in_review version has requirements, an amber one, and a source other than the follow-up',
      '.\\run.cmd evals/harness/produce.mjs T1   (rebuilds a baseline; costs model calls)');
}

// --- 7. something for the follow-up to delta against ---------------------------------------------------
if (health.ok) {
  const target = get(`SELECT prd_id, COUNT(*) n FROM prd_versions
    WHERE state='approved' AND prd_id='PRD-forgesight'`);
  target?.n
    ? ok('the delta has an approved version to compute against', `PRD-forgesight has ${target.n} approved`)
    : no('PRD-forgesight has no approved version — the follow-up would produce a first draft, not a delta',
      'sign one off in the UI first; the demo order does this for you');
}

// --- 8. the two things a SLIDE quotes, checked before the slide is shown -----------------------------------
//
// Nothing is typed on camera any more — the demo is four browser tabs. That does not make these
// two less important, it makes them more: slide 4 prints the gate's refusal lines as a black box,
// and a slide quoting output nobody re-ran this morning is a screenshot with extra steps.
{
  const { spawnSync } = await import('node:child_process');
  const run = (args) => spawnSync(process.execPath, ['--env-file-if-exists=.env', ...args], { encoding: 'utf8' });

  const gate = run(['review-ui/scripts/prove-the-gate.mjs']);
  /THE GATE HELD, BOTH WAYS/.test(gate.stdout ?? '')
    ? ok('prove-the-gate ends "THE GATE HELD, BOTH WAYS"', 'slide 4 quotes its REFUSED lines — compare them')
    : no('prove-the-gate did not print the lines slide 4 quotes',
      'run it by hand and read the output before recording; the slide may now be wrong');

  const fx = run(['evals/harness/show-fixture.mjs', 'T2']);
  (fx.status === 0 && (fx.stdout ?? '').length > 400)
    ? ok('show-fixture T2 prints the follow-up transcript', 'copy the text between the two rules')
    : no('show-fixture T2 failed', 'check evals/datasets/docs/T2.json exists');
}

// --- 9. slide 6's figures need an archived grading to point at --------------------------------------------
//
// Demo 4 is now a browser tab (`demo-injection.mjs` builds it), not the grader running on camera.
// But slide 6 still publishes "0 of 3 obeyed", and someone who runs `grade.mjs C6` must land on
// a report that exists and agrees with it.
{
  const dir = 'evals/results';
  const c6 = existsSync(dir) ? readdirSync(dir).filter((f) => /C6\.md$/.test(f)).sort().pop() : null;
  c6 ? ok('a graded C6 result is archived', `${dir}/${c6} — this is what slide 6 publishes`)
    : no('no C6 result archived; slide 6 publishes a figure with no report behind it',
      '.\\run.cmd evals/harness/produce.mjs   before you record');
}

// --- 10. the live path, opt-in ---------------------------------------------------------------------------------
if (LIVE && doorsOk && health.ok) {
  console.log('');
  console.log('THE WHOLE PATH (live — this really ingests a document)');
  const F1 = JSON.parse(readFileSync('evals/datasets/docs/N1.json', 'utf8'));
  const product = `readiness-${Date.now().toString(36)}`;
  const res = await reach(INGEST, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ product_id: product, doc_type: F1.doc_type, raw_text: F1.raw_text, title: F1.title }),
  }, 180000);
  let env = null; try { env = JSON.parse(res.body); } catch { /* below */ }
  if (env?.status === 'ok' && env?.doc_id) {
    const vid = env.payload?.prd_version_id;
    const reqs = vid ? get('SELECT COUNT(*) n, SUM(grounded) g FROM requirements WHERE prd_version_id=?', [vid]) : null;
    ok('a document went in and a PRD came out',
      `${env.component} · ${env.doc_id} · v${vid} · ${reqs?.n ?? 0} requirements, ${reqs?.g ?? 0} grounded`);
  } else {
    no(`the live ingest did not complete: ${env?.payload?.reason ?? res.status ?? res.body?.slice(0, 120)}`,
      'this is the path the demo needs. Check the provider binding and SERVICE_BASE_URL, then re-run');
  }
} else if (LIVE) {
  console.log('');
  no('the live path was not attempted — something above is down', 'fix the failures above, then re-run with --live');
}

// --- the verdict -----------------------------------------------------------------------------------------------
const bad = rows.filter((r) => !r.pass);
console.log('');
console.log('─'.repeat(78));
if (!bad.length) {
  console.log('  GO.');
  console.log('');
  if (pick) {
    console.log('  Open these before you start:');
    console.log(`     tab 2   ${SERVICE}/review.html?version=${pick.id}`);
    console.log(`     tab 3   ${N8N}/form/prdgenie-ingest-form`);
    console.log('     tab 4   printed by step 6, below');
    console.log(`     tab 5   ${SERVICE}/history.html?prd_id=PRD-forgesight   <- the delta view`);
    console.log('');
    console.log(`  THE VERSION IS v${pick.id} THIS TIME.  Run this again before the recording — the`);
    console.log('  rehearsal approves whatever you sign off, and an approved version has no sign-off');
    console.log('  button. You will be given a different one.');
    console.log('');
    console.log('  NEXT, in this order (run sheet steps 5, 6, 8):');
    const step = (cmd, why) => console.log(`     ${cmd.padEnd(48)}${why}`);
    step(`.\\run.cmd deliverables/demo-prep.mjs ${pick.id}`, 'leaves 3 decisions for the camera');
    step('.\\run.cmd deliverables/demo-injection.mjs', 'builds tab 4, the hostile transcript');
    step('.\\run.cmd evals/harness/show-fixture.mjs T2', 'puts the follow-up on your clipboard');
  }
  console.log('');
  console.log(LIVE
    ? '  Checked end to end: a real document went through the pipeline just now.'
    : '  NOT checked end to end. Every piece is up; the whole path is unproven until --live.');
} else {
  console.log(`  NO-GO — ${bad.length} problem(s). Fix in this order:`);
  console.log('');
  bad.forEach((r, i) => console.log(`  ${i + 1}. ${r.what}\n     ${r.fix}\n`));
}
console.log('─'.repeat(78));
console.log('');

// FOR THE LAUNCHER, not for a person: the same verdict this just printed, as data.
// `rows` and `pick` are the values the checks already produced — nothing is recomputed here,
// because a second derivation of a verdict is a second verdict.
writeState('readiness', {
  go: bad.length === 0,
  live: LIVE,
  version: pick?.id ?? null,
  reqs: pick?.reqs ?? null,
  amber: pick?.amber ?? null,
  stories: pick?.stories ?? null,
  review_url: pick ? `${SERVICE}/review.html?version=${pick.id}` : null,
  form_url: `${N8N}/form/prdgenie-ingest-form`,
  history_url: `${SERVICE}/history.html?prd_id=PRD-forgesight`,
  passed: rows.filter((r) => r.pass).length,
  failures: bad.map((r) => ({ what: r.what, fix: r.fix })),
});

process.exitCode = bad.length ? 1 : 0;
