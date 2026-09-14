// Does this machine actually have what the next command needs?
//
// Exists because of BUG-010. Twice a UAT has handed Vaibhav a command that could not run on
// his machine, and both times the first thing he saw was a stack trace or a
// "not recognized" error with no indication of which of five things was wrong.
//
// This is step 0 of every UAT now. It checks, in order, the things that actually break, and
// it says what to do about each one rather than reporting a status.
//
// Usage:  run.cmd            (with no arguments)

const results = [];
const row = (name, ok, detail, fix = null) => results.push({ name, ok, detail, fix });

// --- Node -----------------------------------------------------------------------
const major = Number(process.versions.node.split('.')[0]);
row('Node 22 or newer', major >= 22, `${process.version} at ${process.execPath}`,
  'winget install OpenJS.NodeJS.LTS, then open a NEW terminal');

// node:sqlite is the whole storage layer (ADR 0009). It is unflagged from Node 22.
let sqliteOk = false;
try { await import('node:sqlite'); sqliteOk = true; } catch { /* reported below */ }
row('node:sqlite available', sqliteOk,
  sqliteOk ? 'built in, no npm install needed' : 'missing — Node is too old',
  'Node 22+ ships it; there is nothing to install');

// --- config ---------------------------------------------------------------------
const SERVICE = `http://localhost:${process.env.SERVICE_PORT ?? 3000}`;
const INGEST = process.env.N8N_INGEST_WEBHOOK_URL ?? 'http://localhost:5678/webhook/ingest';
const N8N = new URL(INGEST).origin;

row('.env loaded', Boolean(process.env.SERVICE_PORT || process.env.DB_PATH),
  process.env.DB_PATH ? `DB_PATH=${process.env.DB_PATH}` : 'using built-in defaults',
  'copy .env.example to .env — .\\run.cmd passes --env-file-if-exists automatically');

// --- the two services -----------------------------------------------------------
// An explicit controller with clearTimeout, not AbortSignal.timeout: the latter leaves a
// live timer behind, and calling process.exit() with one pending aborts Node on Windows
// with "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)". A preflight that crashes
// while reporting a problem is worse than no preflight.
async function reach(url, ms = 4000, init = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch (err) {
    return { ok: false, status: null, body: err.message };
  } finally {
    clearTimeout(timer);
  }
}

const health = await reach(`${SERVICE}/api/health`);
let schema = null;
if (health.ok) { try { schema = JSON.parse(health.body); } catch { /* not fatal */ } }
row('review service running', health.ok,
  health.ok ? `${SERVICE}, schema v${schema?.schema_version}, ${schema?.db_path}`
    : `${SERVICE} — ${health.body}`,
  'start it in its OWN terminal and leave it running:\n      .\\run.cmd review-ui/server.js');

const n8n = await reach(`${N8N}/healthz`);
row('n8n running', n8n.ok, n8n.ok ? N8N : `${N8N} — ${n8n.body}`,
  `docker start ${process.env.N8N_CONTAINER ?? 'n8n-local'}`);

// --- the workflows, which is the part that silently is not there ------------------
//
// EVERY DOOR, DERIVED FROM THE EXPORTS, AND WITHOUT SENDING ANYTHING (BUG-058).
//
// This used to POST an empty body at the ingest door — which reaches WF1, starts an execution
// and lands in the refusal branch. A preflight with a side effect, on every bare `.\run.cmd`.
// And it asked about ONE door, while the incident that prompted this was a single door lapsing
// on its own with n8n still reporting the workflow active.
//
// A GET is answered by n8n before any workflow starts, and the two 404s differ: a registered
// POST-only path says "not registered for GET requests", an absent one says "not registered".
// The list comes from the shipped workflows, so a door added tomorrow is checked tomorrow.
let doorsOk = false;
let doorDetail = 'n8n unreachable';
if (n8n.ok) {
  try {
    const { doorsFromWorkflows, probeDoor } = await import('../../n8n/scripts/check-doors-registered.mjs');
    const doors = doorsFromWorkflows(undefined, N8N);
    const states = [];
    for (const d of doors) states.push({ ...d, state: await probeDoor(d) });
    const bad = states.filter((s) => s.state !== 'registered');
    doorsOk = doors.length > 0 && bad.length === 0;
    doorDetail = !doors.length
      ? 'no doors found in n8n/workflows — the extractor is broken, not the doors'
      : bad.length
        ? `${bad.length} of ${doors.length} not registered: ${bad.map((b) => b.url.split('/').pop()).join(', ')}`
        : `${doors.length} declared doors answer (a GET, so nothing ran)`;
  } catch (err) {
    doorDetail = `could not read the workflow exports: ${err.message}`;
  }
}
row('every declared door registered', doorsOk, doorDetail,
  '.\\run.cmd n8n/scripts/import-workflows.mjs   then   docker restart ' + (process.env.N8N_CONTAINER ?? 'n8n-local'));

// --- report -----------------------------------------------------------------------
const width = Math.max(...results.map((r) => r.name.length));
console.log('');
for (const r of results) {
  console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
}

const bad = results.filter((r) => !r.ok);
console.log('');
if (!bad.length) {
  console.log('  Everything the next command needs is here.');
} else {
  console.log(`  ${bad.length} problem(s). Fix in this order:\n`);
  bad.forEach((r, i) => console.log(`  ${i + 1}. ${r.name}\n      ${r.fix}\n`));
}
// exitCode, not process.exit(): let Node close its handles rather than aborting on them.
process.exitCode = bad.length ? 1 : 0;
