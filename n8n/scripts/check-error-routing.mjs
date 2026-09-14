// Every workflow routes its failures to WF4 — checked, not clicked (E7-S3).
//
// `settings.errorWorkflow` is a field you set in the n8n UI, which means the normal way it
// becomes true is that somebody remembered. That is the same failure mode `sync-prompts.mjs`
// exists for, and it is worse here: a workflow with no error handler fails **silently and
// only when something else has already gone wrong**, which is the one moment nobody is
// watching the right screen.
//
// So the wiring lives in the committed JSON, this check reads it there, and then it reads it
// a SECOND TIME out of the running instance — because the file is the source of truth and the
// instance is what actually fails. The live half goes through the n8n API when a key is
// configured and through `docker exec … n8n export:workflow` when one is not, which is this
// project's normal state; a check whose strongest assertion is switched off by a missing
// optional key is a check that will be green for the wrong reason.
//
// The set of workflows is DERIVED from the directory. A new workflow arrives unrouted and
// this check goes red, rather than a hand-typed list quietly not mentioning it (BUG-003).
//
// Usage:  .\run.cmd n8n/scripts/check-error-routing.mjs

import { readFileSync, readdirSync } from 'node:fs';

const DIR = 'n8n/workflows';
const HANDLER_FILE = 'WF4-error-handler.json';
const API = process.env.N8N_API_URL ?? 'http://localhost:5678';
const KEY = process.env.N8N_API_KEY;
const CONTAINER = process.env.N8N_CONTAINER ?? 'n8n-local';

const files = readdirSync(DIR).filter((n) => n.endsWith('.json'));
const load = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));

const problems = [];
const fail = (m) => problems.push(m);

// --- the handler itself -------------------------------------------------------------------
if (!files.includes(HANDLER_FILE)) {
  console.error(`FAIL  ${HANDLER_FILE} does not exist — there is nothing to route to.`);
  process.exit(1);
}
const handler = load(HANDLER_FILE);
const HANDLER_ID = handler.id;
const trigger = (handler.nodes ?? []).find((n) => n.type === 'n8n-nodes-base.errorTrigger');

console.log(`Error handler:      ${HANDLER_FILE}  id=${HANDLER_ID}`);
console.log(`Its trigger:        ${trigger ? `${trigger.name} [errorTrigger]` : 'NONE'}`);
if (!trigger) fail(`${HANDLER_FILE} has no Error Trigger node, so nothing can route to it`);

// It must write the failure somewhere. A handler that catches and drops is worse than no
// handler, because the execution list at least shows red.
const writes = (handler.nodes ?? []).some((n) => n.type === 'n8n-nodes-base.httpRequest'
  && String(n.parameters?.url ?? '').includes('/internal/dead-letter'));
if (!writes) fail(`${HANDLER_FILE} never calls /internal/dead-letter — it catches and drops`);

// --- everything else ----------------------------------------------------------------------
const routed = [];
for (const f of files) {
  if (f === HANDLER_FILE) continue;
  const wf = load(f);
  const set = wf.settings?.errorWorkflow ?? null;
  routed.push({ file: f, id: wf.id, set });
  if (set !== HANDLER_ID) {
    fail(`${f}: settings.errorWorkflow is ${set === null ? 'unset' : `"${set}"`}, not "${HANDLER_ID}"`);
  }
}

console.log('');
console.log(`Workflows to route:  ${routed.length}  (derived from ${DIR}, never typed)`);
for (const r of routed) {
  console.log(`  ${r.set === HANDLER_ID ? 'ok  ' : 'MISS'}  ${r.file.padEnd(24)} -> ${r.set ?? '(unset)'}`);
}
console.log('');

// --- and what the instance actually has ----------------------------------------------------
//
// The file is the source of truth (ADR 0010); the instance is what fails at three in the
// morning. Both, or the check only proves someone edited a file.
let live = null;
let liveVia = null;

if (KEY) {
  try {
    const res = await fetch(`${API}/api/v1/workflows?limit=100`, {
      headers: { 'X-N8N-API-KEY': KEY }, signal: AbortSignal.timeout(8000),
    });
    if (res.ok) { live = (await res.json()).data ?? []; liveVia = 'the n8n API'; }
    else fail(`the n8n API answered ${res.status} — could not check the running instance`);
  } catch (err) {
    fail(`could not reach n8n at ${API}: ${err.message}`);
  }
} else {
  // No API key configured, which is the normal state of this project: `import-workflows.mjs`
  // goes through the CLI in the container for the same reason. So does this — the live half
  // of the check is the half that matters, and skipping it because a key is absent would
  // leave the strongest assertion permanently switched off.
  try {
    const { execFileSync } = await import('node:child_process');
    execFileSync('docker', ['exec', CONTAINER, 'n8n', 'export:workflow', '--all',
      '--output=/tmp/prdgenie-live-workflows.json'], { stdio: 'pipe' });
    const raw = execFileSync('docker', ['exec', CONTAINER, 'cat',
      '/tmp/prdgenie-live-workflows.json'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    live = JSON.parse(raw);
    liveVia = `docker exec ${CONTAINER} n8n export:workflow`;
  } catch (err) {
    console.log('LIVE CHECK SKIPPED: no N8N_API_KEY, and the n8n container could not be read');
    console.log(`  (${String(err.message).split('\n')[0]})`);
    console.log('This run checked the committed files only — which proves the wiring is written');
    console.log('down, not that n8n has it.');
  }
}

{
  if (live) {
    console.log(`Live check via:      ${liveVia}`);
    const byId = new Map(live.map((w) => [w.id, w]));
    console.log(`Running instance:    ${live.length} workflow(s) visible`);
    if (!byId.has(HANDLER_ID)) fail(`the running n8n has no workflow ${HANDLER_ID} — import it`);
    for (const r of routed) {
      const w = byId.get(r.id);
      if (!w) { fail(`${r.file}: id ${r.id} is not in the running n8n — import it`); continue; }
      const liveSet = w.settings?.errorWorkflow ?? null;
      console.log(`  ${liveSet === HANDLER_ID ? 'ok  ' : 'MISS'}  ${String(r.id).padEnd(24)} -> ${liveSet ?? '(unset)'}`);
      if (liveSet !== HANDLER_ID) {
        fail(`${r.id} is routed in the file but ${liveSet === null ? 'unset' : `"${liveSet}"`} in the running n8n — re-import`);
      }
    }
  }
  console.log('');
}

if (problems.length) {
  console.error(`FAIL  ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`PASS  ${routed.length} workflow(s) route their failures to ${HANDLER_ID}, `
  + `and it writes them to the queue.`);
