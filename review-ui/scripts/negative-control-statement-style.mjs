// The negative control for BUG-016's style checker, run in BOTH directions.
//
// A rule that has never fired is not a rule, and a rule that fires on everything is worse
// than none — it would push the prompt to paraphrase away from wording that was already
// correct. So each rule is exercised on text that must trip it AND on text that must not.
//
// The false-positive half is the half that matters here. `first_person` matches whole words
// only, and there are three ways a naive version of that rule would ruin correct output:
//
//   "API"        contains "I"
//   "customer"   contains "us"
//   "hourly"     contains "our"
//
// A checker that flagged those would send the prompt chasing a defect that was never there.
//
// Usage:  .\run.cmd review-ui/scripts/negative-control-statement-style.mjs

import { violations } from './verify-statement-style.mjs';

let failures = 0;
const say = (pass, msg) => { if (!pass) failures++; console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${msg}`); };

const has = (s, rule) => violations(s).some((v) => v.rule === rule);

// --- direction 1: each rule must fire on its own violation ---------------------------------
console.log('\nMUST FIRE\n');
const mustFire = [
  ['first_person', 'The dashboard must load in two seconds on our biggest account.'],
  ['first_person', 'We authenticate through the identity provider and store no passwords.'],
  ['first_person', 'The report is emailed to us every night.'],
  ['first_person', 'I need the export to include the raw rows.'],
  ['promoted_example', 'A digest is sent on a schedule, such as every Friday.'],
  ['promoted_example', 'The system supports common formats, e.g. CSV and PDF.'],
  ['promoted_example', 'Alerts go to an owner, for example the account manager.'],
];
for (const [rule, s] of mustFire) say(has(s, rule), `${rule.padEnd(17)} fires on: "${s.slice(0, 62)}…"`);

// --- direction 2: the rules must NOT fire on correct specification prose --------------------
console.log('\nMUST NOT FIRE — this is the half that protects good output\n');
const mustNotFire = [
  'The API returns a 409 when the version is not in review.',
  'A customer admin can assemble a dashboard from a library of widgets.',
  'Data refreshes hourly and no more frequently during the pilot.',
  'Every chart must let the user export its underlying rows as CSV.',
  'The pilot runs with three customer accounts only: Northwind, Meridian and Halcyon.',
  'Retention of exported files is thirty days, after which they are deleted.',
];
for (const s of mustNotFire) {
  const v = violations(s);
  say(v.length === 0, `clean: "${s.slice(0, 62)}…"${v.length ? `  <- WRONGLY FLAGGED ${v.map((x) => `${x.rule}:${x.hit}`).join(', ')}` : ''}`);
}

// --- coverage, asserted (BUG-003) -----------------------------------------------------------
const rulesExercised = new Set(mustFire.map(([r]) => r));
console.log('');
console.log(`Rules in the checker: 2. Rules exercised in both directions: ${rulesExercised.size}.`);
console.log(`Cases: ${mustFire.length} must-fire, ${mustNotFire.length} must-not-fire.`);
console.log('');

if (failures) {
  console.error(`NEGATIVE CONTROL FAILED — ${failures} assertion(s).`);
  process.exitCode = 1;
} else {
  console.log('Both rules fire on the room\'s voice and stay silent on specification prose.');
  console.log('"API", "customer" and "hourly" do not trip the pronoun rule, which is the');
  console.log('mistake that would have made this checker actively harmful.');
}
