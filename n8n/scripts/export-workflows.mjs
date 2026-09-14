// Pulls every PRD Genie workflow out of the running n8n and writes it to `n8n/workflows/`,
// stripped of everything that must never leave this machine.
//
// The mirror of `import-workflows.mjs`, and the same CLI-inside-the-container route, so no
// N8N_API_KEY is needed and there is one less secret in play (ADR 0010).
//
// WHAT IT STRIPS, AND WHY EACH ONE:
//
//   credentials      an n8n credential reference carries the credential's ID and NAME. The
//                    secret itself stays in n8n's encrypted store (ADR 0004), so this is not a
//                    key leak — but a name like "OpenAI account (Vaibhav personal)" is still
//                    something a release has no reason to carry, and an ID is a handle into
//                    someone else's instance.
//   pinData          n8n pins the LAST RUN'S DATA to a node when you pin it in the editor.
//                    That is real source text from real documents, silently embedded in a JSON
//                    file that looks like configuration. This is the leak nobody looks for.
//   staticData       per-workflow runtime state; not ours and not reproducible.
//   shared / meta    instance-local ownership rows.
//
// It does NOT decide whether the result is safe — `check-export-hygiene.mjs` does, it runs
// itself before writing, and a hit means nothing is written at all. A tool that reports a
// problem after it has already written the file has not prevented anything.
//
// Usage:  .\run.cmd n8n\scripts\export-workflows.mjs [container-name]
//         .\run.cmd n8n\scripts\export-workflows.mjs --dry-run    (print, write nothing)

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { takeExclusive } from '../../exclusive.mjs';
import { scan, SECRET_PATTERNS, projectCredentialIds, PLACEHOLDER_PREFIX }
  from './check-export-hygiene.mjs';

// ONE MUTATOR AT A TIME (BUG-054). This overwrites every file in n8n/workflows — the same files
// `import-workflows.mjs` reads and every workflow checker reads. Running beside a sweep means a
// check reading a half-written file and reporting it as a defect.
takeExclusive('n8n/scripts/export-workflows.mjs', {
  files: ['n8n/workflows/*.json'],
});

const CONTAINER = process.argv.find((a) => !a.startsWith('--') && a !== process.argv[0]
  && a !== process.argv[1]) ?? process.env.N8N_CONTAINER ?? 'n8n-local';
const DRY = process.argv.includes('--dry-run');
const DIR = 'n8n/workflows';

const docker = (args) => execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// THE KEYS THAT NEVER LEAVE. Removed everywhere they appear, at any depth — a node inside a
// node inside a pinned branch is still a node.
const STRIP = new Set(['pinData', 'staticData', 'shared', 'meta', 'versionId']);

// CREDENTIALS ARE NORMALISED, NOT DELETED — and the difference is the whole story.
//
// The first version of this deleted the `credentials` block outright. That is the obvious
// reading of "strip credentials" and it breaks the product: n8n binds a node to a credential
// through that block, so a node without one has nowhere for `bind-provider-credential.mjs` to
// write the local id, and a stranger's import produces a workflow that can never call a provider.
//
// So the SHAPE stays and the IDENTITY goes: the type is kept (it says which kind of credential
// this node needs), the id becomes the placeholder the binding script replaces, and the name
// becomes a sentence telling a reader what to do rather than whose account it was.
//
// The exception is a credential this project provisions itself with a fixed id. That id is
// published on purpose, is the same on every machine, and is what makes a stranger's import
// work — `check-export-hygiene` derives the list from the provisioning scripts, and this reads
// the same list rather than keeping a second copy of it.
const mine = projectCredentialIds();

function normaliseCredentials(block) {
  const out = {};
  for (const [type, ref] of Object.entries(block ?? {})) {
    if (ref && typeof ref === 'object' && mine.has(ref.id)) { out[type] = ref; continue; }
    out[type] = {
      id: `${PLACEHOLDER_PREFIX}${type}`,
      name: `PRDGenie ${type} — bind with bind-provider-credential.mjs`,
    };
  }
  return out;
}

function strip(value) {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (STRIP.has(k)) continue;
      out[k] = k === 'credentials' ? normaliseCredentials(v) : strip(v);
    }
    return out;
  }
  return value;
}

// Which workflows are ours: the ids in the repository, not everything the instance holds.
// Exporting by "whatever is in there" is how another project's workflow ends up in a
// release.
const ours = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()
  .map((f) => ({ file: f, id: JSON.parse(readFileSync(join(DIR, f), 'utf8')).id }));

if (!ours.length) {
  console.error(`No workflow JSON in ${DIR} to export over.`);
  process.exit(1);
}

console.log(`Exporting ${ours.length} workflow(s) from ${CONTAINER}${DRY ? '  (dry run)' : ''}\n`);

const pending = [];
let failed = 0;

for (const { file, id } of ours) {
  let raw;
  try {
    raw = docker(['exec', CONTAINER, 'sh', '-c',
      `n8n export:workflow --id=${id} --pretty --output=/tmp/exp-${id}.json >/dev/null 2>&1 `
      + `&& cat /tmp/exp-${id}.json; rm -f /tmp/exp-${id}.json`]);
  } catch (err) {
    console.log(`FAIL  ${file}  could not export id=${id}: ${err.message.split('\n')[0]}`);
    failed += 1;
    continue;
  }
  let wf;
  try {
    const parsed = JSON.parse(raw);
    wf = Array.isArray(parsed) ? parsed[0] : parsed;
  } catch {
    console.log(`FAIL  ${file}  n8n returned something that is not JSON for id=${id}`);
    failed += 1;
    continue;
  }
  if (!wf || wf.id !== id) {
    console.log(`FAIL  ${file}  expected id=${id}, got id=${wf?.id ?? 'nothing'}`);
    failed += 1;
    continue;
  }

  const before = JSON.stringify(wf);
  const cleaned = strip(wf);
  const text = `${JSON.stringify(cleaned, null, 2)}\n`;
  const removed = STRIP.size && before.length - JSON.stringify(cleaned).length;
  pending.push({ file, path: join(DIR, file), text, removed });
  console.log(`  ok  ${file.padEnd(26)} id=${id}  ${removed} bytes of instance state removed`);
}

if (failed) {
  console.log('');
  console.log(`${failed} workflow(s) could not be exported. NOTHING was written — a partial`);
  console.log('export is a repository that no longer matches the runtime.');
  process.exit(1);
}

// --- THE GATE, BEFORE ANY FILE IS WRITTEN ------------------------------------------------------
//
// The same scanner the standing check uses, on the bytes about to be written rather than on the
// bytes already on disk. "Export, then check" leaves the secret in the working tree — and a
// working tree is one `git add -A` away from being permanent.
console.log('');
const hits = pending.flatMap((p) => scan(p.file, p.text));
if (hits.length) {
  console.log(`REFUSED: ${hits.length} secret-shaped value(s) in what was about to be written.\n`);
  for (const h of hits) console.log(`  ${h.file}:${h.line}  ${h.what}\n      ${h.excerpt}`);
  console.log('');
  console.log('Nothing was written. Move the value into an n8n credential (ADR 0004) or an');
  console.log('environment variable, re-import, and export again.');
  process.exit(1);
}
console.log(`clean: ${SECRET_PATTERNS.length} patterns and every .env value, 0 hits`);

if (DRY) {
  console.log('');
  console.log('--dry-run: nothing written.');
  process.exit(0);
}

let changed = 0;
for (const p of pending) {
  const before = readFileSync(p.path, 'utf8');
  if (before === p.text) continue;
  writeFileSync(p.path, p.text);
  changed += 1;
}
console.log('');
console.log(changed
  ? `${changed} of ${pending.length} file(s) changed. Review the diff before committing.`
  : `${pending.length} file(s) identical to the repository — n8n and the repo agree.`);
