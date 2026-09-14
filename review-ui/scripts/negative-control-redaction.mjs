// The negative controls for BUG-008 and BUG-009.
//
// A check never seen to fail is an assumption (BUG-001). This puts each defect back, one at
// a time, and requires `verify-redaction.mjs` to go RED naming what it should name. Then it
// restores the file and asserts byte-identity — not "looks right", identical bytes, because
// a control that leaves the codebase slightly different is a control that shipped a change.
//
// Each defect is reintroduced by editing the real module, so what is exercised is the code
// the door actually imports, not a copy of the rule.
//
// Usage:  .\run.cmd review-ui/scripts/negative-control-redaction.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const TARGET = 'review-ui/normalize.mjs';
const original = readFileSync(TARGET, 'utf8');

let failures = 0;
const say = (pass, msg) => { if (!pass) failures++; console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${msg}`); };

function runCheck() {
  try {
    return { code: 0, out: execFileSync(process.execPath, ['review-ui/scripts/verify-redaction.mjs'], { encoding: 'utf8' }) };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

// Replace the statement beginning at `anchor` and ending at the first `;` line break.
function swap(source, anchor, replacement) {
  const start = source.indexOf(anchor);
  if (start < 0) throw new Error(`anchor not found in ${TARGET}: ${anchor}`);
  const end = source.indexOf('\n', source.indexOf(';', start));
  if (end < 0) throw new Error(`could not find the end of the statement at: ${anchor}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

const SCENARIOS = [
  {
    card: 'BUG-008',
    title: 'the phone pattern, reverted to matching 3-4 digit groups',
    apply: (s) => swap(s, 'const PHONE_RE = new RegExp(',
      String.raw`const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3,4}[\s.-]\d{3,4}(?:[\s.-]\d{3,4})?/g;`),
    mustFail: ['TC1', 'TC5'],
    mustPass: ['TC4', 'TC12', 'TC13'],
    mustName: ['+44 20 7946 0812', '07700 900412', '+39 02 8088 1140', '9 780 141 036 137'],
    note: 'TC5 is here because the old rule ALSO over-redacted — it mangled an ISBN — which the card did not record until this control was run.',
  },
  {
    // The over-redaction control. BUG-009's own scenario is gone — names are no longer
    // redacted at all — so what needs proving now is the opposite: that the answer key can
    // still fail when redaction takes too much.
    //
    // This adds the crudest possible over-redactor, a rule that eats every capitalised
    // word. Before `expected_retentions` existed this would have scored a clean 100% on
    // H2, because a list of things that must GO is satisfied completely by removing
    // everything. It must now be a red case.
    card: 'over-redaction',
    title: 'a rule that redacts every capitalised word',
    // Appended to the rule list rather than swapped in, because `swap` ends a statement at
    // the first `;` and would cut this array in half.
    apply: (s) => {
      const anchor = "  { kind: 'phone', re: PHONE_RE },\n];";
      if (!s.includes(anchor)) throw new Error('PII_RULES anchor not found');
      return s.replace(anchor,
        "  { kind: 'phone', re: PHONE_RE },\n  { kind: 'capitalised', re: /\\b[A-Z][a-z]{2,}\\b/g },\n];");
    },
    mustFail: ['TC12'],
    mustPass: ['TC4', 'TC1'],
    mustName: ['Northwind Logistics', 'Priya'],
    note: 'TC4 and TC1 must still pass, because the contact details are still being removed. That is the point: without the retention half, this redactor looks perfect.',
  },
];

const before = runCheck();
console.log(`baseline: exit ${before.code}`);
say(before.code === 0, 'the check is green before anything is broken');

for (const sc of SCENARIOS) {
  console.log(`\n${sc.card} — ${sc.title}`);
  let broken;
  try {
    writeFileSync(TARGET, sc.apply(original));
    broken = runCheck();
  } finally {
    writeFileSync(TARGET, original);
  }

  say(broken.code !== 0, `the check FAILS (exit ${broken.code})`);
  for (const id of sc.mustFail) {
    say(new RegExp(`FAIL\\s+${id}\\b`).test(broken.out), `${id} goes red`);
  }
  for (const id of sc.mustPass) {
    say(new RegExp(`PASS\\s+${id}\\b`).test(broken.out), `${id} still passes — the control is scoped`);
  }
  const named = sc.mustName.filter((n) => broken.out.includes(n));
  say(named.length === sc.mustName.length,
    `the failure names what leaked (${named.length}/${sc.mustName.length})`);
  console.log(`        ${sc.note}`);
}

// --- restore, and prove it -------------------------------------------------------------
console.log();
const restored = readFileSync(TARGET, 'utf8');
say(restored === original, `${TARGET} restored byte-for-byte (${restored.length} bytes)`);
const after = runCheck();
say(after.code === 0, `the check is green again (exit ${after.code})`);

console.log();
if (failures) {
  console.error(`NEGATIVE CONTROL FAILED — ${failures} assertion(s).`);
  console.error('A control that does not go red proves nothing about the check it guards.');
  process.exitCode = 1;
} else {
  console.log('Both controls passed: each check discriminates, and the tree is unchanged.');
}
