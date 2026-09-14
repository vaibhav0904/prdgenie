// Points WF0 at whatever ids this n8n gave the provider credentials — BOTH of them.
//
// Why this is needed (ADR 0010, amendment 3): n8n binds a node to a credential by **id**,
// and an id is generated per instance. WF0's committed JSON named `qQqGaHdi61WLgZ52`,
// which existed only in the instance Docker destroyed on 2026-09-02. On any fresh n8n —
// this machine after the reset, or a stranger's — that reference points at nothing, and the
// only symptom is every extraction failing at the provider call.
//
// The key itself never moves. It is typed into the n8n UI, stays in n8n's encrypted store,
// and this script only ever reads an **id**. Nothing secret is exported, printed or written.
//
// Run this once after adding the OpenAI and Gemini credentials in the UI:
//   .\run.cmd n8n/scripts/bind-provider-credential.mjs
//   .\run.cmd n8n/scripts/import-workflows.mjs
//   docker restart n8n-local

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const CONTAINER = process.argv[2] ?? process.env.N8N_CONTAINER ?? 'n8n-local';
const WORKFLOW = 'n8n/workflows/WF0-llm-call.json';

// WHERE THE BOUND COPY GOES, and why it is not the committed file (E9-S1).
//
// This script used to write the local instance's credential id and account NAME straight into
// the committed WF0 — so the repository carried a handle into one person's n8n and a label off
// their billing account, and `check-export-hygiene` went red on any machine that had ever been
// set up. A check that fails once the product works is a check people turn off.
//
// It writes an OVERRIDE instead: gitignored, per-machine, and preferred by
// `import-workflows.mjs` when it exists. The committed file keeps a placeholder, which is
// honest — on a stranger's instance that id genuinely does point at nothing until they bind.
const LOCAL_DIR = 'n8n/workflows.local';
const OVERRIDE = `${LOCAL_DIR}/WF0-llm-call.json`;
// BOTH providers (E7-S5). WF0 is the only workflow that holds a provider credential, and
// since the judge sweep it holds two of them: the doer's and the stranger's. Binding one and
// forgetting the other is the same failure as binding neither — an id that points at nothing
// on a fresh instance, whose only symptom is every call of that kind failing.
const CRED_TYPES = [
  { type: 'openAiApi', label: 'OpenAI', role: 'the doer (gpt-4.1-mini)' },
  { type: 'googlePalmApi', label: 'Google Gemini(PaLM) API', role: 'the judge (WF6 sweep; the model is named in WF0)' },
];
const REMOTE = '/tmp/prdgenie-credential-ids.json';

const docker = (args) => execFileSync('docker', args, { encoding: 'utf8' });

// Exported WITHOUT --decrypted: the `data` field stays encrypted and we never look at it.
// We want one field, `id`.
docker(['exec', CONTAINER, 'sh', '-c',
  `n8n export:credentials --all --output=${REMOTE} >/dev/null 2>&1 || true`]);

let creds = [];
try {
  creds = JSON.parse(docker(['exec', CONTAINER, 'sh', '-c', `cat ${REMOTE} 2>/dev/null || echo "[]"`]));
} catch {
  creds = [];
} finally {
  try { docker(['exec', CONTAINER, 'sh', '-c', `rm -f ${REMOTE}`]); } catch { /* tidiness only */ }
}

// Start from the override if this machine already has one, so re-binding one provider does not
// unbind the other.
let raw = readFileSync(existsSync(OVERRIDE) ? OVERRIDE : WORKFLOW, 'utf8');
let changed = false;
let failed = false;

for (const { type, label, role } of CRED_TYPES) {
  const found = creds.filter((c) => c.type === type);

  if (!found.length) {
    console.error(`No credential of type "${type}" exists in n8n (${CONTAINER}) — ${role}.`);
    console.error('');
    console.error('Add it first — this is the one step no script can do, because the key is');
    console.error('deliberately not stored anywhere in this repo (ADR 0004):');
    console.error('');
    console.error('  1. open  http://localhost:5678');
    console.error(`  2. Credentials -> Add credential -> "${label}"`);
    console.error('  3. paste the key, Save');
    console.error('  4. run this command again');
    console.error('');
    console.error(`Credentials currently present: ${creds.map((c) => `${c.name} (${c.type})`).join(', ') || 'none'}`);
    failed = true;
    continue;
  }

  if (found.length > 1) {
    console.error(`More than one "${type}" credential exists; refusing to guess which one WF0 should use:`);
    for (const c of found) console.error(`  - ${c.name}  (id ${c.id})`);
    console.error('Delete the ones you do not want in the n8n UI, then run this again.');
    failed = true;
    continue;
  }

  const { id, name } = found[0];
  const wf = JSON.parse(raw);
  const node = wf.nodes.find((n) => n.credentials?.[type]);
  if (!node) {
    console.error(`${WORKFLOW}: no node holds a ${type} credential.`);
    failed = true;
    continue;
  }

  const current = node.credentials[type];
  if (current.id === id && current.name === name) {
    console.log(`up to date  ${type.padEnd(14)} "${name}" (id ${id})  — ${role}`);
    continue;
  }

  // Rewrite by text, not by re-serialising: the file is hand-formatted and JSON.stringify
  // would reflow it, burying a one-field change in a whole-file diff.
  const updated = raw
    .replace(new RegExp(`("${type}"\\s*:\\s*\\{\\s*"id"\\s*:\\s*)"[^"]*"`), `$1"${id}"`)
    .replace(new RegExp(`("${type}"\\s*:\\s*\\{[^}]*"name"\\s*:\\s*)"[^"]*"`), `$1${JSON.stringify(name)}`);

  if (updated === raw) {
    console.error(`${WORKFLOW}: could not rewrite the ${type} reference. Edit it by hand:`);
    console.error(`  "${type}": { "id": "${id}", "name": ${JSON.stringify(name)} }`);
    failed = true;
    continue;
  }

  raw = updated;
  changed = true;
  console.log(`bound       ${type.padEnd(14)} ${current.id} -> ${id}   ("${name}")  — ${role}`);
}

if (changed) {
  mkdirSync(LOCAL_DIR, { recursive: true });
  writeFileSync(OVERRIDE, raw);
}
if (failed) process.exit(1);
if (!changed) process.exit(0);

console.log('');
console.log(`Written to ${OVERRIDE} — gitignored, and per-machine.`);
console.log('The committed WF0 keeps its placeholder, so nothing in this repository is a handle');
console.log("into your n8n. `import-workflows.mjs` prefers this file when it exists.");
console.log('');
console.log('Now import it so n8n runs what the file says:');
console.log('  .\\run.cmd n8n/scripts/import-workflows.mjs');
console.log(`  docker restart ${CONTAINER}`);
