// Every door the shipped workflows declare is registered in the running n8n. For free.
//
// BUG-058: `verify-doors` and `verify-routing` went red in a sweep minutes after both were
// green, with n8n reporting the workflow **active**, the container up four hours, and nothing
// deployed in between. A `docker restart` fixed it. That is the third time a door has been shut
// while everything about it looked fine (BUG-005, BUG-043 — a PM's form door closed for two
// days behind an HTTP 200).
//
// `verify-doors` finds it, at the price of a document through the real door: a run in n8n, a row
// in the database, and a place in a sweep that takes minutes. **A detector that is not free will
// not be run before every command**, and the whole value here is knowing immediately.
//
// HOW IT COSTS NOTHING. A GET on a POST-only webhook is answered by n8n itself, before any
// workflow starts:
//
//   registered      "... is not registered for GET requests"      <- the path is known
//   not registered  "... is not registered"                       <- the path is gone
//
// Two different 404s, and the difference between them is the whole check. Nothing executes,
// nothing is stored, and it is the same distinction `negative-control-clause.mjs` has been using
// in `waitForDoors()` since E2 — lifted out of it so everything can use it.
//
// A FORM door is different and is checked differently: `GET /form/<webhookId>` renders the form,
// so a registered one answers 200 and an absent one answers 404. It is included because it is the
// door a PERSON uses, and it is the one BUG-043 found shut.
//
// THE LIST IS DERIVED (BUG-003/019). Every `webhook` and `formTrigger` node in every shipped
// workflow export is a door; a workflow that grows one tomorrow is checked tomorrow. Zero doors
// found is a broken extractor, not a clean bill of health, and it fails.
//
// Usage:  .\run.cmd n8n\scripts\check-doors-registered.mjs

import { readdirSync, readFileSync } from 'node:fs';

const WORKFLOW_DIR = 'n8n/workflows';
const N8N = new URL(process.env.N8N_INGEST_WEBHOOK_URL ?? 'http://localhost:5678/webhook/ingest').origin;

/** Every door the exports declare: {kind, name, file, url}. */
export function doorsFromWorkflows(dir = WORKFLOW_DIR, origin = N8N) {
  const doors = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const wf = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'));
    for (const node of wf.nodes ?? []) {
      const type = String(node.type ?? '');
      if (type.endsWith('.webhook') && node.parameters?.path) {
        doors.push({
          kind: 'webhook', file, name: node.name,
          url: `${origin}/webhook/${node.parameters.path}`,
        });
      } else if (type.endsWith('.formTrigger') && node.webhookId) {
        doors.push({
          kind: 'form', file, name: node.name,
          url: `${origin}/form/${node.webhookId}`,
        });
      }
    }
  }
  return doors;
}

/** `registered` | `MISSING` | a description. Never starts anything. */
export async function probeDoor(door, ms = 5000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(door.url, { method: 'GET', signal: ac.signal });
    const body = await res.text();
    if (door.kind === 'form') {
      return res.status === 404 ? 'MISSING' : (res.ok ? 'registered' : `answered ${res.status}`);
    }
    // The order matters: the specific message is a superset of the general one.
    if (/not registered for GET requests/i.test(body)) return 'registered';
    if (/not registered/i.test(body)) return 'MISSING';
    // Anything else means n8n knew the path well enough to do something with it.
    return 'registered';
  } catch (err) {
    return `unreachable (${err.message})`;
  } finally {
    clearTimeout(timer);
  }
}

// Run as a script; importable as a library so `preflight.mjs` and `check-all.mjs` ask the same
// question the same way rather than each growing a copy of it.
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
  || process.argv[1]?.endsWith('check-doors-registered.mjs')) {
  const doors = doorsFromWorkflows();
  const results = [];
  for (const d of doors) results.push({ ...d, state: await probeDoor(d) });

  for (const r of results) {
    const mark = r.state === 'registered' ? ' ok ' : r.state === 'MISSING' ? 'GONE' : 'DOWN';
    console.log(`  ${mark}  ${r.kind.padEnd(7)} ${r.url.padEnd(46)} ${r.file.replace('.json', '')}:${r.name}`);
  }
  console.log('');

  let failed = false;
  if (!doors.length) {
    console.error('FAIL  no doors found in the workflow exports — the extractor is broken,');
    console.error('      not the doors. Zero doors is never a clean bill of health.');
    failed = true;
  }

  const missing = results.filter((r) => r.state === 'MISSING');
  const down = results.filter((r) => r.state.startsWith('unreachable'));

  if (down.length) {
    failed = true;
    console.error(`FAIL  n8n did not answer at ${N8N} — ${down[0].state}`);
    console.error('      docker start n8n-local');
  } else if (missing.length) {
    failed = true;
    console.error(`FAIL  ${missing.length} door(s) the workflows declare are NOT registered:`);
    for (const m of missing) console.error(`  ${m.url}   ${m.file.replace('.json', '')}:${m.name}`);
    console.error('');
    console.error('n8n may still report the workflow ACTIVE — it did in BUG-058, with the');
    console.error('container up four hours and nothing deployed. Registration and activation');
    console.error('are different facts, and this one is the one a caller meets.');
    console.error('');
    console.error('  .\\run.cmd n8n/scripts/import-workflows.mjs   then   docker restart n8n-local');
  } else if (!failed) {
    console.log(`PASS  ${results.length} of ${results.length} declared doors are registered`
      + ` (${results.filter((r) => r.kind === 'form').length} form, `
      + `${results.filter((r) => r.kind === 'webhook').length} webhook).`);
    console.log('      A GET, so nothing ran and nothing was stored. What this does NOT assert');
    console.log('      is that a door WORKS — that is verify-doors, and it costs a real document.');
  }

  process.exitCode = failed ? 1 : 0;
}
