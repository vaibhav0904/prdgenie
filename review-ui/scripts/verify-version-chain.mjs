// The version chain: approving version N supersedes what came before it, in one transaction.
//
// E6-S3. Until this story nothing had ever superseded anything, and `prd_versions.state` had a
// value — `superseded` — that no code path could reach. A state machine with an unreachable
// state is a diagram, not a machine.
//
// WHAT IT ASSERTS
//
//   the supersede is part of the approval        one transaction, or a PRD has two current
//                                                versions the moment the second write fails
//   only a later approval reaches `superseded`   not SQL, not the delta path, not an endpoint
//   history is READ, never recomputed            a diff describes today's parser; the row
//                                                describes what was decided
//   the predecessor is `derived_from`            not "the previous version number", which
//                                                inside one prd_id may be an unrelated draft
//   `removed` is a change a delta can record     it was refused by the table for a whole epic
//
// IT BUILDS ITS OWN FIXTURE, never finds one (BUG-045). Every version this file approves,
// supersedes or refuses belongs to a PRD it created seconds earlier, so a run of this check can
// never sign off something a person was reviewing.
//
// Usage:  .\run.cmd review-ui\scripts\verify-version-chain.mjs

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { all, get, run, signOff, initSchema } from '../db.mjs';
import { predecessorOf, versionHistory, trend } from '../review.mjs';

initSchema();

let checks = 0;
let failures = 0;
const say = (id, pass, what, detail) => {
  checks++;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${what}${detail ? `\n           ${detail}` : ''}`);
};

// --- the fixture ---------------------------------------------------------------------------
// A product of its own, a PRD of its own, and versions this file minted. Nothing here is found.

const stamp = Date.now();
const PRODUCT = `chain-${stamp}`;
const PRD = `PRD-${PRODUCT}`;
const TRACE = randomUUID();

run('INSERT INTO products (product_id, name) VALUES (?,?)', [PRODUCT, 'version chain fixture'])
  ;
run('INSERT INTO prds (prd_id, product_id) VALUES (?,?)', [PRD, PRODUCT]);

const DOC = `DOC-chain-${stamp}`;
run(`INSERT INTO source_documents (doc_id, product_id, trace_id, doc_type, title, raw_text,
       source_channel, segments, pii_redactions)
     VALUES (?,?,?,?,?,?,?,?,?)`,
[DOC, PRODUCT, TRACE, 'notes', 'chain fixture', 'the source that caused the changes',
  'webhook', '[]', '[]']);

/**
 * Sign off the way the ENDPOINT does, marks and all.
 *
 * `signOff()` moves the state; the endpoint also writes the `approved` event and the review
 * session that decided it. A check that calls the function and stops leaves an approved version
 * with no sign-off behind it — which is precisely what `audit-approvals` exists to indict, and
 * it indicted seven of these before this helper existed. Its message names the two possibilities
 * and this was the second one: *"a check that called signOff() directly on the live database."*
 *
 * The marks are written here rather than the audit being taught to ignore this PRD. An audit
 * with an exemption for the checks is an audit of the parts nobody was worried about.
 */
function signOffWithMarks(versionId) {
  const out = signOff(versionId);
  const sessionId = Number(run(
    'INSERT INTO review_sessions (prd_version_id, reviewer) VALUES (?,?)',
    [versionId, 'local-operator']).lastInsertRowid);
  run("UPDATE review_sessions SET signed_off_at=datetime('now') WHERE session_id=?", [sessionId]);
  run('INSERT INTO events (trace_id, name, component, detail) VALUES (?,?,?,?)',
    [TRACE, 'approved', 'review_ui', `prd_version_id=${versionId}`]);
  return out;
}

/** A version in `in_review`, with one requirement so readiness has something to see. */
function mintVersion({ derivedFrom = null, statement = 'a requirement' } = {}) {
  const n = get('SELECT COALESCE(MAX(version_no),0)+1 AS n FROM prd_versions WHERE prd_id=?', [PRD]).n;
  const content = {
    product_id: PRODUCT, title: 'chain fixture', derived_from: derivedFrom,
    source_doc_ids: [DOC],
    requirements: [{ req_id: `${n}-REQ-001`, kind: 'functional', statement, grounded: true, citations: [{ quote: 'the source' }] }],
  };
  run(`INSERT INTO prd_versions (prd_id, version_no, trace_id, state, content)
       VALUES (?,?,?,'in_review',?)`, [PRD, n, TRACE, JSON.stringify(content)]);
  const id = get('SELECT prd_version_id FROM prd_versions WHERE prd_id=? AND version_no=?', [PRD, n]).prd_version_id;
  run(`INSERT INTO requirements (req_id, prd_version_id, doc_id, trace_id, kind, statement,
         grounded, origin_req_id) VALUES (?,?,?,?,?,?,1,?)`,
  [`${id}-REQ-001`, id, DOC, TRACE, 'functional', statement, `${id}-REQ-001`]);
  return id;
}

const v1 = mintVersion({ statement: 'export a chart as PNG' });
const v2 = mintVersion({ derivedFrom: v1, statement: 'export a chart as PNG or SVG' });

// --- TC1/TC2/TC3: the changelog ---------------------------------------------------------------
// All four kinds, written and read back. `removed` took the whole apply down until today
// (BUG-062), so it is asserted by INSERTING one, not by reading a CHECK constraint.
{
  const kinds = ['added', 'modified', 'contradicted', 'removed'];
  const written = [];
  for (const kind of kinds) {
    try {
      run(`INSERT INTO prd_changes (prd_version_id, kind, req_id, old_text, new_text, doc_id)
           VALUES (?,?,?,?,?,?)`,
      [v2, kind, `${v2}-REQ-001`, 'export a chart as PNG', 'export a chart as PNG or SVG', DOC]);
      written.push(kind);
    } catch (e) {
      console.log(`           ${kind} refused: ${e.message}`);
    }
  }
  say('TC1', written.length === kinds.length,
    'prd_changes accepts every kind the delta path emits',
    `${written.join(', ')} — asked of the database, not read off the constraint`);

  const rows = all('SELECT kind, doc_id FROM prd_changes WHERE prd_version_id=?', [v2]);
  say('TC2', rows.some((r) => r.kind === 'removed'),
    'a `removed` change is stored and reads back (BUG-062 closed here)',
    `${rows.length} change row(s) on version ${v2}`);
  say('TC3', rows.length > 0 && rows.every((r) => r.doc_id === DOC),
    'every change row carries the doc_id of the source that caused it',
    `all ${rows.length} name ${DOC}`);
}

// --- TC4: the closed set of kinds is derived --------------------------------------------------
// From the code that emits them and the contract that names them. The table, the code and
// `docs/contracts.md` §10 disagreed for a whole epic and nothing was looking.
{
  const emitted = new Set([...readFileSync('review-ui/delta.mjs', 'utf8')
    .matchAll(/kind:\s*'([a-z_]+)'/g)].map((m) => m[1]));
  const ddl = get("SELECT sql FROM sqlite_master WHERE type='table' AND name='prd_changes'").sql;
  const accepted = new Set([...ddl.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
  const contract = readFileSync('docs/contracts.md', 'utf8');
  const missingFromTable = [...emitted].filter((k) => !accepted.has(k));
  const missingFromContract = [...emitted].filter((k) => !contract.includes(`\`${k}\``));
  say('TC4', emitted.size > 0 && !missingFromTable.length && !missingFromContract.length,
    'every kind delta.mjs emits is accepted by the table AND named in contracts.md §10',
    `${emitted.size} kind(s): ${[...emitted].sort().join(', ')}`
    + (missingFromTable.length ? ` — TABLE REFUSES: ${missingFromTable.join(', ')}` : '')
    + (missingFromContract.length ? ` — UNDOCUMENTED: ${missingFromContract.join(', ')}` : ''));
}

// --- TC5: the supersede is part of the approval ------------------------------------------------
{
  signOffWithMarks(v1);
  const afterFirst = get("SELECT COUNT(*) AS n FROM prd_versions WHERE prd_id=? AND state='approved'", [PRD]).n;
  const out = signOffWithMarks(v2);
  const states = Object.fromEntries(all(
    'SELECT prd_version_id, state FROM prd_versions WHERE prd_id=?', [PRD])
    .map((r) => [r.prd_version_id, r.state]));
  say('TC5', afterFirst === 1 && states[v1] === 'superseded' && states[v2] === 'approved'
    && out.superseded === 1,
    'approving v2 supersedes v1, and the sign-off reports how many it moved',
    `v${v1} ${states[v1]} · v${v2} ${states[v2]} · superseded=${out.superseded}`);

  const approved = get("SELECT COUNT(*) AS n FROM prd_versions WHERE prd_id=? AND state='approved'", [PRD]).n;
  say('TC5b', approved === 1, 'the PRD has exactly ONE approved version afterwards',
    `${approved} approved`);
}

// --- TC6: the failure, not just the success ----------------------------------------------------
//
// The story's own note: a supersede that can fail on its own leaves two approved versions of one
// PRD. Forced rather than assumed — the transition trigger refuses `in_review -> superseded`, so
// a version in the wrong state inside the same call makes the supersede throw, and what must
// survive is ONE approved version, not two.
//
// THE FAULT IS INJECTED AT THE SUPERSEDE, not before it. A first version of this row made
// `signOff` throw by naming a version that does not exist — which fails at the APPROVAL, proves
// the approval is guarded, and says nothing at all about whether the supersede shares its
// transaction. It passed, for the wrong reason, and would have gone on passing if the supersede
// had been moved outside `tx()` entirely.
//
// So a temporary trigger makes the supersede's UPDATE fail while the approval above it succeeds.
// What must survive: the approval rolled back too, `v2` is still the approved one, and the PRD
// has ONE current version rather than two.
{
  const before = get("SELECT COUNT(*) AS n FROM prd_versions WHERE prd_id=? AND state='approved'", [PRD]).n;
  const v3 = mintVersion({ derivedFrom: v2, statement: 'export a chart as PDF' });
  let threw = null;
  try {
    run(`CREATE TRIGGER chain_break_${stamp}
         BEFORE UPDATE OF state ON prd_versions
         WHEN NEW.state = 'superseded'
         BEGIN SELECT RAISE(ABORT, 'injected: the supersede cannot complete'); END`);
    try {
      signOffWithMarks(v3);
    } catch (e) { threw = e.message; }
  } finally {
    run(`DROP TRIGGER IF EXISTS chain_break_${stamp}`);
  }
  const after = get("SELECT COUNT(*) AS n FROM prd_versions WHERE prd_id=? AND state='approved'", [PRD]).n;
  const v3state = get('SELECT state FROM prd_versions WHERE prd_version_id=?', [v3]).state;
  const v2state = get('SELECT state FROM prd_versions WHERE prd_version_id=?', [v2]).state;
  say('TC6', /injected/.test(threw ?? '') && after === before && after === 1
    && v3state === 'in_review' && v2state === 'approved',
    'a supersede that fails takes the APPROVAL down with it — one current version, never two',
    `threw at the supersede: ${threw ? 'yes' : 'NO'} · approved ${before} -> ${after}`
    + ` · v${v3} still ${v3state} · v${v2} still ${v2state}`);

  // The control for TC6: with the fault removed, the same call succeeds. Without this, a
  // signOff that had simply stopped working would pass the row above.
  const out = signOffWithMarks(v3);
  const nowApproved = get("SELECT COUNT(*) AS n FROM prd_versions WHERE prd_id=? AND state='approved'", [PRD]).n;
  say('TC6b', out.superseded === 1 && nowApproved === 1
    && get('SELECT state FROM prd_versions WHERE prd_version_id=?', [v3]).state === 'approved',
    'CONTROL: with the fault removed the same sign-off succeeds and supersedes exactly one',
    `v${v3} approved, superseded=${out.superseded}, ${nowApproved} approved on the PRD`);
}

// --- TC7: superseded has one door ---------------------------------------------------------------
{
  const v4 = mintVersion({ statement: 'a version nobody approved' });
  let refused = null;
  try {
    run("UPDATE prd_versions SET state='superseded' WHERE prd_version_id=?", [v4]);
  } catch (e) { refused = e.message; }
  const state = get('SELECT state FROM prd_versions WHERE prd_version_id=?', [v4]).state;
  say('TC7', Boolean(refused) && state === 'in_review',
    'an in_review version cannot be moved to superseded by SQL — only a later approval gets there',
    refused ? refused.split('\n')[0] : 'THE UPDATE SUCCEEDED');

  // And the approved gate is not weakened on the way past. A supersede must not become a
  // sideways door to `approved`.
  let approvedRefused = null;
  try {
    run("UPDATE prd_versions SET state='approved' WHERE prd_version_id=?", [v4]);
  } catch (e) { approvedRefused = e.message; }
  say('TC8', Boolean(approvedRefused),
    'and the approval gate still refuses a direct UPDATE (ADR 0006 unweakened)',
    approvedRefused ? approvedRefused.split('\n')[0] : 'THE UPDATE SUCCEEDED');
}

// --- TC9: a superseded version is still readable, byte-identical ---------------------------------
{
  const row = get('SELECT content FROM prd_versions WHERE prd_version_id=?', [v1]);
  const parsed = JSON.parse(row.content);
  say('TC9', parsed.requirements[0].statement === 'export a chart as PNG',
    'the superseded version still reads exactly what was approved — history, not a draft',
    `v${v1}: "${parsed.requirements[0].statement}"`);
}

// --- TC10: the changelog is read, never recomputed -------------------------------------------------
// Asserted from the source. A history that diffed the text would agree with the text it diffed
// and look perfect, so the only place to catch it is the reader.
{
  const src = readFileSync('review-ui/review.mjs', 'utf8');
  const fn = src.slice(src.indexOf('export function versionHistory'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  // `\b` and not a bare prefix: the control renamed the table to `prd_changes_disabled` and a
  // looser match called that "reads the changelog". A word boundary is the difference between
  // asserting the table and asserting the first eleven characters of its name.
  const readsChangelog = /FROM prd_changes\b/.test(body);
  const diffs = /\bdiff\b|localeCompare\(.*statement|split\(''\)/.test(body);
  say('TC10', readsChangelog && !diffs,
    'versionHistory READS prd_changes and computes no diff of its own',
    'a diff produced now describes today\'s parser; the row describes what was decided');
}

// --- TC11: browsable ---------------------------------------------------------------------------
{
  const h = versionHistory(PRD);
  const v2row = h?.versions.find((v) => v.prd_version_id === v2);
  // `v2` reads as SUPERSEDED here, and that is the assertion rather than an inconvenience: TC6b
  // approved the version derived from it, so the chain moved. A row that still said `approved`
  // would mean the supersede had not reached the read model.
  say('TC11', Boolean(h) && h.versions.length >= 2 && v2row
    && v2row.change_counts.removed === 1 && v2row.state === 'superseded'
    && typeof h.versions_total === 'number',
    'the history returns every version with its state, its approval time and its changes',
    `${h?.versions_shown} of ${h?.versions_total} shown · v${v2} ${v2row?.state} `
    + JSON.stringify(v2row?.change_counts ?? {}));

  say('TC11b', h.approved_count === 1 && h.superseded_count >= 1,
    'the approved and superseded counts are over the whole PRD, not over the page',
    `approved ${h.approved_count} · superseded ${h.superseded_count} · total ${h.versions_total}`);
}

// --- TC12: the predecessor is derived_from ------------------------------------------------------
{
  const pred = predecessorOf(v2);
  say('TC12', pred?.prd_version_id === v1,
    'the predecessor is the version it was DERIVED FROM, not the previous version number',
    `v${v2}.derived_from = ${pred?.prd_version_id} (v1 is ${v1})`);

  const none = predecessorOf(v1);
  say('TC12b', none === null,
    'a first version has no predecessor, and says so rather than reaching for a lower number',
    `v${v1} -> ${none}`);
}

// --- TC13: the trend renders a real comparison --------------------------------------------------
{
  const t = trend(v2);
  say('TC13', t.available === true && t.prior_version_id === v1,
    'the review screen\'s trend now compares against a real predecessor (E4-S5 unblocked)',
    t.available ? `requirements ${t.requirements.join(' -> ')} against #${t.prior_version_id}`
      : `still unavailable: ${t.reason}`);

  const t1 = trend(v1);
  say('TC13b', t1.available === false && t1.reason === 'no prior version',
    'and a version with no predecessor still says so rather than showing zero',
    `v${v1}: ${t1.reason}`);

  // A DERIVED VERSION WITH NO RECORDED CHANGES still has a predecessor, and the trend used to
  // deny it: the old guard asked `prd_changes` first, so a version whose `derived_from` pointed
  // at a real row reported "no prior version". Found by asking the endpoint rather than the
  // module — the check was green on `v2`, which happens to have both.
  const v5 = mintVersion({ derivedFrom: v1, statement: 'derived, and nothing recorded' });
  const t5 = trend(v5);
  say('TC13c', t5.available === true && t5.prior_version_id === v1,
    'a version derived from another compares against it even with no change rows',
    t5.available ? `#${v5} against #${t5.prior_version_id}` : `wrongly unavailable: ${t5.reason}`);
}

// --- TC14: the figure the story must not hide ------------------------------------------------------
// The invariant is FALSE on data that predates the supersede, and the honest thing is to print
// how false rather than to backfill a chain that never happened.
{
  const stale = all(`SELECT prd_id, COUNT(*) AS n FROM prd_versions
                      WHERE state='approved' GROUP BY prd_id HAVING n > 1 ORDER BY n DESC`);
  const worst = stale[0];
  say('TC14', true,
    'PRDs still carrying more than one approved version, counted rather than cleaned',
    stale.length
      ? `${stale.length} PRD(s), worst ${worst.prd_id} with ${worst.n}. `
        + 'Approved before an approval superseded anything; the next approval of each will move them.'
      : 'none — every PRD has at most one approved version');
}

// --- the fixture goes away again -----------------------------------------------------------------
//
// ON SUCCESS ONLY. A green run leaves nothing behind: five versions and an approval per sweep is
// the same slow growth BUG-059 objects to, in the tables the judge samples and the metrics count.
// A RED run leaves everything, and says where, because deleting the evidence of a failure to keep
// the database tidy is the wrong trade every time.
//
// Deleting rows this file created seconds ago is not the reset CLAUDE.md forbids: the fixture is
// addressed by a product id that contains this run's timestamp, and nothing else can match it.
function cleanUp() {
  const ids = all('SELECT prd_version_id FROM prd_versions WHERE prd_id=?', [PRD])
    .map((r) => r.prd_version_id);
  for (const id of ids) {
    run('DELETE FROM citations WHERE req_id IN (SELECT req_id FROM requirements WHERE prd_version_id=?)', [id]);
    run('DELETE FROM requirements WHERE prd_version_id=?', [id]);
    run('DELETE FROM prd_changes WHERE prd_version_id=?', [id]);
    run('DELETE FROM review_sessions WHERE prd_version_id=?', [id]);
  }
  run('DELETE FROM events WHERE trace_id=?', [TRACE]);
  run('DELETE FROM prd_versions WHERE prd_id=?', [PRD]);
  run('DELETE FROM prds WHERE prd_id=?', [PRD]);
  run('DELETE FROM source_documents WHERE doc_id=?', [DOC]);
  run('DELETE FROM products WHERE product_id=?', [PRODUCT]);
  return ids.length;
}

console.log('');
console.log(`${checks - failures}/${checks} checks passed.`);
if (failures) {
  console.log(`Fixture LEFT IN PLACE for inspection: ${PRD} (${PRODUCT}), document ${DOC}.`);
} else {
  const n = cleanUp();
  console.log(`Fixture: ${PRD} — built by this file (BUG-045), and removed again: ${n} version(s).`);
}
process.exitCode = failures ? 1 : 0;
