// Which road the second document takes, and why (E6-S2).
//
// The happy path is the boring half. A fork that sends a follow-up to WF3 is easy; the one
// that can be wrong for two days without anybody noticing is the fork that must send a
// follow-up to **WF2** because the first PRD is not approved yet. Get that backwards and a PM
// has two drafts and no idea which one is the product.
//
// So the fork is exercised in BOTH directions with ONE thing varied: whether the product has
// an approved version. Same product, same document, same code — the copy of the database is
// the only thing that differs, and it differs by a single legal state transition.
//
//   approved -> superseded  is a transition the state machine allows. Running it on a copy
//   removes the product's approved version WITHOUT touching the router, the document, or the
//   approval gate. Nothing here inserts an approved row or forges a sign-off (BUG-049).
//
// Everything that writes runs on a COPY of the database. The one thing that touches the live
// system is a door knock with `dispatch: false`, which stores a document and records where it
// would have gone — no model call, no version, no spend.
//
// Usage:  .\run.cmd review-ui/scripts/verify-routing.mjs

import { copyFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REAL_DB = resolve(process.env.DB_PATH ?? './data/prdgenie.db');
const N8N = (process.env.N8N_API_URL ?? 'http://localhost:5678').replace(/\/$/, '');
const WEBHOOK = process.env.N8N_INGEST_WEBHOOK_URL ?? `${N8N}/webhook/ingest`;

const dir = mkdtempSync(join(tmpdir(), 'routing-'));
const copy = join(dir, 'prdgenie.db');
copyFileSync(REAL_DB, copy);
// The -wal travels or the copy is an older database (BUG-015). The -shm must NOT.
if (existsSync(`${REAL_DB}-wal`)) copyFileSync(`${REAL_DB}-wal`, `${copy}-wal`);
process.env.DB_PATH = copy;

const { all, get, run } = await import('../db.mjs');
const { routeFor } = await import('../ingest.mjs');

let checks = 0; let failures = 0;
const say = (id, pass, msg, detail = '') => {
  checks++;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${msg}${detail ? `\n               ${detail}` : ''}`);
};

const wf1 = JSON.parse(readFileSync('n8n/workflows/WF1-ingest.json', 'utf8'));
const wf3 = JSON.parse(readFileSync('n8n/workflows/WF3-delta.json', 'utf8'));
const nodeIn = (wf, name) => wf.nodes.find((n) => n.name === name);

// --- TC1: WF3 is a workflow on the same terms as every other ---------------------------------
{
  const tagged = (wf3.tags ?? []).some((t) => (t.name ?? t) === 'prdgenie');
  const routed = wf3.settings?.errorWorkflow === 'prdgenieWF4error';
  say('TC1', wf3.active === true && tagged && routed,
    'WF3 is active, tagged prdgenie, and routes its failures to WF4',
    `active=${wf3.active} tagged=${tagged} errorWorkflow=${wf3.settings?.errorWorkflow}`);
}

// --- TC2: WF3 reaches a provider only through WF0 ---------------------------------------------
// Derived from the shipped workflow, not from the diagram: every URL WF3 dials, checked against
// the hosts a provider lives on.
{
  const PROVIDER_HOSTS = ['openai.com', 'googleapis.com', 'anthropic.com', 'generativelanguage'];
  const urls = wf3.nodes
    .filter((n) => n.type === 'n8n-nodes-base.httpRequest')
    .map((n) => ({ node: n.name, url: String(n.parameters?.url ?? '') }));
  const direct = urls.filter((u) => PROVIDER_HOSTS.some((h) => u.url.includes(h)));
  const viaWf0 = wf3.nodes.filter((n) => n.type === 'n8n-nodes-base.executeWorkflow'
    && JSON.stringify(n.parameters ?? {}).includes('prdgenieWF0llmcall'));
  say('TC2', direct.length === 0 && viaWf0.length === 1,
    'WF3 dials no provider directly and calls exactly one WF0',
    `${urls.length} http node(s), ${direct.length} to a provider host, ${viaWf0.length} WF0 call(s)`);
}

// --- the fixture: a product that has an approved version --------------------------------------
const product = get(`SELECT p.product_id, COUNT(*) AS n
     FROM prd_versions v JOIN prds p ON p.prd_id = v.prd_id
    WHERE v.state = 'approved' GROUP BY p.product_id ORDER BY n DESC LIMIT 1`);

if (!product) {
  say('TC0', false, 'no product with an approved version — the fork cannot be exercised both ways');
  process.exitCode = 1;
} else {
  say('TC0', true, 'a product with an approved version to fork on',
    `${product.product_id}, ${product.n} approved version(s)`);

  // --- TC4: with an approved version, the road is the delta -----------------------------------
  const before = routeFor(product.product_id);
  say('TC4', before.route === 'delta' && before.has_approved_version === true
    && Number.isInteger(before.approved_prd_version_id),
  'a product WITH an approved version routes to the delta',
  `${before.route}: ${before.route_reason}`);

  // --- TC3 / TC5 / TC8: the same product, one thing varied ------------------------------------
  // CONTROL. Supersede every approved version of this product — a transition the state machine
  // permits — and ask the same function the same question. Nothing else changes: not the
  // product, not the documents, not a line of the router.
  const approved = all(`SELECT v.prd_version_id FROM prd_versions v JOIN prds p ON p.prd_id = v.prd_id
                         WHERE p.product_id = ? AND v.state = 'approved'`, [product.product_id]);
  for (const v of approved) {
    run("UPDATE prd_versions SET state='superseded' WHERE prd_version_id=?", [v.prd_version_id]);
  }
  const after = routeFor(product.product_id);

  say('TC3', after.route === 'generate' && after.has_approved_version === false
    && after.approved_prd_version_id === null,
  'the SAME product with no approved version routes to generate instead',
  `${after.route}: ${after.route_reason}`);

  say('TC5', approved.length > 0,
    'one variable: the approved version was superseded, nothing else touched',
    `${approved.length} version(s) superseded, product and documents unchanged`);

  say('TC8', before.route !== after.route && before.route_reason !== after.route_reason,
    'CONTROL: the fork goes the other way, and the recorded reason changes with it',
    `"${before.route_reason}"\n               -> "${after.route_reason}"`);

  // --- TC6: computed at call time, never a stored flag ----------------------------------------
  // The proof is that the answer changed above without anything being told. Nothing was
  // invalidated, no flag was rewritten, no process restarted — the router asked the database
  // and the database had a different answer. A stored flag would still say `delta`.
  const flagColumns = all("SELECT name FROM pragma_table_info('source_documents')")
    .map((c) => c.name)
    .filter((c) => /route|approved/i.test(c));
  say('TC6', before.route !== after.route && flagColumns.length === 0,
    'the precondition is computed at call time; no document carries a stored route',
    `source_documents has no route/approved column (${flagColumns.length} found)`);
}

// --- TC7: the decision is an event, and it says why -------------------------------------------
// Through the REAL door, on the live system, with `dispatch: false` — the document is stored
// and the road is recorded, but no model is called and no version is minted.
{
  let env = null;
  try {
    const res = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        product_id: `routing-probe-${Date.now()}`,
        doc_type: 'notes',
        title: 'routing probe',
        raw_text: 'A probe document. It exists so the door can record where it would have sent this.',
        dispatch: false,
      }),
    });
    env = await res.json();
  } catch (err) {
    env = { status: 'error', payload: { reason: err.message } };
  }

  // The event has to be read from the LIVE database — the door wrote to that one, and the copy
  // was taken before the knock. Asserting the copy does NOT have it is what keeps the next
  // reader from "simplifying" this into a query against `get()` that would silently find
  // nothing and report a missing event.
  const inCopy = env?.trace_id
    ? get("SELECT detail FROM events WHERE trace_id=? AND name='routed'", [env.trace_id])
    : null;

  let recorded = null;
  if (env?.trace_id) {
    const { DatabaseSync } = await import('node:sqlite');
    const d = new DatabaseSync(REAL_DB, { readOnly: true });
    recorded = d.prepare("SELECT detail FROM events WHERE trace_id=? AND name='routed'")
      .get(env.trace_id) ?? null;
    d.close();
  }
  const parsed = recorded ? JSON.parse(recorded.detail) : null;
  say('TC7', Boolean(parsed) && parsed.route === 'generate'
    && typeof parsed.route_reason === 'string' && parsed.route_reason.length > 0,
  'the routing decision is an event on the trace, and it names its reason',
  parsed ? `${env.trace_id}: ${parsed.route_reason}` : `no routed event (${JSON.stringify(env?.payload ?? env)})`);

  say('TC7b', inCopy === null || inCopy === undefined,
    'CONTROL: the event is NOT in the copy — TC7 read the live database, not a stale file',
    inCopy ? 'the copy already had this trace, so TC7 proves nothing' : 'copy predates the knock, as it must');

  // --- TC3b: the envelope carries the same answer the event does ------------------------------
  say('TC3b', env?.payload?.route === parsed?.route,
    'the caller is told the same road that was recorded',
    `envelope=${env?.payload?.route} event=${parsed?.route}`);
}

// --- TC-dispatch: the fork actually goes somewhere ---------------------------------------------
// A fork whose branches end on a No-Op decides and does nothing. Asserted from the shipped
// workflow: each branch of `Existing approved PRD?` must reach a node that CALLS.
{
  const branches = wf1.connections['Existing approved PRD?']?.main ?? [];
  const targets = branches.map((b) => (b?.[0]?.node ?? null));
  const calls = targets.map((t) => {
    const n = t ? nodeIn(wf1, t) : null;
    return n && n.type === 'n8n-nodes-base.httpRequest' ? String(n.parameters?.url ?? '') : null;
  });
  say('TC3c', calls.length === 2 && calls[0]?.endsWith('/webhook/delta') && calls[1]?.endsWith('/webhook/generate'),
    'both branches of the fork call the workflow they name',
    `true -> ${targets[0]} (${calls[0] ?? 'no call'})\n               false -> ${targets[1]} (${calls[1] ?? 'no call'})`);

  const gate = nodeIn(wf1, 'Run the pipeline?');
  say('TC3d', Boolean(gate) && JSON.stringify(gate.parameters).includes('dispatch'),
    'the door can be exercised without paying for a model, and says so in one named node',
    gate ? 'Run the pipeline? reads dispatch, defaulting to true' : 'no gate node');
}

// --- TC17: a new reason code exists in every place that enforces it -----------------------------
// Derived from the WORKFLOW, not typed here: whatever WF3's park can emit is what has to be
// declared. A reason the workflow can produce and the service will not accept is a park that
// becomes a 400 at the worst possible moment (BUG-036's deploy-ordering hazard).
{
  const parkCode = nodeIn(wf3, 'Park: needs_review')?.parameters?.jsCode ?? '';
  const applyCode = readFileSync('review-ui/delta.mjs', 'utf8');
  const emitted = new Set([
    ...[...parkCode.matchAll(/reason = '([a-z_]+)'/g)].map((m) => m[1]),
    ...[...applyCode.matchAll(/reason: '([a-z_]+)'/g)].map((m) => m[1]),
  ]);
  const declared = readFileSync('review-ui/assemble.mjs', 'utf8');
  const contracts = readFileSync('docs/contracts.md', 'utf8');
  // The exemption that used to sit here is gone (BUG-050 closed). It named `unknown_version`
  // and `unknown_document`, which this check found on its first run; both are now in
  // `DOOR_REASONS` and in the contract, and `check-reason-codes.mjs` asks the same question of
  // every module rather than only the delta path. An exemption that outlives its card is an
  // allow-list.
  const missing = [...emitted].filter((r) => !declared.includes(`'${r}'`) || !contracts.includes(r));
  say('TC17', emitted.size > 0 && missing.length === 0,
    'every reason the delta path can emit is in a closed set AND in contracts.md',
    `${emitted.size} reason(s): ${[...emitted].sort().join(', ')}`
    + `${missing.length ? ` — MISSING: ${missing.join(', ')}` : ''}`);
}

// --- TC15: one inbox ---------------------------------------------------------------------------
// The PM does not learn a second place to look. Asserted by reading the inbox query: it selects
// on state, and knows nothing about how a version came to exist.
{
  const server = readFileSync('review-ui/server.js', 'utf8');
  const start = server.indexOf("route('GET', '/api/prd-versions'");
  const listing = start < 0 ? '' : server.slice(start, server.indexOf('}));', start));
  const branchesOnOrigin = /derived_from|prd_changes|delta/i.test(listing);
  say('TC15', listing.length > 0 && !branchesOnOrigin,
    'the queue lists every version the same way and cannot tell a delta from a first draft',
    start < 0 ? 'no /api/prd-versions route found'
      : branchesOnOrigin ? 'the listing mentions the delta path'
        : 'GET /api/prd-versions: one query, no mention of derived_from, prd_changes or delta');
}

console.log('');
console.log(`${checks - failures}/${checks} checks passed.`);
console.log('');
console.log('What this does NOT show: how good the delta is (C5, E6-S5), and what the next');
console.log('version keeps (verify-apply-delta.mjs). This file is about which road, and why.');
process.exitCode = failures ? 1 : 0;
