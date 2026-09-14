// Every internal endpoint a workflow dials exists on the service that is actually running.
//
// E6-S2 shipped `POST /internal/apply-delta`, wired WF3 to it, and watched the first real
// follow-up document die at:
//
//     Apply the delta (code writes the version) — The resource you are requesting could not
//     be found
//
// The route was in `server.js`. It was not in the **process**, which had been up since before
// the route was written. Every check stayed green because every check imports the module
// directly — `verify-apply-delta` calls `applyDelta()` in-process and never knocks on the door
// the workflow knocks on.
//
// *A door never opened is not a door* (BUG-005/006/018/028). This opens each of them.
//
// WHAT IT ASSERTS, and deliberately no more: that the URL resolves to a route, using the METHOD
// the workflow uses — a POST probe at a GET route 404s and would report a stale service that is
// perfectly current. It sends no credential, so a guarded route answers **401** and does
// nothing. Anything but 404 means the endpoint is there; 404 is the stale-deployment signature,
// and it is the only thing this file is looking for.
//
// HOW IT STAYS HARMLESS. Knocking on an unguarded write endpoint is not a check, it is a write:
// the first version of this file POSTed to every path it found and **wrote a weekly report**.
// So the guard is now asserted BEFORE the knock, by reading `server.js`: an `/internal/` route
// that does not consult `internalAuthorized` is reported and never called. That failure is
// worth more than the reachability it replaces — an unauthenticated internal endpoint is the
// bug, and refusing to probe it is how this file avoids being the exploit.
//
// Usage:  .\run.cmd n8n/scripts/check-internal-endpoints.mjs

import { readFileSync, readdirSync } from 'node:fs';

const WORKFLOW_DIR = 'n8n/workflows';
// The workflows dial the service from inside Docker; this check dials it from the host. Same
// service, two names for the same door.
const SERVICE = (process.env.SERVICE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

// `http://host.docker.internal:3000/internal/<path>`, as it appears in a node's `url`.
const INTERNAL = /https?:\/\/[^/"'\s]+\/(internal\/[A-Za-z0-9/_-]+)/g;

const found = new Map();  // path -> {methods:Set, callers:[{file,node}]}
for (const file of readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.json')).sort()) {
  const wf = JSON.parse(readFileSync(`${WORKFLOW_DIR}/${file}`, 'utf8'));
  for (const node of wf.nodes) {
    const url = String(node.parameters?.url ?? '');
    for (const m of url.matchAll(INTERNAL)) {
      const path = m[1].replace(/\/$/, '');
      if (!found.has(path)) found.set(path, { methods: new Set(), callers: [] });
      // n8n's HTTP node omits `method` when it is GET — the default is part of the call.
      found.get(path).methods.add(String(node.parameters?.method ?? 'GET').toUpperCase());
      // BOTH HALVES OF THE HANDSHAKE (BUG-051). Guarding the route is one half; the caller
      // actually sending the key is the other, and a guard added to a route whose caller sends
      // nothing turns a working workflow into a 401 at the next deploy. Read from the shipped
      // node rather than assumed from the fact that it used to work.
      found.get(path).callers.push({
        file,
        node: node.name,
        sendsKey: Boolean(node.credentials?.httpHeaderAuth),
      });
    }
  }
}

// The guard, read from the file that serves the route. A handler runs from its own `route(...)`
// call to the NEXT `route(...)` **of any kind** — and that "of any kind" is a fix its own
// control forced.
//
// The first version ended each span at the next *internal* route. So an unguarded endpoint
// declared next to an `/api/` one had its span run on through several other handlers until it
// found somebody else's `internalAuthorized`, and was pronounced guarded. **A guard check with a
// false negative is worse than no guard check**: it is a false negative that reads as an audit.
// TC7 planted exactly that route and the check called it fine.
const server = readFileSync('review-ui/server.js', 'utf8');
const ANY_ROUTE = /route\('(?:GET|POST|PUT|PATCH|DELETE)',\s*'[^']*'/g;
const everyRoute = [...server.matchAll(ANY_ROUTE)].map((m) => m.index);
const declared = [...server.matchAll(/route\('(GET|POST|PUT|PATCH|DELETE)',\s*'\/(internal\/[^']*)'/g)]
  .map((m) => ({ method: m[1], path: m[2].replace(/\/$/, ''), at: m.index }));
const guarded = new Set();
for (const r of declared) {
  const end = everyRoute.find((i) => i > r.at) ?? server.length;
  if (server.slice(r.at, end).includes('internalAuthorized')) guarded.add(`${r.method} /${r.path}`);
}

// EVERY DECLARED ROUTE, not only the ones a workflow dials today (BUG-051).
//
// The first version checked what the workflows call. That leaves an endpoint nothing calls yet
// entirely unexamined — and an endpoint nobody looks at is the one that gets wired next month
// without anybody re-reading it. Both routes this card fixed were called; the point is the one
// that will not be.
//
// A declared route with no caller is still probed (a guarded route answers 401 and does
// nothing) and still has to be guarded. What it is NOT asked for is reachability from a
// workflow, because no workflow claims to reach it.
const targets = new Map();  // "METHOD /path" -> {path, method, callers}
for (const [path, entry] of found) {
  for (const method of entry.methods) {
    targets.set(`${method} /${path}`, { path, method, callers: entry.callers });
  }
}
for (const d of declared) {
  const key = `${d.method} /${d.path}`;
  if (!targets.has(key)) targets.set(key, { path: d.path, method: d.method, callers: [] });
}

const paths = [...found.keys()].sort();
const results = [];
{
  for (const { path, method, callers } of [...targets.values()]
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))) {
    const entry = { callers };
    // A route declared but unguarded is never knocked on: the knock would BE the side effect.
    const isDeclared = declared.some((d) => d.method === method && d.path === path);
    if (isDeclared && !guarded.has(`${method} /${path}`)) {
      results.push({ path, method, status: null, err: null, unguarded: true, callers: entry.callers });
      continue;
    }
    let status = null;
    let err = null;
    try {
      const res = await fetch(`${SERVICE}/${path}`, {
        method,
        ...(method === 'GET' ? {} : { headers: { 'content-type': 'application/json' }, body: '{}' }),
      });
      status = res.status;
    } catch (e) {
      err = e.message;
    }
    results.push({ path, method, status, err, unguarded: false, callers: entry.callers });
  }
}

// A caller that dials a guarded route without the credential gets a 401 it cannot recover from.
// Derived from the shipped workflows, so a node that loses its credential in an edit is caught
// here rather than at the next real run.
const keyless = results.flatMap((r) => (guarded.has(`${r.method} /${r.path}`)
  ? r.callers.filter((c) => !c.sendsKey).map((c) => ({ ...c, path: r.path, method: r.method }))
  : []));

const missing = results.filter((r) => r.status === 404 && r.callers.length);
const unreachable = results.filter((r) => r.err);
const unguarded = results.filter((r) => r.unguarded);

for (const r of results) {
  const mark = r.unguarded ? 'OPEN' : r.err ? 'DOWN' : r.status === 404 ? 'GONE' : ' ok ';
  console.log(`  ${mark}  ${String(r.status ?? '---').padStart(3)}  ${r.method.padEnd(4)} /${r.path}`
    + `   ${r.callers.length
      ? r.callers.map((c) => `${c.file.replace('.json', '')}:${c.node}`).join(', ')
      : '(declared, no workflow calls it)'}`);
}
console.log('');

// Coverage asserted, not assumed (BUG-003/019). Zero endpoints found means the extractor
// stopped matching, not that the workflows stopped calling the service.
let failed = false;
if (paths.length === 0) {
  console.error('FAIL  no internal endpoints found in the workflows — the extractor is broken.');
  failed = true;
}

// The exemption that used to sit here is gone (BUG-051 closed). WF5's two endpoints are
// guarded like the other fifteen, and an exemption that outlives its card is an allow-list.
if (keyless.length) {
  failed = true;
  console.error(`FAIL  ${keyless.length} workflow node(s) dial a GUARDED route without sending the key:`);
  for (const k of keyless) console.error(`  ${k.file} → ${k.node}  ${k.method} /${k.path}`);
  console.error('');
  console.error('That is a 401 the workflow cannot recover from. Guarding a route and leaving');
  console.error('its caller keyless breaks the run at the next deploy, not at the next edit.');
}

if (unguarded.length) {
  failed = true;
  console.error(`FAIL  ${unguarded.length} internal endpoint(s) serve without checking the key:`);
  for (const u of unguarded) {
    console.error(`  ${u.method} /${u.path}  ${u.callers.length
      ? `called by ${u.callers.map((c) => c.node).join(', ')}`
      : 'called by nothing yet — which is the one that gets wired without being re-read'}`);
  }
  console.error('');
  console.error('Every other /internal/ route consults internalAuthorized first. These were');
  console.error('NOT knocked on — an unauthenticated write endpoint answers a probe by doing');
  console.error('the write, and a check must not be the thing it is warning about.');
}

if (unreachable.length) {
  failed = true;
  console.error(`FAIL  the review service did not answer at ${SERVICE} — start it before checking.`);
  console.error(`      ${unreachable[0].err}`);
} else if (missing.length) {
  failed = true;
  console.error(`FAIL  ${missing.length} endpoint(s) the workflows call do not exist on the running service:`);
  for (const m of missing) {
    console.error(`  /${m.path}  called by ${m.callers.map((c) => `${c.file} → ${c.node}`).join(', ')}`);
  }
  console.error('');
  console.error('A 404 here means the PROCESS is older than the code. Restart the review');
  console.error('service; the route exists in server.js and nothing running has it.');
} else if (!failed) {
  const knocked = results.length - unguarded.length;
  console.log(`PASS  ${knocked} of ${results.length} internal endpoints answered by the running service`
    + `${unguarded.length ? `; ${unguarded.length} carded and not knocked on` : ''}.`);
  console.log('      This proves each route EXISTS. What it does is asserted by the verifier');
  console.log('      that owns it — this file only opens the door.');
}

process.exitCode = failed ? 1 : 0;
