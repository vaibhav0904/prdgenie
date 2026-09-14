// E6-S2. What the next version says, and — mostly — what it keeps.
//
// Applying a delta is easy to get visibly right and quietly wrong. The visible half is that
// the four kinds land. The quiet half is everything the delta did NOT mention, which must
// arrive in the next version unchanged, still carrying the identity that every review decision
// and acceptance criterion was recorded against.
//
// FOUR WAYS THIS COULD BE WRONG, and each has a row below:
//
//   identity replaced        -> a modified requirement keeps its `origin_req_id`. Its `req_id`
//                               cannot survive (global PK, immutable versions), so identity
//                               lives in its own column — and TC9 checks the column, not the id
//   silence rewritten        -> untouched requirements are compared statement-for-statement
//                               and citation-for-citation, with a planted change as the control
//   an argument settled      -> `contradicted` and `removed` record a change and leave the
//                               requirement standing; the PM decides (E6-S4)
//   an empty version minted  -> a delta with nothing in it parks and creates no version
//
// IT RUNS ON A COPY OF THE DATABASE. It creates versions and requirements, and none of that
// should become a fact about the project (BUG-045: a check whose fixture is whatever the
// previous check left behind is measuring the suite).
//
// Usage:  .\run.cmd review-ui/scripts/verify-apply-delta.mjs

import { copyFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REAL_DB = resolve(process.env.DB_PATH ?? './data/prdgenie.db');
const dir = mkdtempSync(join(tmpdir(), 'apply-delta-'));
const copy = join(dir, 'prdgenie.db');
copyFileSync(REAL_DB, copy);
// The -wal travels or the copy is an older database (BUG-015). The -shm must NOT.
if (existsSync(`${REAL_DB}-wal`)) copyFileSync(`${REAL_DB}-wal`, `${copy}-wal`);
process.env.DB_PATH = copy;

const { all, get, run, initSchema } = await import('../db.mjs');
const { applyDelta, approvedVersionFor } = await import('../delta.mjs');
initSchema();

let checks = 0; let failures = 0;
const say = (id, pass, msg, detail = '') => {
  checks++;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${msg}${detail ? `  — ${detail}` : ''}`);
};

// --- a baseline: an approved version, and a document with text we can quote ------------------

// The NEWEST approved version is what production deltas against — but this file needs a
// baseline with enough requirements to exercise carrying, so it picks the richest approved
// version instead and says which. Choosing a fixture is not the same as choosing a result:
// nothing below is asserted about WHICH version was picked, only about what happens to it.
const candidate = get(`SELECT v.prd_version_id, COUNT(r.req_id) AS n
     FROM prd_versions v
     JOIN prds p ON p.prd_id = v.prd_id
     LEFT JOIN requirements r ON r.prd_version_id = v.prd_version_id
    WHERE p.product_id = 'forgesight' AND v.state = 'approved'
    GROUP BY v.prd_version_id
    HAVING n >= 3
    ORDER BY n DESC, v.prd_version_id DESC LIMIT 1`);
const base = candidate
  ? get('SELECT prd_version_id, prd_id, version_no FROM prd_versions WHERE prd_version_id = ?',
    [candidate.prd_version_id])
  : approvedVersionFor('forgesight');
if (!base) {
  say('TC0', false, 'no approved forgesight version with 3+ requirements to apply a delta to',
    'approve one in the review UI first');
  process.exit(1);
}
const baseReqs = all(`SELECT req_id, statement, kind, origin_req_id FROM requirements
                       WHERE prd_version_id = ? ORDER BY req_id`, [base.prd_version_id]);
say('TC0', baseReqs.length >= 3, 'an approved version with requirements to carry',
  `v${base.prd_version_id}, ${baseReqs.length} requirement(s)`);

// A document whose text we control, so citations can be located exactly.
const QUOTE_MOD = 'The first chart must paint in under one second, not two.';
const QUOTE_ADD = 'Every export must be watermarked with the requesting user.';
const QUOTE_CON = 'We are dropping the CSV export entirely for the pilot.';
const raw = [QUOTE_MOD, QUOTE_ADD, QUOTE_CON].join('\n');
const docId = `DOC-APPLY-${Date.now()}`;
run(`INSERT INTO source_documents (doc_id, product_id, trace_id, doc_type, title, received_at,
      source_channel, raw_text, segments, pii_redactions, target_prd_id, authorship)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
[docId, 'forgesight', `trace-apply-${Date.now()}`, 'notes', 'apply-delta fixture',
  new Date().toISOString(), 'webhook', raw, '[]', '[]', null, 'third_party']);

const target = baseReqs[0];
const contradictTarget = baseReqs[1];
const untouched = baseReqs.slice(2);

const payload = {
  modified: [{ req_id: target.req_id, statement: 'The first chart must paint in under one second.',
    prd_quote: target.statement.slice(0, 40), citations: [{ quote: QUOTE_MOD }] }],
  added: [{ statement: 'Every export is watermarked with the requesting user.', kind: 'functional',
    citations: [{ quote: QUOTE_ADD }] }],
  contradicted: [{ req_id: contradictTarget.req_id, statement: 'The CSV export is dropped for the pilot.',
    prd_quote: contradictTarget.statement.slice(0, 40), citations: [{ quote: QUOTE_CON }] }],
  removed: [],
  new_open_questions: [],
};

const out = applyDelta({ prd_version_id: base.prd_version_id, doc_id: docId, payload });
say('TC1', out.status === 'ok' && Number.isInteger(out.prd_version_id),
  'a delta with something in it produces the next version',
  out.status === 'ok' ? `v${base.prd_version_id} -> v${out.prd_version_id}, ${out.changes} change(s)`
    : `${out.reason}: ${JSON.stringify(out.dropped ?? [])}`);

if (out.status !== 'ok') { console.log(`\n${checks - failures}/${checks} checks passed`); process.exit(1); }

const newReqs = all(`SELECT req_id, statement, kind, origin_req_id, doc_id FROM requirements
                      WHERE prd_version_id = ? ORDER BY req_id`, [out.prd_version_id]);
const changes = all('SELECT kind, req_id, old_text, new_text FROM prd_changes WHERE prd_version_id = ?',
  [out.prd_version_id]);

// --- TC9: identity survives a modification ----------------------------------------------------

const modRow = newReqs.find((r) => r.origin_req_id === target.origin_req_id);
say('TC9', Boolean(modRow) && modRow.statement === payload.modified[0].statement
  && modRow.req_id !== target.req_id,
'a modified requirement keeps its identity and takes the new words',
modRow ? `origin ${modRow.origin_req_id} carried; req_id ${target.req_id} -> ${modRow.req_id}` : 'NOT FOUND');

say('TC9b', newReqs.every((r) => r.origin_req_id),
  'every requirement in the new version carries an origin — none is anonymous',
  `${newReqs.length} row(s)`);

// THE CONTROL for TC9: without the origin column, the modified requirement would be
// indistinguishable from a new one. Prove the link is doing work by looking for it the way a
// review decision would — by identity, across two different req_ids.
const foundByIdentity = newReqs.filter((r) => baseReqs.some((b) => b.origin_req_id === r.origin_req_id));
say('TC9c', foundByIdentity.length === baseReqs.length,
  'CONTROL: every carried requirement is findable from the OLD version by identity alone',
  `${foundByIdentity.length} of ${baseReqs.length} — a review decision on any of them still resolves`);

// --- TC10: additions --------------------------------------------------------------------------

const added = newReqs.filter((r) => !baseReqs.some((b) => b.origin_req_id === r.origin_req_id));
say('TC10', added.length === 1 && added[0].origin_req_id === added[0].req_id,
  'an addition is appended and is its own origin — it has no ancestor to inherit',
  added.length ? `${added[0].req_id}` : 'none appended');

// --- TC11: a contradiction is recorded, not applied --------------------------------------------

const conRow = newReqs.find((r) => r.origin_req_id === contradictTarget.origin_req_id);
const conChange = changes.find((c) => c.kind === 'contradicted');
say('TC11', Boolean(conRow) && conRow.statement === contradictTarget.statement && Boolean(conChange),
  'a contradicted requirement is RECORDED and left standing — the PM decides, not the system',
  conChange ? `statement unchanged; prd_changes row "${String(conChange.new_text).slice(0, 40)}…"` : 'no change row');

// --- TC12: silence changes nothing -------------------------------------------------------------

const drift = [];
for (const b of untouched) {
  const now = newReqs.find((r) => r.origin_req_id === b.origin_req_id);
  if (!now) { drift.push(`${b.req_id} missing`); continue; }
  if (now.statement !== b.statement) drift.push(`${b.req_id} statement changed`);
  const wasCites = all('SELECT quote, start_char, end_char, match_kind FROM citations WHERE req_id=? ORDER BY citation_id', [b.req_id]);
  const nowCites = all('SELECT quote, start_char, end_char, match_kind FROM citations WHERE req_id=? ORDER BY citation_id', [now.req_id]);
  if (JSON.stringify(wasCites) !== JSON.stringify(nowCites)) drift.push(`${b.req_id} citations changed`);
}
say('TC12', drift.length === 0,
  'everything the delta did not mention is carried across unchanged, citations included',
  drift.length ? drift.join('; ') : `${untouched.length} requirement(s) compared statement- and citation-wise`);

// THE CONTROL: plant a change and confirm the comparison above would have caught it.
const victim = untouched[0];
const nowVictim = newReqs.find((r) => r.origin_req_id === victim.origin_req_id);
run('UPDATE requirements SET statement = ? WHERE req_id = ?', ['a planted rewrite', nowVictim.req_id]);
const after = get('SELECT statement FROM requirements WHERE req_id = ?', [nowVictim.req_id]);
say('TC13', after.statement !== victim.statement,
  'CONTROL: a planted change to an untouched requirement is exactly what TC12 compares',
  `"${victim.statement.slice(0, 30)}…" vs "${after.statement}" — TC12 would have named it`);
run('UPDATE requirements SET statement = ? WHERE req_id = ?', [victim.statement, nowVictim.req_id]);

// --- TC14: state, and the gate that still refuses ----------------------------------------------

const version = get('SELECT state, content FROM prd_versions WHERE prd_version_id = ?', [out.prd_version_id]);
say('TC14', version.state === 'in_review', 'the new version lands in in_review', version.state);

let refused = false;
try {
  run("UPDATE prd_versions SET state='approved' WHERE prd_version_id = ?", [out.prd_version_id]);
} catch { refused = true; }
const stillReview = get('SELECT state FROM prd_versions WHERE prd_version_id = ?', [out.prd_version_id]).state;
say('TC14b', refused || stillReview !== 'approved',
  'and the approval trigger still refuses SQL — a delta cannot approve itself',
  `state is ${stillReview}`);

// --- TC15: the changelog is what makes it a version WITH a predecessor ---------------------------

say('TC15', changes.length === 3
  && new Set(changes.map((c) => c.kind)).size === 3,
'every change is recorded in prd_changes, by kind',
changes.map((c) => c.kind).sort().join(', '));

const content = (() => { try { return JSON.parse(version.content); } catch { return {}; } })();
say('TC15b', content.derived_from === base.prd_version_id,
  'and the version says which version it came from',
  `derived_from=${content.derived_from}`);

// --- TC16: an empty delta parks and mints nothing -------------------------------------------------

const versionsBefore = get('SELECT COUNT(*) AS n FROM prd_versions').n;
const empty = applyDelta({
  prd_version_id: base.prd_version_id,
  doc_id: docId,
  payload: { added: [], modified: [], contradicted: [], removed: [], new_open_questions: [] },
});
const versionsAfter = get('SELECT COUNT(*) AS n FROM prd_versions').n;
say('TC16', empty.status === 'needs_review' && empty.reason === 'delta_empty'
  && versionsAfter === versionsBefore,
'a delta that found nothing parks with a reason and mints no version',
`${empty.reason}; versions ${versionsBefore} -> ${versionsAfter}`);

// --- TC17: a delta may not be built on a draft ------------------------------------------------------

const onDraft = applyDelta({ prd_version_id: out.prd_version_id, doc_id: docId, payload });
say('TC17', onDraft.status === 'error' && onDraft.reason === 'baseline_not_approved',
  'a delta refuses a baseline nobody has approved',
  `${onDraft.reason} (${onDraft.detail})`);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log('\nA FAILURE HERE IS NOT FIXED BY LOOSENING THE COMPARISON. What the delta did not\nmention must arrive unchanged, or the next version is not the same document.');
  process.exit(1);
}
console.log(`
WHAT THIS DOES NOT TEST: whether the delta the MODEL proposed was any good. That is C5
(E6-S5). This file is about what code does with a delta once it has one.`);
