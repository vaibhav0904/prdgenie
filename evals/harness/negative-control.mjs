// Breaks the ground truth on purpose, watches the checker go red, and puts it back.
//
// Replaces four hand-run commands in E1-S3's UAT, for two reasons (BUG-010):
//
//  1. The hand-run version did not work. Its PowerShell `-replace '"quotes": \["'` matched
//     nothing — the labels are pretty-printed, so the bracket and the quote are on
//     different lines. It corrupted nothing, the checker stayed green, and the "control"
//     passed while testing nothing. Fourth time this project has produced a check that
//     could not fail.
//  2. Four hand-run steps leave the repository broken if you stop after step two. This
//     restores in a `finally`, and verifies the restore byte-for-byte.
//
// Usage:  run.cmd evals\harness\negative-control.mjs

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const TARGET = 'evals/datasets/labels/T1.labels.json';
const CHECKER = 'evals/harness/verify-labels.mjs';

const runChecker = () => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [CHECKER], { encoding: 'utf8' }) };
  } catch (err) {
    return { code: err.status ?? -1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
};

// Read as BYTES and restore as bytes. Never round-trip this file through a text editor or
// through PowerShell's Get-Content/Set-Content, which re-encodes UTF-8 as ANSI and would
// corrupt it in a way that outlives the control (seen for real in E2-S2).
const original = readFileSync(TARGET);

console.log('Negative control: break the answer key, confirm the checker notices, restore.\n');

const before = runChecker();
console.log(`  1. clean          exit=${before.code}  ${before.code === 0 ? 'green, as expected' : 'ALREADY RED — stop and read the output below'}`);
if (before.code !== 0) {
  console.error(before.out);
  process.exit(1);
}

let broken;
try {
  const labels = JSON.parse(original.toString('utf8'));
  const victim = labels.expected_requirements[0];
  const wasQuote = victim.quotes[0];
  victim.quotes[0] = `ZZZ ${wasQuote}`;   // no longer a substring of the fixture
  writeFileSync(TARGET, JSON.stringify(labels, null, 2));

  broken = runChecker();
  const namesFixture = /T1/.test(broken.out);
  const namesQuote = broken.out.includes('ZZZ');
  console.log(`  2. one quote broken  exit=${broken.code}  `
    + `${broken.code !== 0 ? 'RED, as required' : 'STILL GREEN — the checker cannot fail'}`);
  console.log(`     names the fixture: ${namesFixture}   quotes the offending text: ${namesQuote}`);
  if (broken.code === 0 || !namesFixture || !namesQuote) {
    console.error('\n--- checker output ---\n' + broken.out);
  }
} finally {
  writeFileSync(TARGET, original);
}

const after = runChecker();
const identical = readFileSync(TARGET).equals(original);
console.log(`  3. restored       exit=${after.code}  ${after.code === 0 ? 'green again' : 'STILL RED'}`);
console.log(`     file is byte-identical to before: ${identical}`);

const pass = before.code === 0 && broken.code !== 0
  && /T1/.test(broken.out) && broken.out.includes('ZZZ')
  && after.code === 0 && identical;

console.log(`\n${pass ? 'PASS' : 'FAIL'} — the ground-truth checker ${pass ? 'was seen to fail, and recovered' : 'did not behave as a check must'}.`);
process.exit(pass ? 0 : 1);
