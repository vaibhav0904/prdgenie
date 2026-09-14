// The prompt in the repository is the prompt in the shipped workflow.
//
// `sync-prompts.mjs` writes each prompt into its workflow node and stamps it with
// `PROMPT_VERSION` — the first 12 hex of a sha256 over the markdown file. That stamp is the
// only thing tying the file a person edits to the text a model receives, and **nothing checked
// it from outside the generator.**
//
// BUG-053: `negative-control-clause.mjs` deliberately swaps an older prompt in, re-syncs,
// re-imports WF2, measures, and swaps back. When two sweeps overlapped, the swap-back lost
// (BUG-054) and the repository and the running n8n were left carrying a prompt nobody chose.
// The only thing that noticed was `verify-prompt-hygiene` failing for what looked like its own
// reason — a wrong story about the wrong file.
//
// This is the check that would have said it plainly.
//
// WHAT IT COMPARES: every `n8n/prompts/*.md` against the `PROMPT_VERSION` stamps in
// `n8n/workflows/*.json`. Both sides are DERIVED — the prompt list from the directory, the
// stamps from the shipped JSON — so a tenth prompt is covered the day it is written, and a
// stamp with no prompt behind it is just as loud as a prompt with no stamp.
//
// WHAT IT CANNOT SEE: whether n8n has been re-imported since. The repository and the export
// agreeing is one guarantee; the running container matching them is a deploy step, and
// `import-workflows.mjs` reports on that. This check says so rather than implying it covers
// both.
//
// Usage:  .\run.cmd n8n/scripts/check-deployed-prompts.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

// Both directories are arguments so the negative control can point THIS FILE at mutated
// copies rather than reimplementing it. A control that re-derives the check it is controlling
// proves only that two pieces of code agree (BUG-041).
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const PROMPT_DIR = arg('prompts', 'n8n/prompts');
const WORKFLOW_DIR = arg('workflows', 'n8n/workflows');

// The same computation sync-prompts.mjs performs, on the same bytes. Not a reimplementation of
// its logic — a reimplementation of its ONE line, which is what makes the comparison possible
// at all (there is nowhere else the hash is written down).
const versionOf = (md) => createHash('sha256').update(md).digest('hex').slice(0, 12);

const prompts = readdirSync(PROMPT_DIR).filter((f) => f.endsWith('.md')).sort()
  .map((f) => ({ file: `${PROMPT_DIR}/${f}`, name: f.replace(/\.md$/, '') }))
  .map((p) => ({ ...p, version: versionOf(readFileSync(p.file, 'utf8')) }));

// Every stamp in every shipped workflow, with the file and node it sits in.
const STAMP = /PROMPT_VERSION\s*=\s*'([a-f0-9]{12})'/g;
const stamps = [];
for (const file of readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.json')).sort()) {
  const wf = JSON.parse(readFileSync(`${WORKFLOW_DIR}/${file}`, 'utf8'));
  for (const node of wf.nodes) {
    const code = String(node.parameters?.jsCode ?? '');
    for (const m of code.matchAll(STAMP)) {
      stamps.push({ workflow: file, node: node.name, version: m[1] });
    }
  }
}

const stampFor = new Map();
for (const s of stamps) {
  if (!stampFor.has(s.version)) stampFor.set(s.version, []);
  stampFor.get(s.version).push(s);
}

const drifted = prompts.filter((p) => !stampFor.has(p.version));
const orphans = stamps.filter((s) => !prompts.some((p) => p.version === s.version));

for (const p of prompts) {
  const where = stampFor.get(p.version) ?? [];
  console.log(`  ${where.length ? ' ok ' : 'DRIFT'}  ${p.version}  ${p.name.padEnd(26)}`
    + `${where.map((w) => `${w.workflow.replace('.json', '')}:${w.node}`).join(', ') || 'NOT IN ANY WORKFLOW'}`);
}
console.log('');

let failed = false;

// AN ABANDONED SWAP, caught even when the hashes happen to line up (BUG-053).
//
// A control that deploys drops a crumb before its first mutation and sweeps it up in its
// `finally`. A crumb still lying here means a run was KILLED between those two points — and
// the tree can look perfectly consistent at that moment, because the swap replaces the prompt
// and re-stamps the workflow together. The hashes agreeing is exactly what a half-finished
// swap looks like from the outside.
//
// `dirname`, not a regex on the string: the first version stripped a trailing `/workflows`,
// which is a path shape this platform does not produce — `join()` hands back backslashes, the
// pattern missed, and the crumb was looked for somewhere it could never be. TC5 caught that on
// its first run, which is the argument for writing the control at the same time as the check.
const CRUMB = join(dirname(WORKFLOW_DIR), '.deploy-in-progress.json');
if (existsSync(CRUMB)) {
  failed = true;
  let held = {};
  try { held = JSON.parse(readFileSync(CRUMB, 'utf8')); } catch { /* unreadable crumb is still a crumb */ }
  console.error(`FAIL  a deployment is unfinished: ${held.script ?? 'an unnamed script'} started ${held.started_at ?? 'at an unrecorded time'}`);
  console.error(`      it was holding: ${(held.files ?? ['unknown']).join(', ')}`);
  console.error('');
  console.error('The prompt in the workflow may be one nobody chose. Restore those files from');
  console.error('git, re-run sync-prompts.mjs and import-workflows.mjs, then delete:');
  console.error(`  ${CRUMB}`);
  console.error('The hashes below may agree and still be wrong — a swap rewrites both sides.');
}

// Coverage asserted, not assumed (BUG-003/019). No prompts, or no stamps, means the reader
// broke — not that the project stopped using prompts.
if (prompts.length === 0 || stamps.length === 0) {
  console.error(`FAIL  read ${prompts.length} prompt(s) and ${stamps.length} stamp(s) — the extractor is broken.`);
  failed = true;
}

if (drifted.length) {
  failed = true;
  console.error(`FAIL  ${drifted.length} prompt(s) are not the version shipped in any workflow:`);
  for (const p of drifted) console.error(`  ${p.file}  (${p.version})`);
  console.error('');
  console.error('Either the file was edited without a re-sync, or something swapped a prompt in');
  console.error('and did not put it back (BUG-053). Run:');
  console.error('  .\\run.cmd n8n/scripts/sync-prompts.mjs');
  console.error('but read the diff FIRST — syncing makes the mismatch disappear either way, and');
  console.error('only one of those two causes should be resolved by syncing.');
}

if (orphans.length) {
  failed = true;
  console.error(`FAIL  ${orphans.length} workflow node(s) ship a prompt version no file produces:`);
  for (const s of orphans) console.error(`  ${s.workflow} → ${s.node}  (${s.version})`);
}

if (!failed) {
  console.log(`PASS  ${prompts.length} prompts, ${stamps.length} stamps, every one matching.`);
  console.log('');
  console.log('This proves the repository and the EXPORT agree. Whether the running n8n has been');
  console.log('re-imported since is a deploy step, and import-workflows.mjs is what reports it.');
}

process.exitCode = failed ? 1 : 0;
