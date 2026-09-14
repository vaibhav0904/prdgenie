// BUG-016: does a requirement statement read like a specification, or like the transcript?
//
// Every automated check in this project passes on a badly-written statement. Grounding
// compares the QUOTE to `raw_text`; C1 matches by SPAN; C2's rules are about invention, PII
// and refusal. Nothing reads a statement as English — and the statement is the only field a
// PM actually reads. It took a human being asked "would you put this wording in a PRD?" to
// find that.
//
// This file does the part of that judgement a machine can honestly make, and NO MORE.
//
// TWO HARD RULES, and they are hard because they are unambiguous:
//   - first person      the room's voice has no place in a specification
//   - promoted example  "a digest, say every Friday" gets built as Friday
//
// ONE REPORTED FIGURE, deliberately not a rule:
//   - verbatim copy     a statement that appears word for word in the source
//
// The copy rate is NOT a failure, and the reason is worth stating: run against the output
// this bug was filed on, that rule fires on
//     "Every chart must let the user export its underlying rows as CSV."
// which is a perfectly good requirement that happens to be exactly what somebody said. **A
// verbatim statement is not automatically a copied one.** Making it a threshold would punish
// correct output and, worse, would push the model to paraphrase away from wording that was
// already right.
//
// Everything else Vaibhav found — truncated purpose clauses, circular definitions, dropped
// subjects, meeting shorthand — is not checkable here and goes back to him on a page (G6b).
//
// Usage:  .\run.cmd review-ui/scripts/verify-statement-style.mjs

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { all, get } from '../db.mjs';

const MANIFEST = 'evals/results/.last-run.json';

// Word-boundary matched, so "I" does not fire inside "API" and "us" does not fire inside
// "customer". Whole words only.
const FIRST_PERSON = /\b(our|ours|we|we're|us|my|mine|I|I'm)\b/i;
const PROMOTED_EXAMPLE = /\b(such as|e\.g\.|for example|for instance|say,)/i;

const norm = (s) => s.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();

/** The violations in one statement. Pure, so the negative control can call it directly. */
export function violations(statement) {
  const out = [];
  const fp = statement.match(FIRST_PERSON);
  if (fp) out.push({ rule: 'first_person', hit: fp[0] });
  const ex = statement.match(PROMOTED_EXAMPLE);
  if (ex) out.push({ rule: 'promoted_example', hit: ex[0] });
  return out;
}

const isVerbatim = (statement, rawText) =>
  norm(rawText).includes(norm(statement).replace(/[.]$/, ''));

// --- gather -------------------------------------------------------------------------------
//
// Everything below runs only when this file is the command. `violations()` is imported by
// the negative control, and without this guard that import silently re-ran the whole check —
// a second, unasked-for report in the middle of the control's output, reading a database the
// control had not looked at.
const RUN_DIRECTLY = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (!RUN_DIRECTLY) {
  // Imported for `violations()` alone.
} else {

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const fixtures = Object.entries(manifest.runs ?? {});

let examined = 0;
let stored = 0;
let copied = 0;
const offences = [];
const skipped = [];

for (const [fx, run] of fixtures) {
  if (!run.prd_version_id) { skipped.push(`${fx} (no version — parked without an id)`); continue; }
  const doc = get('SELECT raw_text FROM source_documents WHERE doc_id=?', [run.doc_id]);
  if (!doc) { skipped.push(`${fx} (document missing)`); continue; }

  const reqs = all(
    'SELECT req_id, statement FROM requirements WHERE prd_version_id=? ORDER BY req_id',
    [run.prd_version_id]);
  stored += reqs.length;

  for (const r of reqs) {
    examined++;
    if (isVerbatim(r.statement, doc.raw_text)) copied++;
    for (const v of violations(r.statement)) offences.push({ fx, ...v, statement: r.statement });
  }
}

// --- report -------------------------------------------------------------------------------

console.log(`Fixtures in the run: ${fixtures.length}`);
console.log(`Statements stored:   ${stored}`);
console.log(`Statements examined: ${examined}`);
if (skipped.length) console.log(`Skipped:             ${skipped.join(', ')}`);
console.log('');

console.log(`Verbatim copies:     ${copied} of ${examined}`
  + (examined ? ` (${((copied / examined) * 100).toFixed(1)}%)` : ''));
console.log('  Reported, never failed. A statement that matches the source word for word may');
console.log('  be exactly right — this number is a drift signal, not a defect count.');
console.log('');

let failed = false;

// Coverage, asserted rather than assumed (BUG-003). "0 offences" over 0 statements is not a
// pass; it is a check that ran on nothing.
if (examined === 0) {
  console.error('FAIL  no statements examined — the check ran on nothing.');
  failed = true;
} else if (examined !== stored) {
  console.error(`FAIL  examined ${examined} of ${stored} stored statements.`);
  failed = true;
}

if (offences.length) {
  failed = true;
  console.error(`FAIL  ${offences.length} statement(s) break a hard rule:`);
  for (const o of offences) {
    console.error(`  [${o.fx}] ${o.rule} — "${o.hit}"`);
    console.error(`      ${o.statement}`);
  }
  console.error('');
  console.error('The room\'s voice and the room\'s examples do not belong in a specification.');
  console.error('Fix the prompt, never the checker.');
} else if (!failed) {
  console.log(`PASS  ${examined} statements, no first person, no promoted examples.`);
  console.log('');
  console.log('This is the machine-checkable HALF of BUG-016. Truncated purpose clauses,');
  console.log('circular definitions, dropped subjects and meeting shorthand are not checkable');
  console.log('here and go to Vaibhav on a page. A green run here does not close that card.');
}

process.exitCode = failed ? 1 : 0;

}
