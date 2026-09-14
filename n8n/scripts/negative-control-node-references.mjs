// The control for check-node-references: break a name on purpose and watch it fail.
//
// A green check proves nothing until it has been shown going red for the reason it claims to
// watch for. This one has three ways to be wrong, and each gets its own planted defect:
//
//   TC2  a direct `$('Name')` reference to a renamed node
//   TC3  an INDIRECT one, reached through the `at(...)` / `ran(...)` helper — the case the
//        checker only sees because it follows one step of indirection, and the case where a
//        wrong name is silent at runtime because the helper catches the throw
//   TC4  a connection pointing at a node that does not exist — an edge n8n drops without
//        saying so
//
// Every case runs the SHIPPED checker against a mutated copy of the workflows. It does not
// reimplement the rule; a control that re-derives what it controls proves only that two pieces
// of code agree.
//
// Usage:  .\run.cmd n8n/scripts/negative-control-node-references.mjs

import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CHECK = 'n8n/scripts/check-node-references.mjs';

/** Run the shipped checker over a directory of workflows. */
function runCheck(dir) {
  const r = spawnSync(process.execPath, [CHECK, `--dir=${dir}`], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** A fresh copy of the real workflows, mutated by `edit(file → json)`. */
function corpus(edit) {
  const dir = mkdtempSync(join(tmpdir(), 'node-refs-'));
  cpSync('n8n/workflows', dir, { recursive: true });
  edit({
    read: (f) => JSON.parse(readFileSync(join(dir, f), 'utf8')),
    write: (f, wf) => writeFileSync(join(dir, f), JSON.stringify(wf, null, 2)),
    files: () => readdirSync(dir).filter((f) => f.endsWith('.json')).sort(),
  });
  return dir;
}

const rows = [];
const check = (id, what, pass, detail) => {
  rows.push({ id, what, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${what}${detail ? `\n           ${detail}` : ''}`);
};

// --- TC1: the corpus is clean before anything is planted -------------------------------------
// Without this, every red row below could be red for a reason that was already there.
{
  const dir = corpus(() => {});
  const { code, out } = runCheck(dir);
  check('TC1', 'an untouched copy of the workflows passes', code === 0,
    code === 0 ? out.trim().split('\n')[0] : out.trim());
  rmSync(dir, { recursive: true, force: true });
}

// --- TC2: a direct reference to a renamed node -----------------------------------------------
{
  const dir = corpus(({ read, write }) => {
    const wf = read('WF3-delta.json');
    // The node WF3's apply body reads for the base version id, renamed as an editor would.
    const node = wf.nodes.find((n) => n.name === 'Fetch the approved version');
    node.name = 'Fetch the approved version (v2)';
    write('WF3-delta.json', wf);
  });
  const { code, out } = runCheck(dir);
  check('TC2', 'a renamed node breaks the direct $(...) references that name it',
    code === 1 && out.includes("$('Fetch the approved version')"),
    out.trim().split('\n').slice(0, 3).join('\n           '));
  rmSync(dir, { recursive: true, force: true });
}

// --- TC3: a reference reached through the forwarding helper ----------------------------------
// THE CASE THAT MATTERS. `at('WF0: extract')` is wrapped in try/catch, so a wrong name here
// does not crash — it returns null and the surrounding code carries on with a wrong answer.
{
  const dir = corpus(({ read, write }) => {
    const wf = read('WF2-generate-prd.json');
    const node = wf.nodes.find((n) => n.name === 'WF0: extract');
    node.name = 'WF0: extract requirements';
    // Repair the direct references and the connections, so the ONLY thing left broken is the
    // indirect one. Vary one thing (BUG-011).
    for (const n of wf.nodes) {
      const p = JSON.stringify(n.parameters);
      if (p.includes("$('WF0: extract')")) {
        n.parameters = JSON.parse(p.split("$('WF0: extract')").join("$('WF0: extract requirements')"));
      }
    }
    const conns = JSON.parse(JSON.stringify(wf.connections).split('"WF0: extract"').join('"WF0: extract requirements"'));
    wf.connections = conns;
    write('WF2-generate-prd.json', wf);
  });
  const { code, out } = runCheck(dir);
  check('TC3', 'a renamed node breaks an INDIRECT reference the helper would have swallowed',
    code === 1 && out.includes('via at()') && out.includes("$('WF0: extract')"),
    out.trim().split('\n').slice(0, 3).join('\n           '));
  rmSync(dir, { recursive: true, force: true });
}

// --- TC4: a connection to a node that does not exist -----------------------------------------
{
  const dir = corpus(({ read, write }) => {
    const wf = read('WF3-delta.json');
    wf.connections.Entry.main[0][0].node = 'Fetch documents';  // one letter, a dropped edge
    write('WF3-delta.json', wf);
  });
  const { code, out } = runCheck(dir);
  check('TC4', 'a connection naming a node that does not exist is caught',
    code === 1 && out.includes('Fetch documents'),
    out.trim().split('\n').slice(0, 3).join('\n           '));
  rmSync(dir, { recursive: true, force: true });
}

// --- TC5: the extractor cannot pass by finding nothing ----------------------------------------
// A check that greps can always be made green by breaking its own pattern. This plants a
// corpus with no references at all and asserts the check refuses it rather than reporting a
// clean sweep of nothing (BUG-003/019).
{
  const dir = corpus(({ read, write, files }) => {
    // The list is READ, not typed. A typed list is a hand-counted denominator (BUG-003), and
    // it also drags workflow names into a file that has no business knowing them —
    // `verify-judge-isolation` said so the first time this ran.
    for (const f of files()) {
      const wf = read(f);
      for (const n of wf.nodes) n.parameters = {};
      wf.connections = {};
      write(f, wf);
    }
  });
  const { code, out } = runCheck(dir);
  check('TC5', 'a corpus with zero references FAILS instead of passing empty',
    code === 1 && out.includes('extractor is broken'),
    out.trim().split('\n')[0]);
  rmSync(dir, { recursive: true, force: true });
}

const failed = rows.filter((r) => !r.pass).length;
console.log('');
console.log(`${rows.length - failed}/${rows.length} controls behaved as required.`);
if (failed) {
  console.log('');
  console.log('A control that does not go red is not a control. The check it guards should be');
  console.log('treated as unproven until this passes.');
}
process.exitCode = failed ? 1 : 0;
