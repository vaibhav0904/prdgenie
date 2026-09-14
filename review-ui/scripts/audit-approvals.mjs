// Every approved PRDVersion, checked against the marks a real sign-off leaves behind.
//
// BUG-049's fix put a trigger on the insert side, so nothing can be *born* approved any more.
// This asks the other question, of the rows that already exist: **does each approval have a
// sign-off to show for it?**
//
// The trigger is a guarantee about the future. This is a measurement of the past, and the two
// are not substitutes — a card that says "expected zero" has not measured anything.
//
// WHAT A REAL SIGN-OFF LEAVES:
//
//   an `approved` event, component `review_ui`, naming the version   — written by the endpoint
//   a review session on that version                                 — opened before deciding
//
// WHAT IT DOES NOT LEAVE, and why looking for it is a mistake: a `signoff_marker` row. The
// marker is a ONE-SHOT TOKEN, inserted and deleted inside `signOff`'s own transaction, so
// "approved with no marker" is the normal state of every version ever approved. The first
// version of this audit asked for it and reported 53 of 53 versions as suspect. **A census
// that indicts everything has asked the wrong question**, not found a catastrophe.
//
// Usage:  .\run.cmd review-ui/scripts/audit-approvals.mjs

import { all, get } from '../db.mjs';

const approved = all(`SELECT v.prd_version_id, v.prd_id, v.trace_id, v.approved_at
                        FROM prd_versions v WHERE v.state = 'approved'
                       ORDER BY v.prd_version_id`);

const hasEvent = (id) => Boolean(get(
  "SELECT 1 AS y FROM events WHERE name='approved' AND component='review_ui' AND detail=?",
  [`prd_version_id=${id}`]));
const hasSession = (id) => get(
  'SELECT COUNT(*) AS n FROM review_sessions WHERE prd_version_id=?', [id]).n > 0;

const noEvent = approved.filter((v) => !hasEvent(v.prd_version_id));
const noSession = approved.filter((v) => !hasSession(v.prd_version_id));
const events = get("SELECT COUNT(*) AS n FROM events WHERE name='approved'").n;

console.log(`approved versions:                        ${approved.length}`);
console.log(`'approved' events in the log:             ${events}`);
console.log(`versions with no sign-off event:          ${noEvent.length}`);
console.log(`versions with no review session:          ${noSession.length}`);
console.log('');

let failed = false;

// Coverage asserted, not assumed (BUG-003/019). Zero approved versions is not a clean bill of
// health — it is an audit with nothing to audit, and it should say so rather than print PASS.
if (approved.length === 0) {
  console.error('FAIL  no approved versions to audit. This proves nothing about the gate.');
  failed = true;
}

for (const v of [...new Set([...noEvent, ...noSession])]) {
  failed = true;
  console.error(`FAIL  v${v.prd_version_id} (${v.prd_id}) approved ${v.approved_at ?? 'at an unrecorded time'}`
    + `${hasEvent(v.prd_version_id) ? '' : ' — no sign-off event'}`
    + `${hasSession(v.prd_version_id) ? '' : ' — no review session'}`);
}

if (failed && (noEvent.length || noSession.length)) {
  console.error('');
  console.error('An approved version with no sign-off behind it is either a bypass or a check');
  console.error('that called signOff() directly on the live database. Find out which before');
  console.error('assuming the second — the first is the thing this project exists to prevent.');
} else if (!failed) {
  console.log(`PASS  all ${approved.length} approved versions carry a sign-off event and a review session.`);
  console.log('');
  console.log('This describes the database as it stands. It cannot speak for a version that was');
  console.log('approved and then deleted, and it is not a substitute for the trigger that stops');
  console.log('the next one (prd_versions_born_unreviewed, BUG-049).');
}

process.exitCode = failed ? 1 : 0;
