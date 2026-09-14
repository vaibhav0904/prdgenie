// The negative control for BUG-018, run in BOTH directions.
//
// The claim being controlled: the ONE exclusion bullet in the extraction prompt is what
// decides whether `T3-R07` (the tablet cut) is extracted. If that is true, putting the old
// bullet back must make T3-R07 go missing again — and if it does not, then something else
// in the same batch of changes is doing the work and BUG-018's diagnosis is wrong.
//
// TWO THINGS ARE CONTROLLED, and they are not the same strength.
//
//   1. PROMPT HYGIENE — deterministic. The old bullet quotes T3-R07's own supporting
//      sentence, so `verify-prompt-hygiene.mjs` must FAIL with it restored and PASS with
//      the new clause. A string is either there or it is not.
//
//   2. EXTRACTION BEHAVIOUR — statistical, and said so out loud. The model ignored the old
//      clause in roughly one run of three: at prompt 5ad1a07854f1 T3-R07 was missed in 2 of
//      3 runs, not 3 of 3. A single run therefore cannot demonstrate anything, in either
//      direction. So each clause is run three times, and the control asserts:
//
//        old clause  ->  T3-R07 missing in AT LEAST ONE of three
//        new clause  ->  T3-R07 present in ALL THREE
//
//      If the old clause produces R07 three times out of three, this control has FAILED TO
//      DEMONSTRATE its claim. That is a result to report, not a run to repeat until it
//      agrees — re-rolling a stochastic control until it passes is how a control becomes
//      decoration.
//
// The prompt file is restored in a `finally` and byte-compared, and the workflow is
// re-synced and re-imported so n8n is not left running the old text.
//
// Costs six model runs on one fixture, plus four n8n restarts. Slow on purpose.
//
// Usage:  .\run.cmd evals/harness/negative-control-clause.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { all, get } from '../../review-ui/db.mjs';
import { loadLabels, resolveLabels, fixtureId } from './labels.mjs';
import { matchRequirements } from './match.mjs';
import { takeExclusive } from '../../exclusive.mjs';

// ONE MUTATOR AT A TIME (BUG-054).
// This script swaps an older prompt into WF2, re-syncs and re-imports it — so a second copy of
// it, or a `check-all` sweep running beside it, interleaves, and each reports the other's
// cleanup as its own defect. Inside a sweep that already holds the lock this is a no-op.
takeExclusive('evals/harness/negative-control-clause.mjs', {
  files: ['n8n/prompts/extract-requirements.md', 'n8n/workflows/WF2-generate-prd.json'],
});

const PROMPT = 'n8n/prompts/extract-requirements.md';
// The node this control is actually about, named once (E7-S5: two places naming a thing is
// two places that can disagree).
const WF2 = 'n8n/workflows/WF2-generate-prd.json';
const EXTRACT_NODE = 'Build extraction call';
const SCRATCH = 'evals/results/.negative-control-clause.json';
const TARGET_LABEL = 'T3-R07';
const RUNS = 3;

// The bullet exactly as it stood before this fix. Reproduced here rather than read from git
// so the control states its own subject: this is the text being blamed.
const OLD_BULLET = `- **Either side of an unsettled disagreement.** If one speaker asks for something, another
  contradicts it, and the document ends without resolving it, emit **neither side**. Not
  both, and not the one that was stated more forcefully. A decision described as
  provisional — "let's call it cut for now", "we'll come back to it" — is not settled
  either. Something else in this system handles unresolved disagreements; your job is to
  leave them alone.`;

const original = readFileSync(PROMPT, 'utf8');

// --- THE BREADCRUMB (BUG-053) -----------------------------------------------------------------
//
// The `finally` below restores the prompt byte-for-byte and redeploys it, and that covers every
// way this script can *throw*. It does not cover being killed — and a killed run leaves an older
// prompt in the repository AND in n8n, with nothing to say so but two modified files that look
// like somebody's edit.
//
// So a crumb is dropped before the first mutation and swept up in the same `finally`. Two things
// read it: this script refuses to start while one is lying about, and
// `check-deployed-prompts.mjs` — which runs in every sweep, for nothing — fails on it. **An
// abandoned swap is loud on the next run instead of silent in `git status`.**
const CRUMB = 'n8n/.deploy-in-progress.json';
if (existsSync(CRUMB)) {
  const held = JSON.parse(readFileSync(CRUMB, 'utf8'));
  console.error(`A deployment was left in flight by ${held.script} at ${held.started_at}.`);
  console.error(`It was holding: ${(held.files ?? []).join(', ')}`);
  console.error('');
  console.error('Restore those files from git, re-run n8n/scripts/sync-prompts.mjs and');
  console.error('n8n/scripts/import-workflows.mjs, then delete the crumb:');
  console.error(`  ${CRUMB}`);
  console.error('Do not run this control until the tree and the export agree — it would swap');
  console.error('an old prompt on top of an older one and restore to the wrong place.');
  process.exit(1);
}
const dropCrumb = () => writeFileSync(CRUMB, `${JSON.stringify({
  script: 'evals/harness/negative-control-clause.mjs',
  started_at: new Date().toISOString(),
  pid: process.pid,
  files: [PROMPT, 'n8n/workflows/WF2-generate-prd.json'],
  restore_with: 'git checkout -- <files>, then sync-prompts.mjs and import-workflows.mjs',
}, null, 2)}\n`);
const sweepCrumb = () => { try { rmSync(CRUMB); } catch { /* already gone */ } };

let failures = 0;
const say = (pass, msg) => { if (!pass) failures++; console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${msg}`); };

// --- the machinery ------------------------------------------------------------------

function node(script, args = []) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [script, ...args], { encoding: 'utf8' }) };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

function sh(cmd, args) {
  try { return execFileSync(cmd, args, { encoding: 'utf8' }); } catch (err) { return `${err.stdout ?? ''}${err.stderr ?? ''}`; }
}

// Wait for the DOORS, not for the process.
//
// `/healthz` goes green well before n8n has re-registered its production webhooks after a
// restart. The first version of this control polled it, started producing into that window,
// and got HTTP 404 from the door on all six runs — which the control then read as
// "T3-R07 missing", and one assertion PASSED on runs that never happened. That is BUG-001's
// shape exactly: an assertion satisfiable by absence.
//
// The probe is a GET on a POST-only webhook. n8n distinguishes the two 404s in the body, and
// the difference is precisely what is being waited for:
//   registered    -> "This webhook is not registered for GET requests."
//   not yet       -> "The requested webhook \"GET ingest\" is not registered."
async function waitForDoors(seconds = 180) {
  const doors = ['http://localhost:5678/webhook/ingest', 'http://localhost:5678/webhook/generate'];
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    const ready = await Promise.all(doors.map(async (url) => {
      try {
        const body = await (await fetch(url)).text();
        return /not registered for GET requests/i.test(body);
      } catch { return false; }
    }));
    if (ready.every(Boolean)) return true;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

// THE HASH OF THE EXTRACTION PROMPT, the same twelve characters `sync-prompts.mjs` stamps.
const hashOf = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);

/** What the SHIPPED extraction node will actually send — read out of the workflow, not scraped. */
function deployedExtractionVersion() {
  const code = JSON.parse(readFileSync(WF2, 'utf8'))
    .nodes.find((n) => n.name === EXTRACT_NODE)?.parameters?.jsCode ?? '';
  return /PROMPT_VERSION\s*=\s*'([0-9a-f]+)'/.exec(code)?.[1] ?? 'unknown';
}

/**
 * Push whatever is currently in the prompt file all the way into a running n8n.
 *
 * THIS USED TO PRINT THE WRONG NUMBER (BUG-044). It scraped the first `prompt_version=` out of
 * `sync-prompts.mjs`'s output — which is whichever prompt that script happens to list first,
 * not the extraction prompt. So it printed the SAME value in both directions, and the line
 * that was supposed to prove the swap had been deployed could not have changed if the swap had
 * silently failed. Printing a figure the case cannot fail on is BUG-026.
 *
 * Now it asserts the record: the extraction node in the shipped workflow must carry the hash
 * of the prompt file as it stands on disk at this moment.
 */
async function deploy(what) {
  node('n8n/scripts/sync-prompts.mjs');
  const onDisk = hashOf(readFileSync(PROMPT, 'utf8'));
  const inWorkflow = deployedExtractionVersion();
  say(onDisk === inWorkflow,
    `the extraction node carries the prompt on disk (${inWorkflow} vs ${onDisk})`);
  node('n8n/scripts/import-workflows.mjs');
  sh('docker', ['restart', 'n8n-local']);
  const up = await waitForDoors();
  console.log(`  deployed ${what}: extraction prompt_version=${inWorkflow}, `
    + `doors ${up ? 'answering' : 'NEVER CAME BACK'}`);
  if (!up) { failures++; }
  return inWorkflow;
}

/** Produce T3 once into a scratch manifest and report whether TARGET_LABEL was matched. */
function produceAndCheck() {
  mkdirSync('evals/results', { recursive: true });
  const res = node('evals/harness/produce.mjs', ['T3', `--manifest=${SCRATCH}`]);
  if (res.code !== 0) { console.log(res.out); return { error: 'produce failed' }; }

  const manifest = JSON.parse(readFileSync(SCRATCH, 'utf8'));
  const run = manifest.runs?.T3;
  if (!run?.prd_version_id) return { error: 'no T3 version in the scratch manifest' };

  const doc = get('SELECT * FROM source_documents WHERE doc_id=?', [run.doc_id]);
  const labelFile = loadLabels().find((l) => fixtureId(l.file) === 'T3');
  const { regionsByLabel } = resolveLabels(labelFile, doc.raw_text);
  const labels = (labelFile.expected_requirements ?? [])
    .map((r) => ({ label_id: r.label_id, kind: r.kind, statement: r.statement }));

  const reqs = all(
    'SELECT req_id, kind, statement FROM requirements WHERE prd_version_id=? ORDER BY req_id',
    [run.prd_version_id]);
  for (const r of reqs) {
    r.citations = all('SELECT start_char, end_char FROM citations WHERE req_id=?', [r.req_id])
      .filter((c) => Number.isInteger(c.start_char));
  }

  const { rows } = matchRequirements(reqs, labels, regionsByLabel);
  const hit = rows.find((r) => r.verdict === 'match' && r.label_id === TARGET_LABEL);
  return { version: run.prd_version_id, found: Boolean(hit), statement: hit?.statement ?? null, total: reqs.length };
}

function threeRuns(what) {
  const results = [];
  for (let i = 1; i <= RUNS; i++) {
    const r = produceAndCheck();
    results.push(r);
    console.log(`    run ${i}: ${r.error ? `ERROR ${r.error}` : `${TARGET_LABEL} ${r.found ? 'PRESENT' : 'MISSING'}  (${r.total} requirements)`}`);
  }

  // A run that never reached the model is not evidence of anything, and it must never be
  // counted as "the label was missing". Stop rather than average over it.
  const broken = results.filter((r) => r.error);
  if (broken.length) {
    console.error(`\n  ${broken.length} of ${RUNS} runs FAILED TO EXECUTE (${broken[0].error}).`);
    console.error('  Stopping: an absent result is not a negative result. Fix the rig and re-run;');
    console.error('  the prompt is restored on the way out.');
    throw new Error('control runs did not execute');
  }

  const found = results.filter((r) => r.found).length;
  console.log(`  ${what}: ${TARGET_LABEL} present in ${found} of ${RUNS}`);
  return found;
}

// --- direction 1: as it stands, the new clause -----------------------------------------

console.log('\nDIRECTION 1 — the clause as fixed\n');
const hygieneNew = node('evals/harness/verify-prompt-hygiene.mjs');
say(hygieneNew.code === 0, 'the prompt does not quote the answer key');
const versionNew = await deploy('the new clause');
const foundNew = threeRuns('new clause');
say(foundNew === RUNS, `${TARGET_LABEL} is extracted in all ${RUNS} runs (got ${foundNew})`);

// --- direction 2: put the old bullet back and require the behaviour to come back ---------

console.log('\nDIRECTION 2 — the old bullet restored\n');
let foundOld = null;
dropCrumb();
try {
  // ANCHORED ON A STABLE PREFIX, NOT ON THE WHOLE HEADING (BUG-044).
  //
  // This control was dead from 2026-09-03 to 2026-09-04 because it matched the heading
  // exactly — and the heading is the part that changes. When `unsettled_positions` was added,
  // both headings grew a redirect ("— those go in `unsettled_positions`", "— and the
  // withdrawal is already recorded"), the match failed, and the control exited 1 into an
  // empty room for a day.
  //
  // A looser match is not free: it could silently select the wrong span, and a control that
  // swaps the wrong text is worse than one that does not run. So each prefix must occur
  // EXACTLY ONCE, the span must be non-empty and ordered, and the text being replaced must
  // still be the bullet this control blames.
  const START = '- **Either side of an unsettled disagreement';
  const END = '\n- **A position that was later withdrawn';

  const countOf = (needle) => original.split(needle).length - 1;
  const startHits = countOf(START);
  const endHits = countOf(END);
  const start = original.indexOf(START);
  const end = original.indexOf(END, start);

  if (startHits !== 1 || endHits !== 1 || start < 0 || end <= start) {
    console.error(`Could not locate exactly one bullet to swap in ${PROMPT}.`);
    console.error(`  "${START}…"  matched ${startHits} time(s)`);
    console.error(`  "${END.trim()}…"  matched ${endHits} time(s)`);
    console.error('A control that cannot find its subject asserts nothing, and one that guesses');
    console.error('at it asserts something false. Update the anchors before running this again.');
    process.exit(1);
  }

  const swapped = original.slice(0, start) + OLD_BULLET + original.slice(end);
  say(swapped !== original, 'the swap actually changed the prompt');
  say(/unsettled_positions/.test(original.slice(start, end)) && !/unsettled_positions/.test(OLD_BULLET),
    'and it replaced the redirect wording with the pre-BUG-018 prohibition');
  writeFileSync(PROMPT, swapped);

  const hygieneOld = node('evals/harness/verify-prompt-hygiene.mjs');
  say(hygieneOld.code !== 0, 'with the old bullet back, the hygiene check FAILS — it quotes T3-R07');
  say(/T3-R07/.test(hygieneOld.out), 'and it names T3-R07 as the label being quoted');

  const versionOld = await deploy('the old bullet');
  // THE ASSERTION THE OLD 'deployed' LINE COULD NOT MAKE: the two directions must actually
  // ship different prompts. Without this, a swap that silently failed to reach n8n would give
  // 'T3-R07 present 3 of 3' in both directions and read as a clean negative result.
  say(versionOld !== versionNew,
    `the two directions deploy DIFFERENT prompts (${versionNew} then ${versionOld})`);
  foundOld = threeRuns('old bullet');
  say(foundOld < RUNS,
    `${TARGET_LABEL} goes missing in at least one of ${RUNS} runs with the old bullet (present in ${foundOld})`);
  if (foundOld === RUNS) {
    console.log('');
    console.log('  ^ THIS CONTROL FAILED TO DEMONSTRATE ITS CLAIM. The old bullet did not');
    console.log('    reproduce the miss. Either the clause is not what was suppressing T3-R07,');
    console.log('    or the miss rate is lower than the 2-in-3 observed at 5ad1a07854f1.');
    console.log('    Report it. Do not re-run until it agrees.');
  }
} finally {
  sweepCrumb();
  writeFileSync(PROMPT, original);
  const restored = readFileSync(PROMPT, 'utf8');
  say(restored === original, `${PROMPT} restored byte-for-byte (${restored.length} bytes)`);
  console.log('\nRedeploying the fixed clause so n8n is not left running the old text.');
  await deploy('the new clause (restored)');
  const hygieneBack = node('evals/harness/verify-prompt-hygiene.mjs');
  say(hygieneBack.code === 0, 'the hygiene check passes again');
}

console.log('');
if (failures) {
  console.error(`NEGATIVE CONTROL FAILED — ${failures} assertion(s).`);
  process.exitCode = 1;
} else {
  console.log(`The clause is what decides ${TARGET_LABEL}: present ${foundNew}/${RUNS} with the new`);
  console.log(`wording, ${foundOld}/${RUNS} with the old one, and the hygiene check moves with it.`);
}
