// BUG-047. Nothing but a real measurement may write into `evals/results/`.
//
// That directory is the project's ledger: a dated result per eval-gated story, cited from the
// card that produced it. Controls and verifiers grade two or three times per run to prove a
// case can fail — working-out, not evidence — and one `check-all.mjs` sweep left **sixteen**
// throwaway files there. A ledger that also collects working-out is one you cannot trust to
// hold only what somebody decided to keep.
//
// `grade.mjs` has had `--results=` since E2, with a comment saying exactly what it is for.
// One control out of four used it. That is what a convention with no check looks like.
//
// THE LIST IS DERIVED. Every script that invokes `grade.mjs` is found by scanning, not typed
// here — so a control written next month is covered without anyone remembering this file.
//
// Usage:  .\run.cmd evals/harness/verify-results-hygiene.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIRS = ['evals/harness', 'review-ui/scripts'];

// The two callers that SHOULD write real results, each with the reason it is not working-out.
// A declaration, not an exemption: the reason prints on every run.
const PUBLISHES = {
  'spread.mjs': 'it publishes the three-run range that figures are quoted from (docs/reporting.md rule 6)',
};

let checks = 0; let failures = 0;
const say = (id, pass, msg, detail = '') => {
  checks++;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${msg}${detail ? `  — ${detail}` : ''}`);
};

// Find every invocation of the grader, and whether that invocation redirects its output.
const callers = [];
for (const dir of DIRS) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.mjs'))) {
    if (file === 'grade.mjs') continue;
    const text = readFileSync(join(dir, file), 'utf8');
    // Only executable invocations count — a filename inside an error message or a comment is
    // not a call, and treating it as one would make this check fail on helpful prose.
    const lines = text.split('\n').filter((l) => /['"]evals\/harness\/grade\.mjs['"]/.test(l)
      // …and it must be a CALL, not the filename sitting in a list. `verify-judge-isolation`
      // enumerates gate files and `verify-grading` names the instrument it checks; neither
      // runs the grader, and reading those as calls would make this check fail on prose.
      && /execFileSync|spawnSync|process\.execPath|\bnode\(/.test(l));
    if (!lines.length) continue;
    const redirected = lines.filter((l) => /--results=/.test(l));
    callers.push({ dir, file, calls: lines.length, redirected: redirected.length });
  }
}

// A seam for the control: pretend one more caller exists that does not redirect.
if (process.env.RESULTS_HYGIENE_INJECT) {
  callers.push({ dir: 'evals/harness', file: process.env.RESULTS_HYGIENE_INJECT, calls: 1, redirected: 0 });
}

say('TC1', callers.length > 0, 'the grader has callers, found by scanning rather than listed here',
  `${callers.length} file(s) invoke grade.mjs across ${DIRS.length} directories`);

const offenders = callers.filter((c) => !(c.file in PUBLISHES) && c.redirected < c.calls);
say('TC2', offenders.length === 0,
  'every caller that is not publishing a measurement redirects its grades away from the ledger',
  offenders.length
    ? offenders.map((c) => `${c.file} (${c.calls - c.redirected} of ${c.calls} calls unredirected)`).join('; ')
    : `${callers.length - Object.keys(PUBLISHES).length} control/verifier(s) redirect all their grades`);

// The declarations print every run: an audit that stops naming what it excused is an audit
// that has stopped covering it.
console.log('\nDeclared as publishing real results:');
for (const [file, why] of Object.entries(PUBLISHES)) {
  const found = callers.find((c) => c.file === file);
  console.log(`  ${file.padEnd(14)} ${found ? `${found.calls} call(s)` : 'NO LONGER CALLS THE GRADER'} — ${why}`);
}
say('TC3', Object.keys(PUBLISHES).every((f) => callers.some((c) => c.file === f)),
  'and every declaration still describes a real caller',
  'a declaration for a file that no longer grades is a rule protecting nothing');

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`
A FAILING CALLER IS NOT FIXED BY WIDENING THE DECLARATION. Pass \`--results=\` a temporary
directory, and make the reader follow the writer.`);
  process.exit(1);
}
console.log(`
WHAT THIS DOES NOT CHECK: whether a result in evals/results/ was worth keeping. It only
enforces that working-out does not land there by accident.`);
