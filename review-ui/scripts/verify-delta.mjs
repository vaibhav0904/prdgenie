// E6-S1. The three decisions code makes about a delta, forced.
//
// The model proposes changes to a document somebody has already approved. That is the highest
// stakes any model output in this system has, and it is why none of the following is left to
// it: which requirement an item is about, whether the evidence exists, and what silence means.
//
// RUNS ON A COPY OF THE DATABASE. It approves a version, plants payloads a model might return,
// and reads what survives — none of which should become a fact about the project.
//
// Usage:  .\run.cmd review-ui/scripts/verify-delta.mjs

import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REAL_DB = resolve(process.env.DB_PATH ?? './data/prdgenie.db');
const dir = mkdtempSync(join(tmpdir(), 'delta-verify-'));
const copy = join(dir, 'prdgenie.db');
copyFileSync(REAL_DB, copy);
// The -wal travels; the -shm must not (E7-S5 learned this the hard way).
if (existsSync(`${REAL_DB}-wal`)) copyFileSync(`${REAL_DB}-wal`, `${copy}-wal`);

process.env.DB_PATH = copy;

const { all, get, run, initSchema, signOff, close } = await import('../db.mjs');
const D = await import('../delta.mjs');

initSchema();
all('PRAGMA wal_checkpoint(TRUNCATE)');

let checks = 0; let failures = 0;
const say = (id, pass, msg, detail = '') => {
  checks++;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(7)} ${msg}${detail ? `  — ${detail}` : ''}`);
};

console.log(`Database:  ${copy}  (a copy; the real one is untouched)\n`);

// --- a fixture: one approved version, and a newer draft that must be ignored ------------------

// THE FIXTURE IS BUILT, NOT FOUND (BUG-045).
//
// This used to take the newest `in_review` version it could see, sign it off, and assume that
// made it the newest APPROVED version of its product. It did not. Anything that approved a
// version of the same product first — `verify-signoff` did, on the live database, every run —
// outranked it, and TC0a went red about somebody else's row while claiming the delta had read
// the wrong version.
//
// So the requirements are still borrowed (they need real citable text), but they are cloned
// into an OWN PRODUCT created microseconds ago. Nothing else can have approved a version of a
// product that did not exist until this line ran, whatever else the suite did first.
const source = get(`SELECT v.prd_version_id, v.prd_id, v.trace_id, p.product_id
     FROM prd_versions v JOIN prds p ON p.prd_id = v.prd_id
    WHERE v.state IN ('in_review', 'approved')
      AND (SELECT COUNT(*) FROM requirements r WHERE r.prd_version_id = v.prd_version_id) >= 4
    ORDER BY v.prd_version_id DESC LIMIT 1`);

if (!source) {
  console.error('No version with 4+ requirements to clone a fixture from. Produce a run first.');
  process.exit(1);
}

const OWN = `verify-delta-${Date.now()}`;
const OWN_PRD = `PRD-${OWN}`;
run('INSERT INTO products (product_id, name) VALUES (?,?)', [OWN, 'Delta verification']);
run('INSERT INTO prds (prd_id, product_id) VALUES (?,?)', [OWN_PRD, OWN]);

const sourceContent = get('SELECT content FROM prd_versions WHERE prd_version_id=?',
  [source.prd_version_id]).content;
run(`INSERT INTO prd_versions (prd_id, version_no, trace_id, state, content)
     VALUES (?, 1, ?, 'in_review', ?)`, [OWN_PRD, source.trace_id, sourceContent]);
const approvedId = get('SELECT prd_version_id FROM prd_versions WHERE prd_id=? AND version_no=1',
  [OWN_PRD]).prd_version_id;

// The requirements come across with their citations: the delta locates quotes, so rows with no
// evidence behind them would test a different thing than the one this file is about.
for (const r of all(`SELECT req_id, doc_id, trace_id, kind, statement, subject, stakeholder,
                            confidence, grounded, pm_authored, origin_req_id
                       FROM requirements WHERE prd_version_id = ? ORDER BY req_id`,
[source.prd_version_id])) {
  const reqId = `${approvedId}-${r.req_id.split('-').slice(1).join('-')}`;
  run(`INSERT INTO requirements (req_id, prd_version_id, doc_id, trace_id, kind, statement,
         subject, stakeholder, confidence, grounded, pm_authored, origin_req_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  [reqId, approvedId, r.doc_id, r.trace_id, r.kind, r.statement, r.subject, r.stakeholder,
    r.confidence, r.grounded, r.pm_authored, r.origin_req_id ?? reqId]);
  for (const c of all('SELECT doc_id, quote, start_char, end_char, match_kind FROM citations WHERE req_id=?', [r.req_id])) {
    run(`INSERT INTO citations (req_id, doc_id, quote, start_char, end_char, match_kind)
         VALUES (?,?,?,?,?,?)`, [reqId, c.doc_id, c.quote, c.start_char, c.end_char, c.match_kind]);
  }
}

signOff(approvedId);

// A LATER DRAFT for the same product. The delta must be computed against the APPROVED version,
// not this one: a draft awaiting review is not what anyone agreed to.
const laterDraft = run(`INSERT INTO prd_versions (prd_id, version_no, trace_id, state, content)
   VALUES (?, 2, ?, 'in_review', '{}')`, [OWN_PRD, source.trace_id]).lastInsertRowid;

const version = D.approvedVersionFor(OWN);
say('TC0a', version?.prd_version_id === approvedId,
  'the delta is computed against the APPROVED version, not the newest draft',
  `approved=${approvedId}, newer draft=${laterDraft}, chosen=${version?.prd_version_id}`);
say('TC0b', (version?.requirements?.length ?? 0) >= 4,
  'and it carries the requirements to compare against', `${version?.requirements?.length} requirement(s)`);

const forPrompt = D.requirementsForPrompt(version);
say('TC0c', forPrompt.includes(version.requirements[0].req_id)
  && forPrompt.includes(version.requirements[0].statement.slice(0, 20)),
'the prompt is handed ids and statements, built in code so a workflow cannot reshape them');

// TC0d — THE CONTROL FOR TC0a, and the one this file went two weeks without.
//
// TC0a now passes by construction: the product was created microseconds ago, so nothing else
// can have approved a version of it. That is exactly the shape of assertion that passes because
// the situation cannot arise rather than because the code is right — so this proves the
// comparison is still live, by making a second approved version and requiring the answer to
// move to it.
//
// Done on a throwaway copy of a throwaway product, and undone immediately, because everything
// after this line still needs `version` to be the first one.
{
  run("UPDATE prd_versions SET state='in_review' WHERE prd_version_id=?", [laterDraft]);
  signOff(laterDraft);
  const intruder = D.approvedVersionFor(OWN);
  say('TC0d', intruder?.prd_version_id === laterDraft,
    'CONTROL: a newer approved version DOES move the answer — TC0a is not vacuous',
    `planted v${laterDraft}, chosen=${intruder?.prd_version_id} (was ${approvedId})`);
  run("UPDATE prd_versions SET state='superseded' WHERE prd_version_id=?", [laterDraft]);
}

// The document the delta is read from: any real source document with text.
const doc = get(`SELECT doc_id, raw_text FROM source_documents WHERE LENGTH(raw_text) > 400
                 ORDER BY created_at DESC LIMIT 1`);
const realQuote = doc.raw_text.slice(200, 260);
const knownId = version.requirements[0].req_id;
const secondId = version.requirements[1].req_id;

// --- the payload a model might return, with two items that must not survive -------------------

const payload = {
  added: [{
    subject: 'a new thing', statement: 'The product does a new thing.',
    citations: [{ quote: realQuote }],
  }],
  modified: [
    { req_id: knownId, prd_quote: version.requirements[0].statement, statement: 'It now says something else.', citations: [{ quote: realQuote }] },
    { req_id: 'REQ-NOT-IN-THIS-VERSION', prd_quote: 'invented', statement: 'x', citations: [{ quote: realQuote }] },
  ],
  contradicted: [{
    req_id: secondId, prd_quote: version.requirements[1].statement,
    conflict: 'the two cannot both hold',
    citations: [{ quote: 'a sentence that appears nowhere in the document at all, invented whole' }],
  }],
  removed: [{ req_id: knownId, prd_quote: version.requirements[0].statement, citations: [{ quote: realQuote }] }],
  new_open_questions: [{ question: 'who owns this?', citations: [{ quote: realQuote }] }],
};

const out = D.checkDelta({ prd_version_id: approvedId, doc_id: doc.doc_id, payload });

say('TC1', out.status === 'ok'
  && ['added', 'modified', 'contradicted', 'removed', 'new_open_questions'].every((k) => Array.isArray(out.delta[k])),
'the delta comes back in the five declared shapes', JSON.stringify(out.counts));

say('TC2', out.delta.modified[0]?.req_id === knownId
  && typeof out.delta.modified[0]?.prd_quote === 'string'
  && out.delta.modified[0]?.citations?.[0]?.match_kind !== undefined,
'a modified item carries BOTH sides: the req_id, the PRD quote, and a located citation',
`${out.delta.modified[0]?.req_id}, prd_quote_match=${out.delta.modified[0]?.prd_quote_match}`);

const idDrop = out.dropped.find((d) => d.item === 'REQ-NOT-IN-THIS-VERSION');
say('TC3', Boolean(idDrop) && /req_id/.test(idDrop.why),
  'a req_id that is not in the approved version is REJECTED and named',
  idDrop ? idDrop.why : '(it survived!)');

say('TC4', out.delta.modified.length === 1 && out.delta.modified[0].req_id === knownId,
  'CONTROL: the valid item in the SAME payload survives — TC3 is the id check, not a refusal to accept anything',
  `${out.delta.modified.length} modified item(s) kept`);

const cited = out.delta.added[0]?.citations?.[0];
say('TC5', cited?.match_kind === 'exact' && Number.isInteger(cited?.start_char),
  'every quote from the new document is located by the same matcher a citation uses',
  `${cited?.match_kind} at ${cited?.start_char}`);

const quoteDrop = out.dropped.find((d) => d.kind === 'contradicted');
say('TC6', Boolean(quoteDrop) && out.delta.contradicted.length === 0,
  'an item whose evidence cannot be located is DROPPED with a reason, never kept and flagged',
  quoteDrop ? quoteDrop.why : '(it survived!)');

const owned = D.assertModelDidNotSetOwnedFields({
  added: [{ statement: 'x', grounded: true, citations: [] }],
});
say('TC7', owned.length === 1 && owned[0].endsWith('.grounded'),
  'a model-set `grounded` is caught at the boundary, not cleaned up', owned.join(', '));

const noCite = D.checkDelta({
  prd_version_id: approvedId,
  doc_id: doc.doc_id,
  payload: { removed: [{ req_id: knownId, prd_quote: 'x', citations: [] }] },
});
say('TC8a', noCite.delta.removed.length === 0
  && /no citation at all/.test(noCite.dropped[0]?.why ?? ''),
'a `removed` with no evidence is dropped — silence never removes a requirement',
noCite.dropped[0]?.why ?? '(it survived!)');
say('TC8b', out.delta.removed.length === 1,
  'CONTROL: a `removed` that quotes the document survives, so TC8a is about the evidence');

// --- the ledger is part of the answer ----------------------------------------------------------

say('TC1b', out.dropped.length === 2 && out.total_items === 3,
  'the drops are RETURNED, not silent: a delta that quietly shrank is one nobody can audit',
  `${out.dropped.length} dropped, ${out.total_items} kept`);

close();
try { rmSync(dir, { recursive: true, force: true }); } catch { /* a temp file outliving a run is not a result */ }

console.log(`\n${checks - failures}/${checks} checks passed`);
console.log('\nWHAT THIS DOES NOT TEST: whether the model says anything sensible. Churn — the');
console.log('restatements it must stay silent about — is measured on a real run in this story');
console.log('and GRADED by C5 in E6-S5. This file is about what code refuses to accept.');
if (failures) process.exitCode = 1;
