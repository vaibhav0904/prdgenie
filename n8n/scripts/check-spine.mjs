// One spine: nothing downstream of the door knows which door a document came through.
//
// `docs/architecture.md` has claimed this since E1 and CLAUDE.md repeats it. Until now it was
// an intention — the kind that stays true while somebody is watching and stops being true in
// the commit where a branch is quicker than a fix.
//
// This greps the spine for the three fields a door records and nothing after it may read:
//
//   doc_type        transcript | notes | email | feature_brief
//   source_channel  form | webhook
//   authorship      first_party | third_party   (E4-S6)
//
// **A hit outside the door is a failure**, and the check names the file and the line.
//
// WHAT THE RULE ACTUALLY FORBIDS, because a grep cannot tell these apart on its own:
//
//   BRANCHING on one of these fields, so the pipeline behaves differently depending on which
//   door a document came through — forbidden, everywhere, without exception.
//
//   CARRYING one forward as a recorded fact — a query that returns it to the screen, a flag
//   stamped onto a row — which is what the fields exist for.
//
// So a line may be exempted with `// spine-ok: <reason>` on it or on the line above, and
// **the reason is
// required**: an exemption with no reason is refused, exactly like a review decision with no
// reason. Every exemption is one line, visible in the diff that adds it, and listed by this
// check on every run — which is the opposite of an allow-list that grows a file at a time and
// is never read again.
//
// WHAT IT DOES NOT DO. It cannot prove a fifth document type would be a one-file change; that
// needs a fifth type. E5-S4 asks for the walkthrough to be argued in writing instead, and it
// is, in the story's Outcome.
//
// Usage:  .\run.cmd n8n/scripts/check-spine.mjs

import { readFileSync, existsSync, readdirSync } from 'node:fs';

const FORBIDDEN = ['doc_type', 'source_channel', 'authorship'];

// THE DOOR, and the two places a recorded fact is legitimately read: storage, and the screen
// that shows a human what kind of document they are looking at. Everything else is spine.
const ALLOWED = new Set([
  'n8n/workflows/WF1-ingest.json',      // the door itself
  'review-ui/normalize.mjs',            // the door's canonicaliser
  'review-ui/ingest.mjs',               // the insert
  'review-ui/db.mjs',                   // storage and migrations: the column has to be declared somewhere
  'review-ui/review.mjs',               // the screen's figures
  'review-ui/public/review.html',       // the screen
  'review-ui/public/index.html',        // the inbox
]);

/** A line-level exemption, and the reason it carries. */
// Either comment syntax: a line inside a SQL template can only carry a `--` comment.
const EXEMPTION = new RegExp('(?://|--)\\s*spine-ok:\\s*(.*)$');

/** Every file the spine is made of, whether or not it currently exists. */
function spineFiles() {
  const workflows = existsSync('n8n/workflows')
    ? readdirSync('n8n/workflows').filter((f) => f.endsWith('.json')).map((f) => `n8n/workflows/${f}`)
    : [];
  const modules = existsSync('review-ui')
    ? readdirSync('review-ui').filter((f) => f.endsWith('.mjs') || f === 'server.js').map((f) => `review-ui/${f}`)
    : [];
  return [...workflows, ...modules].filter((f) => !ALLOWED.has(f));
}

const files = spineFiles();
const hits = [];
const exemptions = [];
let scanned = 0;
const missing = [];

for (const file of files) {
  if (!existsSync(file)) { missing.push(file); continue; }
  scanned++;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // A mention inside a comment is not a branch. This is deliberately generous in one
    // direction only: it can miss a comment-shaped branch, and it cannot invent a hit.
    const code = line.replace(/^\s*(\/\/|\*|--).*/, '');
    // The exemption may sit on the line itself or on the line above it. A trailing comment
    // inside a multi-line SQL template would end up inside the query, so the line above is
    // the only place some of these can go.
    const exempt = line.match(EXEMPTION) ?? (lines[i - 1] ?? '').match(EXEMPTION);
    for (const field of FORBIDDEN) {
      if (!code.includes(field)) continue;
      if (!exempt) {
        hits.push({ file, line: i + 1, field, text: line.trim().slice(0, 110) });
        continue;
      }
      const reason = exempt[1].trim();
      // An exemption with no reason is refused, exactly like a review decision with none.
      if (!reason) {
        hits.push({ file, line: i + 1, field, text: 'spine-ok with no reason — an exemption nobody justified' });
      } else {
        exemptions.push({ file, line: i + 1, field, reason });
      }
    }
  });
}

console.log('One spine — nothing after the door reads which door it was\n');
console.log(`Fields checked:   ${FORBIDDEN.join(', ')}`);
console.log(`Files on the spine: ${files.length}`);
console.log(`Files scanned:      ${scanned}`);
console.log(`Allowed (the door and the screen): ${[...ALLOWED].length}`);
if (missing.length) console.log(`Listed but absent:  ${missing.join(', ')}`);
console.log('');

// Printed every run, whether or not anything failed. An exemption that stops being read is an
// allow-list with extra steps.
if (exemptions.length) {
  console.log(`${exemptions.length} line-level exemption(s), each with its reason:`);
  for (const e of exemptions) console.log(`  ${e.file}:${e.line}  ${e.field} — ${e.reason}`);
  console.log('');
}

// Coverage asserted, not assumed: "0 hits" over 0 files is not a pass (BUG-003).
let failed = false;
if (scanned === 0) {
  console.error('FAIL  no spine files were scanned — the check ran on nothing.');
  failed = true;
} else if (scanned !== files.length) {
  console.error(`FAIL  scanned ${scanned} of ${files.length} spine files.`);
  failed = true;
}

if (hits.length) {
  failed = true;
  console.error(`FAIL  ${hits.length} reference(s) to a door-only field on the spine:`);
  for (const h of hits) console.error(`  ${h.file}:${h.line}  ${h.field}\n      ${h.text}`);
  console.error('');
  console.error('A door records these for the operator. Nothing after it may branch on them —');
  console.error('that is what makes one spine one spine (docs/architecture.md).');
} else if (!failed) {
  console.log(`PASS  ${scanned} spine files, no reference to ${FORBIDDEN.join(', ')}.`);
  console.log('');
  console.log('This proves no file MENTIONS them. It does not prove a fifth document type is a');
  console.log('one-file change — that needs a fifth type, and E5-S4 argues it in writing instead.');
}

process.exitCode = failed ? 1 : 0;
