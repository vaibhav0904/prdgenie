// Writes one week's report. WF5 calls the service; this is the same code by hand, so a
// stranger can produce the artefact without n8n running.
//
// Usage:
//   .\run.cmd review-ui\scripts\weekly-report.mjs                 this week
//   .\run.cmd review-ui\scripts\weekly-report.mjs 2026-08-24      the week containing that day
//   .\run.cmd review-ui\scripts\weekly-report.mjs --commentary="…" with a narrative to vet
//
// The narrative is optional on purpose: with none, the report says so and every figure still
// ships. That is the behaviour, not a degraded mode.

import { buildReport, writeReport, NARRATIVE_UNAVAILABLE } from '../weekly.mjs';

const args = process.argv.slice(2);
const week = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const commentary = args.find((a) => a.startsWith('--commentary='))?.slice('--commentary='.length);
const stdout = args.includes('--stdout');

const { figures, caveats, vet, body } = buildReport({ week, commentary });

if (stdout) {
  process.stdout.write(body);
} else {
  const path = writeReport(week, body);
  console.log(`week of ${figures.bounds.start} -> ${path}`);
  console.log(`  ${figures.approved} PRD(s) approved, ${caveats.length} caveat(s) computed`);
  for (const c of caveats) console.log(`    - ${c.id}: ${c.because}`);
  if (vet.commentary === NARRATIVE_UNAVAILABLE) {
    console.log(`  narrative: NOT INCLUDED (${vet.reason ?? 'none supplied'})`);
    for (const v of vet.violations.slice(0, 6)) {
      console.log(`      refused ${v.kind}: "${v.text}"`);
    }
  } else {
    console.log('  narrative: included, and it carries no figure');
  }
}
