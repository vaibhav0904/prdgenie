// Every `$('Node')` in a workflow names a node that exists in that workflow.
//
// n8n addresses nodes by their DISPLAY NAME, as a string, inside code and expressions. Rename
// a node in the editor and n8n rewrites the references it can see; rename it in the JSON —
// which is how this project edits workflows — and nothing rewrites anything. The reference
// still parses. It fails at runtime, or worse, it fails INTO a fallback.
//
// E6-S2 built exactly that trap. WF3's park node asks three questions in order — did the
// writer answer, did WF0 answer, was there an approved version at all — and it asks them by
// catching the throw from a node that did not run:
//
//     const ran = (node) => { try { return $(node).first().json; } catch { return null; } };
//
// A typo'd or renamed name there does not crash the run. It returns `null`, the park falls
// through to the next branch, and a document that was refused for `delta_empty` is filed under
// `llm_error` instead. The reason recorded would be wrong, and everything downstream — the
// needs-attention queue, the reason mix on the metrics page — would be quietly wrong with it.
//
// A `catch` that turns a broken reference into a wrong answer is why this check exists rather
// than trusting the workflow to fail loudly.
//
// WHAT IT SCANS: every string anywhere in a workflow's `nodes`, because a node reference is
// just as legal in an `={{ }}` expression on an HTTP node's body as in a Code node's `jsCode`.
// Sticky-note prose is scanned too — a note quoting a name that no longer exists is
// documentation that has already drifted.
//
// WHAT IT CANNOT SEE: `$(someVariable)`. A reference built at runtime is not a string this can
// read, and it reports how many it skipped rather than counting them as clean.
//
// Usage:  .\run.cmd n8n/scripts/check-node-references.mjs
//         .\run.cmd n8n/scripts/check-node-references.mjs --list

import { readFileSync, readdirSync } from 'node:fs';

// The directory is an argument so the negative control can point THIS FILE at a mutated copy
// rather than reimplementing it. A control that re-derives the check it is controlling proves
// only that two pieces of code agree (BUG-041).
const WORKFLOW_DIR = process.argv.find((a) => a.startsWith('--dir='))?.slice(6) ?? 'n8n/workflows';

// `$( ' Name ' )` or `$("Name")`, tolerating whitespace the way the expression parser does.
const STATIC_REF = /\$\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/g;
// A reference whose argument is not a literal — recorded, never counted as verified.
const DYNAMIC_REF = /\$\(\s*(?!['"])[^)]*\)/g;

// ONE STEP OF INDIRECTION, FOLLOWED.
//
// Both WF2 and WF3 wrap the reference in a one-line helper, because a node that did not run
// throws and the surrounding code wants `null`:
//
//     const at = (name) => { try { return $(name).first().json; } catch { return null; } };
//     at('WF0: extract')
//
// The name is still a literal. It has moved one call along, and a checker that stopped at
// `$(name)` would report six of WF2's eight references as unverifiable and pass — which is the
// blind spot exactly where the `catch` makes a wrong name silent. So the check follows the
// helper instead of asking the workflow to contort into a shape it can read.
const HELPER_DECL = /(?:const|let|var)\s+(\w+)\s*=\s*\(\s*(\w+)\s*\)\s*=>/g;

/** Helpers in one script that forward their single argument straight to `$()`. */
function forwardingHelpers(text) {
  const found = new Map();
  for (const [, name, param] of text.matchAll(HELPER_DECL)) {
    if (text.includes(`$(${param})`)) found.set(name, param);
  }
  return found;
}

/** Every string in a value, with a path saying where it came from. */
function* strings(value, path = '') {
  if (typeof value === 'string') { yield { path, text: value }; return; }
  if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) yield* strings(v, `${path}[${i}]`);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) yield* strings(v, path ? `${path}.${k}` : k);
  }
}

const files = readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.json')).sort();

const problems = [];
const dynamic = [];
let scanned = 0;
let references = 0;
const perFile = [];

for (const file of files) {
  const wf = JSON.parse(readFileSync(`${WORKFLOW_DIR}/${file}`, 'utf8'));
  const names = new Set(wf.nodes.map((n) => n.name));
  scanned += 1;
  let here = 0;

  for (const node of wf.nodes) {
    for (const { path, text } of strings(node.parameters ?? {}, `${node.name}.parameters`)) {
      for (const m of text.matchAll(STATIC_REF)) {
        here += 1;
        references += 1;
        const target = m[2].replace(/\\(.)/g, '$1');
        if (!names.has(target)) problems.push({ file, where: path, target });
      }
      const helpers = forwardingHelpers(text);
      for (const [helper, param] of helpers) {
        const call = new RegExp(`\\b${helper}\\(\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1\\s*\\)`, 'g');
        for (const m of text.matchAll(call)) {
          here += 1;
          references += 1;
          const target = m[2].replace(/\\(.)/g, '$1');
          if (!names.has(target)) problems.push({ file, where: `${path} via ${helper}()`, target });
        }
        void param;
      }

      // What is left is genuinely unreadable: a name assembled at runtime. The forwarding
      // helpers' own `$(param)` is not one of those — it was resolved above.
      const forwarded = new Set([...helpers.values()].map((p) => `$(${p})`));
      for (const m of text.matchAll(DYNAMIC_REF)) {
        if (forwarded.has(m[0])) continue;
        dynamic.push({ file, where: path, text: m[0] });
      }
    }
  }

  // Connections address nodes by name too, and a connection to a node that does not exist is
  // an edge n8n silently drops — the same defect in a different field.
  for (const [from, outputs] of Object.entries(wf.connections ?? {})) {
    if (!names.has(from)) problems.push({ file, where: 'connections', target: from });
    for (const output of Object.values(outputs)) {
      for (const branch of output ?? []) {
        for (const link of branch ?? []) {
          here += 1;
          references += 1;
          if (!names.has(link.node)) {
            problems.push({ file, where: `connections.${from}`, target: link.node });
          }
        }
      }
    }
  }

  perFile.push({ file, nodes: wf.nodes.length, refs: here });
}

if (process.argv.includes('--list')) {
  for (const f of perFile) {
    console.log(`  ${f.file.padEnd(28)} ${String(f.nodes).padStart(3)} nodes  ${String(f.refs).padStart(3)} references`);
  }
}

// Coverage asserted, not assumed (BUG-003/019). A workflow set that parsed but yielded no
// reference at all means the extractor stopped matching, not that the workflows got simpler.
let failed = false;
if (scanned === 0) {
  console.error('FAIL  no workflow files were scanned — the check ran on nothing.');
  failed = true;
} else if (scanned !== files.length) {
  console.error(`FAIL  scanned ${scanned} of ${files.length} workflow files.`);
  failed = true;
} else if (references === 0) {
  console.error(`FAIL  0 node references found across ${scanned} workflows — the extractor is broken.`);
  failed = true;
}

if (problems.length) {
  failed = true;
  console.error(`FAIL  ${problems.length} reference(s) to a node that does not exist:`);
  for (const p of problems) console.error(`  ${p.file}  ${p.where}  ->  $('${p.target}')`);
  console.error('');
  console.error('n8n addresses nodes by display name. A name that no longer exists does not');
  console.error('crash a `try`/`catch` — it returns the fallback, and the run records the');
  console.error('wrong answer confidently.');
} else if (!failed) {
  console.log(`PASS  ${references} node references across ${scanned} workflows, every one resolves.`);
  if (dynamic.length) {
    console.log('');
    console.log(`      ${dynamic.length} reference(s) built at runtime, which this cannot verify:`);
    for (const d of dynamic) console.log(`        ${d.file}  ${d.where}  ${d.text}`);
  } else {
    console.log('      No reference is built at runtime, so every one of them was checked.');
  }
}

process.exitCode = failed ? 1 : 0;
