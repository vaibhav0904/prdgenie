// Deploys the seven workflows to an n8n you do NOT have a Docker shell into — n8n Cloud, or a
// self-hosted instance on a server — through n8n's public REST API.
//
// `import-workflows.mjs` is the local path: it uses the n8n CLI inside the container, which
// preserves every workflow's committed id, so the sub-workflow references and the error-workflow
// setting in the exports work untouched. The public API refuses a supplied id ("request/body/id
// is read-only"), so a hosted instance hands out its own ids and this script rewrites every
// reference to match. It also rewrites the two addresses the exports carry — the review service
// as n8n reaches it, and n8n's own address for the calls WF1 makes to its sibling doors — because
// on a hosted instance neither `host.docker.internal:3000` nor `localhost:5678` means anything.
//
// Reads from .env (run.cmd loads it):
//   N8N_API_URL             the instance, e.g. https://you.app.n8n.cloud
//   N8N_API_KEY             Settings -> n8n API -> create an API key
//   SERVICE_BASE_URL        the review service AS N8N REACHES IT (a public URL or a tunnel)
//   INTERNAL_API_KEY        the shared secret the review service checks on /internal/* calls;
//                           generated and written to .env if still the placeholder
//   OPENAI_CREDENTIAL_ID    the id of the OpenAI credential you created in the n8n UI
//   GEMINI_CREDENTIAL_ID    the id of the Google Gemini(PaLM) API credential, likewise
//   N8N_WORKFLOW_TAG        defaults to prdgenie
//
// The two provider credentials are created by hand in n8n's UI and their ids are copied from the
// address bar (…/home/credentials/<id>). The keys themselves never pass through this repository
// (ADR 0004). The public API has no "list credentials" call, so the ids cannot be discovered;
// they have to be given.
//
// Idempotent: a workflow is found by name and updated in place, so running this twice is an
// update, not a duplicate. The header-auth credential it creates for INTERNAL_API_KEY is
// remembered in n8n/workflows.local/hosted-bindings.json (gitignored) and reused until the key
// changes. `--dry-run` prints the plan and touches nothing.
//
// Usage:  .\run.cmd n8n/scripts/deploy-hosted.mjs [--dry-run]

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';

const DRY = process.argv.includes('--dry-run');
const DIR = 'n8n/workflows';
const LOCAL_DIR = 'n8n/workflows.local';
const BINDINGS = join(LOCAL_DIR, 'hosted-bindings.json');
const ENV_PATH = '.env';

// The exact strings the exports carry. Changing an export changes these; the export-hygiene
// check pins them, and this list is the other half of that contract.
const LOCAL_SERVICE = 'http://host.docker.internal:3000';
const LOCAL_N8N = 'http://localhost:5678';
const INTERNAL_CRED_ID = 'prdgenieInternalKey';
const INTERNAL_CRED_NAME = 'PRDGenie Internal Service Key';
const PROVIDER_PLACEHOLDERS = {
  BIND_ME_openAiApi: ['OPENAI_CREDENTIAL_ID', 'OpenAI'],
  BIND_ME_googlePalmApi: ['GEMINI_CREDENTIAL_ID', 'Google Gemini(PaLM) API'],
};

const fail = (msg) => { console.error(`\nFAIL  ${msg}`); process.exit(1); };
const strip = (u) => String(u ?? '').replace(/\/+$/, '');

// ---- configuration --------------------------------------------------------------------------

const N8N = strip(process.env.N8N_API_URL);
// The address n8n uses to call ITSELF (WF1 -> the generate and delta doors). A hosted instance
// reaches its own public URL, so this is N8N_API_URL unless you say otherwise — you would
// behind a reverse proxy that does not loop back, or in a Docker port mapping where the host's
// localhost:5679 is the container's localhost:5678.
const N8N_SELF = strip(process.env.N8N_SELF_URL) || N8N;
const API_KEY = process.env.N8N_API_KEY?.trim();
const SERVICE = strip(process.env.SERVICE_BASE_URL);
const TAG = process.env.N8N_WORKFLOW_TAG || 'prdgenie';

if (!N8N || !/^https?:\/\//.test(N8N)) fail('N8N_API_URL must be the instance URL, e.g. https://you.app.n8n.cloud');
if (!API_KEY) fail('N8N_API_KEY is empty. In n8n: Settings -> n8n API -> Create an API key, then put it in .env');
if (!SERVICE || !/^https?:\/\//.test(SERVICE)) fail('SERVICE_BASE_URL must be the review service as n8n reaches it (a public URL or a tunnel)');
if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(SERVICE) && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(N8N)) {
  fail(`SERVICE_BASE_URL is ${SERVICE}, but a hosted n8n cannot reach your localhost. Put the review service behind a public URL or a tunnel (see deliverables/SETUP.md) and use that address.`);
}
const providerIds = {};
for (const [placeholder, [envName, label]] of Object.entries(PROVIDER_PLACEHOLDERS)) {
  const id = process.env[envName]?.trim();
  if (!id) fail(`${envName} is empty. In n8n: Credentials -> Add credential -> "${label}", paste the key, Save, then copy the id from the address bar (…/credentials/<id>) into .env`);
  providerIds[placeholder] = id;
}

function readOrCreateInternalKey() {
  let env = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  const m = env.match(/^INTERNAL_API_KEY=(.*)$/m);
  const current = m?.[1]?.trim();
  if (current && current !== 'change-me-any-random-string') return { key: current, generated: false };
  if (DRY) return { key: '(would be generated)', generated: true };
  const key = randomBytes(24).toString('base64url');
  env = m ? env.replace(/^INTERNAL_API_KEY=.*$/m, `INTERNAL_API_KEY=${key}`) : `${env.trimEnd()}\nINTERNAL_API_KEY=${key}\n`;
  writeFileSync(ENV_PATH, env);
  return { key, generated: true };
}
const internal = readOrCreateInternalKey();
if (internal.generated) console.log(DRY ? 'INTERNAL_API_KEY is the placeholder; a real one would be generated into .env.' : 'Generated INTERNAL_API_KEY and wrote it to .env (gitignored). Restart the review service so it reads it.');
const internalHash = createHash('sha256').update(internal.key).digest('hex').slice(0, 16);

// ---- the API ------------------------------------------------------------------------------

async function api(method, path, body) {
  const res = await fetch(`${N8N}/api/v1${path}`, {
    method,
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    const msg = json?.message ?? text.slice(0, 200);
    throw new Error(`${method} ${path} -> ${res.status} ${msg}`);
  }
  return json;
}

async function listAll(path) {
  const out = [];
  let cursor;
  do {
    const page = await api('GET', `${path}${path.includes('?') ? '&' : '?'}limit=100${cursor ? `&cursor=${cursor}` : ''}`);
    out.push(...(page?.data ?? []));
    cursor = page?.nextCursor ?? null;
  } while (cursor);
  return out;
}

// ---- the plan -------------------------------------------------------------------------------

const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
if (files.length !== 7) fail(`expected 7 exports in ${DIR}, found ${files.length}`);
const exports_ = files.map((file) => ({ file, wf: JSON.parse(readFileSync(join(DIR, file), 'utf8')) }));
const committedIds = exports_.map(({ wf }) => wf.id);

console.log(`\nn8n      ${N8N}`);
console.log(`service  ${SERVICE}   (rewrites ${LOCAL_SERVICE})`);
console.log(`self     ${N8N_SELF}   (rewrites ${LOCAL_N8N}${N8N_SELF !== N8N ? '; N8N_SELF_URL is set' : ''})`);
console.log(`tag      ${TAG}`);
for (const [placeholder, id] of Object.entries(providerIds)) console.log(`${placeholder.padEnd(24)} -> ${id}`);

let me;
try { me = await api('GET', '/workflows?limit=1'); } catch (e) { fail(`cannot reach the n8n API: ${e.message}`); }
void me;

const existing = new Map((await listAll('/workflows')).map((w) => [w.name, w]));

// Pass 1: every workflow exists, so every id is known before any reference is rewritten.
const idMap = {};
for (const { file, wf } of exports_) {
  const found = existing.get(wf.name);
  if (found) {
    idMap[wf.id] = found.id;
    console.log(`found    ${file.padEnd(28)} "${wf.name}" is ${found.id}${found.active ? ' (active)' : ''}`);
  } else if (DRY) {
    idMap[wf.id] = `<new id for ${wf.id}>`;
    console.log(`create   ${file.padEnd(28)} "${wf.name}" does not exist yet`);
  } else {
    const created = await api('POST', '/workflows', { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: { executionOrder: 'v1' } });
    idMap[wf.id] = created.id;
    existing.set(wf.name, created);
    console.log(`created  ${file.padEnd(28)} "${wf.name}" as ${created.id}`);
  }
}

// The header-auth credential for INTERNAL_API_KEY. No list call exists, so it is remembered.
let bindings = existsSync(BINDINGS) ? JSON.parse(readFileSync(BINDINGS, 'utf8')) : {};
let internalCredId = bindings[N8N]?.internalKeyHash === internalHash ? bindings[N8N].internalCredentialId : null;
if (internalCredId) {
  console.log(`credential ${INTERNAL_CRED_NAME}: reusing ${internalCredId} (recorded in ${BINDINGS})`);
} else if (DRY) {
  internalCredId = '<new credential id>';
  console.log(`credential ${INTERNAL_CRED_NAME}: would be created from INTERNAL_API_KEY`);
} else {
  const cred = await api('POST', '/credentials', { name: INTERNAL_CRED_NAME, type: 'httpHeaderAuth', data: { name: 'x-internal-key', value: internal.key } });
  internalCredId = cred.id;
  mkdirSync(LOCAL_DIR, { recursive: true });
  bindings[N8N] = { internalCredentialId: internalCredId, internalKeyHash: internalHash, createdAt: new Date().toISOString() };
  writeFileSync(BINDINGS, JSON.stringify(bindings, null, 2) + '\n');
  console.log(`credential ${INTERNAL_CRED_NAME}: created ${internalCredId} (recorded in ${BINDINGS})`);
}

// Pass 2: rewrite and update. Everything the exports carry that is local is a literal token,
// so the rewrite is a string replacement on the JSON text, then a parse — which also proves the
// result is still JSON before it is sent anywhere.
const rewrite = (wf) => {
  let text = JSON.stringify(wf);
  text = text.split(LOCAL_SERVICE).join(SERVICE);
  text = text.split(LOCAL_N8N).join(N8N_SELF);
  text = text.split(`"${INTERNAL_CRED_ID}"`).join(JSON.stringify(internalCredId));
  for (const [placeholder, id] of Object.entries(providerIds)) text = text.split(`"${placeholder}"`).join(JSON.stringify(id));
  for (const committed of committedIds) text = text.split(`"${committed}"`).join(JSON.stringify(idMap[committed]));
  const out = JSON.parse(text);
  // A token that maps to itself is allowed to remain: a committed id the instance happens to
  // share (a CLI import keeps ids), or a self-address that really is localhost:5678.
  const renamed = committedIds.filter((c) => idMap[c] !== c);
  const literals = [SERVICE !== LOCAL_SERVICE && LOCAL_SERVICE, N8N_SELF !== LOCAL_N8N && LOCAL_N8N].filter(Boolean);
  const leftovers = [...literals, 'BIND_ME_', ...renamed].filter((t) => text.includes(t));
  if (leftovers.length) throw new Error(`${wf.name}: still carries ${leftovers.join(', ')} after rewriting`);
  return { name: out.name, nodes: out.nodes, connections: out.connections, settings: out.settings ?? { executionOrder: 'v1' } };
};

let tagId = null;
if (!DRY) {
  const tags = await listAll('/tags');
  tagId = tags.find((t) => t.name === TAG)?.id ?? (await api('POST', '/tags', { name: TAG })).id;
}

const doors = [];
for (const { file, wf } of exports_) {
  const body = rewrite(wf);
  const id = idMap[wf.id];
  for (const node of wf.nodes) {
    if (node.type === 'n8n-nodes-base.webhook') doors.push({ name: node.parameters.path, url: `${N8N}/webhook/${node.parameters.path}`, kind: 'webhook' });
    if (node.type === 'n8n-nodes-base.formTrigger') doors.push({ name: node.webhookId, url: `${N8N}/form/${node.webhookId}`, kind: 'form' });
  }
  if (DRY) { console.log(`would    ${file.padEnd(28)} update ${id}, tag, ${wf.active ? 'activate' : 'leave inactive'}`); continue; }
  await api('PUT', `/workflows/${id}`, body);
  await api('PUT', `/workflows/${id}/tags`, [{ id: tagId }]);
  if (wf.active) {
    // An update to an active workflow does not always re-register its webhooks; off then on does.
    try { await api('POST', `/workflows/${id}/deactivate`); } catch { /* was inactive */ }
    await api('POST', `/workflows/${id}/activate`);
  }
  console.log(`updated  ${file.padEnd(28)} ${id}${wf.active ? '  active' : ''}`);
}

if (DRY) { console.log('\nDry run. Nothing was sent.'); process.exit(0); }

// ---- the doors, probed through themselves --------------------------------------------------
// A GET runs nothing: a webhook door answers 404 with "not registered" only when it is not
// there, and a form door renders its page. Same rule as check-doors-registered.mjs.
console.log('');
let bad = 0;
for (const door of doors) {
  const res = await fetch(door.url, { method: 'GET', redirect: 'manual' }).catch(() => null);
  const status = res?.status ?? 0;
  const text = res ? (await res.text()).slice(0, 200) : '';
  // A webhook that only accepts POST answers a GET with "not registered for GET requests" —
  // which is n8n saying it IS there. Plain "not registered" is the real absence.
  const registered = door.kind === 'form'
    ? status === 200
    : /not registered for GET requests/i.test(text) || !/not registered/i.test(text);
  if (!registered) bad++;
  console.log(`${registered ? 'ok  ' : 'FAIL'}  door ${door.name.padEnd(22)} ${door.url}  (${status || 'unreachable'})`);
}

console.log(`
Next, on the machine that runs the review service:
  .env there needs the same INTERNAL_API_KEY as this one, and
  N8N_INGEST_WEBHOOK_URL=${N8N}/webhook/ingest
  Then:  .\\run.cmd   (the preflight probes these same doors)
The form for a demo:  ${N8N}/form/prdgenie-ingest-form`);
if (bad) fail(`${bad} door(s) not registered. Open ${N8N}, check each workflow is active, then run this again.`);
