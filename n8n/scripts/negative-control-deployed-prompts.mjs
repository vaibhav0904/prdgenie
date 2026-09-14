// The control for check-deployed-prompts: break the tie between file and export, both ways.
//
// The check exists because a control swapped a prompt into WF2 and did not put it back
// (BUG-053/054), and nothing said so. So this plants exactly that, and the mirror of it:
//
//   TC2  a prompt EDITED without a re-sync            -> the file drifts from the export
//   TC3  a stamp changed in the workflow              -> the export ships a version no file
//                                                        produces
//   TC4  a corpus with nothing in it                  -> refused, not reported clean
//
// Every case runs the SHIPPED checker against mutated copies. It does not recompute a hash of
// its own; if it did, the two implementations could agree about the same mistake.
//
// Usage:  .\run.cmd n8n/scripts/negative-control-deployed-prompts.mjs

import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CHECK = 'n8n/scripts/check-deployed-prompts.mjs';

function runCheck(dir) {
  const r = spawnSync(process.execPath,
    [CHECK, `--prompts=${join(dir, 'prompts')}`, `--workflows=${join(dir, 'workflows')}`],
    { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** A fresh copy of prompts and workflows, mutated by `edit`. */
function corpus(edit) {
  const dir = mkdtempSync(join(tmpdir(), 'deployed-prompts-'));
  cpSync('n8n/prompts', join(dir, 'prompts'), { recursive: true });
  cpSync('n8n/workflows', join(dir, 'workflows'), { recursive: true });
  edit({
    dir,
    promptFiles: () => readdirSync(join(dir, 'prompts')).filter((f) => f.endsWith('.md')).sort(),
    readPrompt: (f) => readFileSync(join(dir, 'prompts', f), 'utf8'),
    writePrompt: (f, s) => writeFileSync(join(dir, 'prompts', f), s),
    workflowFiles: () => readdirSync(join(dir, 'workflows')).filter((f) => f.endsWith('.json')).sort(),
    readWorkflow: (f) => readFileSync(join(dir, 'workflows', f), 'utf8'),
    writeWorkflow: (f, s) => writeFileSync(join(dir, 'workflows', f), s),
  });
  return dir;
}

const rows = [];
const check = (id, what, pass, detail) => {
  rows.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${what}${detail ? `\n           ${detail}` : ''}`);
};

const firstLine = (out) => out.trim().split('\n').filter((l) => l.startsWith('FAIL') || l.startsWith('PASS'))[0] ?? out.trim().split('\n')[0];

// --- TC1: the real tree is clean before anything is planted -----------------------------------
{
  const dir = corpus(() => {});
  const { code, out } = runCheck(dir);
  check('TC1', 'an untouched copy of prompts and workflows passes', code === 0, firstLine(out));
  rmSync(dir, { recursive: true, force: true });
}

// --- TC2: a prompt edited and not re-synced ---------------------------------------------------
// THE CASE THAT HAPPENED. One sentence changed in the markdown; the workflow still ships the
// text and the stamp from before.
{
  let target = null;
  const dir = corpus(({ promptFiles, readPrompt, writePrompt }) => {
    target = promptFiles()[0];
    writePrompt(target, `${readPrompt(target)}\n\nAn edit nobody synced.\n`);
  });
  const { code, out } = runCheck(dir);
  check('TC2', 'a prompt edited without a re-sync is caught, and named',
    code === 1 && out.includes('not the version shipped') && out.includes(target.replace('.md', '')),
    firstLine(out));
  rmSync(dir, { recursive: true, force: true });
}

// --- TC3: the export ships a version no file produces -----------------------------------------
// The mirror. A stamp that no prompt in the tree can produce means the workflow was written by
// something other than the current files — which is what an abandoned swap leaves behind.
{
  const dir = corpus(({ workflowFiles, readWorkflow, writeWorkflow }) => {
    for (const f of workflowFiles()) {
      const raw = readWorkflow(f);
      const m = /PROMPT_VERSION = '([a-f0-9]{12})'/.exec(raw);
      if (m) {
        writeWorkflow(f, raw.replace(m[0], "PROMPT_VERSION = 'deadbeef0000'"));
        return;
      }
    }
    throw new Error('no stamp found to corrupt');
  });
  const { code, out } = runCheck(dir);
  // Corrupting a stamp fires BOTH halves — the prompt no longer appears in any workflow, and
  // the workflow ships a version no file produces. The assertion names the second, because the
  // first would also fire for the innocent case TC2 covers.
  check('TC3', 'a stamp with no prompt behind it is caught, and names the node',
    code === 1 && out.includes('deadbeef0000') && out.includes('no file produces'),
    out.split('\n').filter((l) => l.includes('no file produces') || l.includes('deadbeef0000'))
      .join('\n           ').trim());
  rmSync(dir, { recursive: true, force: true });
}

// --- TC4: it cannot pass by finding nothing ----------------------------------------------------
{
  const dir = corpus(({ dir: d, promptFiles, workflowFiles, readWorkflow, writeWorkflow }) => {
    // Emptying the prompt directory alone is not the vacuous case — the check would still find
    // stamps and call every one an orphan, which is a different red for a different reason.
    // BOTH sides have to go quiet for the failure to be "the extractor found nothing".
    for (const f of promptFiles()) rmSync(join(d, 'prompts', f));
    for (const f of workflowFiles()) {
      const wf = JSON.parse(readWorkflow(f));
      for (const n of wf.nodes) if (n.parameters?.jsCode) n.parameters.jsCode = '// stripped';
      writeWorkflow(f, JSON.stringify(wf, null, 2));
    }
  });
  const { code, out } = runCheck(dir);
  check('TC4', 'an empty corpus FAILS instead of reporting a clean sweep of nothing',
    code === 1 && out.includes('extractor is broken'), firstLine(out));
  rmSync(dir, { recursive: true, force: true });
}

// --- TC5: an abandoned deployment, with everything else consistent -----------------------------
//
// THE CASE THE HASHES CANNOT SEE. A swap rewrites the prompt and re-stamps the workflow
// together, so a run killed between those two points leaves a tree that looks perfectly
// consistent — and is running a prompt nobody chose. The crumb is the only witness, so this
// plants one and requires the check to go red **while every hash still matches**.
{
  const dir = corpus(({ dir: d }) => {
    writeFileSync(join(d, '.deploy-in-progress.json'), JSON.stringify({
      script: 'evals/harness/negative-control-clause.mjs',
      started_at: '2026-09-04T12:00:00.000Z',
      files: ['n8n/prompts/extract-requirements.md', 'n8n/workflows/WF2-generate-prd.json'],
    }));
  });
  const { code, out } = runCheck(dir);
  check('TC5', 'an unfinished deployment fails the check even though every hash matches',
    code === 1 && out.includes('deployment is unfinished') && out.includes('negative-control-clause'),
    out.split('\n').filter((l) => l.includes('unfinished') || l.includes('holding')).join('\n           ').trim());
  rmSync(dir, { recursive: true, force: true });
}

const failed = rows.filter((r) => !r.pass).length;
console.log('');
console.log(`${rows.length - failed}/${rows.length} controls behaved as required.`);
if (failed) {
  console.log('');
  console.log('A control that does not go red is not a control. Treat check-deployed-prompts');
  console.log('as unproven until this passes.');
}
process.exitCode = failed ? 1 : 0;
