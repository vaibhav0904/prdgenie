// How many of this project's checkers can actually be shown to fail?
//
// FOUND BY WRITING IT ON A SLIDE (BUG-067). Slide 8 of the deck said "every checker has
// a negative control". Nothing computed that, nobody had counted, and it was not true: 50
// checkers, 20 with a dedicated control script and 19 with nothing at all. The claim had been true
// when it was a habit, and became false as checkers were added faster than controls.
//
// So the figure is now derived, printed, and quoted from here — the slide reads what this
// prints. A number in a deck that nothing recomputes is a number that was true once.
//
// THREE STATES, and the middle one is real rather than a concession:
//
//   script    a `negative-control-<stem>.mjs` beside it. The strongest form: it breaks the
//             SHIPPED checker against a copy of the tree and requires it to go red.
//   internal  a case inside the checker labelled CONTROL — the "and it does not cry wolf"
//             assertion that stops a checker which failed everything from passing its own
//             plants. Weaker, because a checker cannot plant a fault in itself, and real.
//   none      nothing. Named, every run, rather than counted and forgotten.
//
// This does NOT fail on `none` being non-zero. A gate that went red for an uncontrolled checker
// would be a gate against writing checkers, and this project would rather have a checker with no
// control than no checker. It fails when the number gets WORSE than the recorded floor — so the
// direction of travel is enforced and the level is not (evals/README: a ratchet, not a target).
//
// Usage:  .\run.cmd review-ui\scripts\check-control-coverage.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIRS = ['n8n/scripts', 'review-ui/scripts', 'evals/harness'];
const IS_CHECK = /^(check|verify|audit|recompute)-/;

// THE FLOOR, recorded from the day it was measured. Raising it is the point; lowering it is the
// thing this check exists to refuse. It is a count of the UNCONTROLLED, so it only ever goes down.
const FLOOR = { uncontrolled: 19, recorded: '2026-09-05' };

const scripts = DIRS.flatMap((d) => readdirSync(d)
  .filter((f) => f.endsWith('.mjs'))
  .map((f) => ({ dir: d, file: f, path: join(d, f) })));

const controlFor = (stem) => scripts.find((s) => s.file === `negative-control-${stem}.mjs`);

const checkers = scripts.filter((s) => IS_CHECK.test(s.file)).map((s) => {
  const stem = s.file.replace(/\.mjs$/, '').replace(IS_CHECK, '');
  const script = controlFor(stem);
  if (script) return { ...s, kind: 'script', by: script.path };
  // A case whose label says CONTROL. Read from the file that ships, not from a list here.
  const text = readFileSync(s.path, 'utf8');
  const cases = [...text.matchAll(/CONTROL[: ]/g)].length;
  if (cases) return { ...s, kind: 'internal', by: `${cases} CONTROL case(s) inside` };
  return { ...s, kind: 'none', by: '' };
});

const by = (k) => checkers.filter((c) => c.kind === k);
const uncontrolled = by('none');

console.log(`${checkers.length} checkers across ${DIRS.length} directories\n`);
console.log(`  ${String(by('script').length).padStart(3)}  have a negative-control SCRIPT that breaks the shipped checker`);
console.log(`  ${String(by('internal').length).padStart(3)}  have a CONTROL case inside them`);
console.log(`  ${String(uncontrolled.length).padStart(3)}  have neither`);
console.log('');

if (uncontrolled.length) {
  console.log('Uncontrolled, named rather than counted:');
  for (const c of uncontrolled) console.log(`    ${c.path}`);
  console.log('');
}

// THE SENTENCE THE DECK IS ALLOWED TO SAY, produced here so it cannot drift from the count.
const controlled = checkers.length - uncontrolled.length;
console.log('The defensible claim, generated from the count above:');
console.log(`    "${controlled} of the ${checkers.length} checkers have a control — `
  + `${by('script').length} a dedicated script, ${by('internal').length} a case inside. `
  + `${uncontrolled.length} have neither, and they are named."`);
console.log('');

// --- the ratchet ---------------------------------------------------------------------------------
if (uncontrolled.length > FLOOR.uncontrolled) {
  console.log(`FAIL  ${uncontrolled.length} uncontrolled checkers, up from ${FLOOR.uncontrolled} `
    + `recorded ${FLOOR.recorded}.`);
  console.log('');
  console.log('A new checker without a control is allowed; the total getting WORSE is not.');
  console.log('Write the control, or lower nothing and explain here why this one cannot have one.');
  process.exit(1);
}
if (uncontrolled.length < FLOOR.uncontrolled) {
  console.log(`PASS  ${uncontrolled.length} uncontrolled, DOWN from ${FLOOR.uncontrolled}.`);
  console.log(`      Lower the floor in this file to ${uncontrolled.length} so it cannot drift back.`);
  process.exit(0);
}
console.log(`PASS  ${uncontrolled.length} uncontrolled, level with the floor recorded ${FLOOR.recorded}.`);
