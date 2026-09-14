// E8-S2's instrument check.
//
// The property under test is not "the report has caveats" — any prose can be added. It is
// that a caveat **removes itself** when the world changes, with nobody editing anything. So
// both caveats are forced in BOTH directions, which is the only way to tell a computed
// sentence from a typed one.
//
// It makes no provider call and writes no report into `reports/` (BUG-001: a verifier may not
// leave a row another reads as a defect — here, a file another reader takes for a real week).

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildReport, weekBounds, weekFigures, caveatsFor, vetCommentary, findFigures,
  renderReport, reportPath, NARRATIVE_UNAVAILABLE, SMALL_WEEK,
} from '../weekly.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0; let fail = 0;
const ok = (id, name, cond, ev = '') => {
  if (cond) { pass++; console.log(`PASS  ${id.padEnd(6)}${name.padEnd(72)}${ev}`); }
  else { fail++; console.error(`FAIL  ${id.padEnd(6)}${name.padEnd(72)}${ev}`); }
};

const FULL = '2026-09-03';   // the week everything happened in
const EMPTY = '2026-08-26';  // the week before it, in which nothing did

// --- TC1: the file, and the Monday it is named for -------------------------------------------

const b = weekBounds(FULL);
ok('TC1', 'a week starts on Monday and runs seven days',
  b.start === '2026-08-31' && b.end === '2026-09-07', `${b.start} .. ${b.end}`);
ok('TC1', 'the prior week is the seven days before it',
  b.priorStart === '2026-08-24' && b.priorEnd === b.start, `${b.priorStart} .. ${b.priorEnd}`);
ok('TC1', 'the report is named for its Monday',
  reportPath(FULL).endsWith('weekly-2026-08-31.md'), 'weekly-2026-08-31.md');
ok('TC1', 'a report WF5 wrote is on disk',
  existsSync(join(REPO, 'reports', 'weekly-2026-08-31.md')), 'produced by the cron, not by hand');

// --- TC2 / TC14: figures and trends -----------------------------------------------------------

const full = buildReport({ week: FULL, generatedAt: 'FIXED' });
const empty = buildReport({ week: EMPTY, generatedAt: 'FIXED' });

ok('TC2', 'every metric in the report carries the SQL that produced it',
  Object.values(full.figures.now).every((m) => typeof m.sql === 'string' && /SELECT/i.test(m.sql)),
  '5 of 5');
ok('TC14', 'each figure is stated against the prior week',
  (full.body.match(/no prior week to compare|unchanged|up from|down from|no data this week/g) ?? []).length >= 5,
  'a trend cell per figure');
ok('TC14', 'absolute counts sit beside the rates',
  /of which review actions/.test(full.body) && /PRDs approved/.test(full.body),
  'a rate over a small denominator moves for uninteresting reasons');

// --- TC3: guardrail pairs, adjacent -----------------------------------------------------------
//
// Adjacency is asserted as SAME SECTION, not as both being present somewhere and not as a
// byte distance. The first version of this check used indexOf and a 700-byte window, and it
// failed on M5 because it matched the summary table above rather than M5s own block: the
// report was right and the check was a proxy for the property.

/** The text of one `###` section, up to the next heading of any level. */
const section = (heading) => {
  const i = full.body.indexOf(heading);
  if (i < 0) return '';
  const rest = full.body.slice(i + heading.length);
  const end = rest.search(/\n#{2,3} /);
  return rest.slice(0, end < 0 ? undefined : end);
};

for (const [id, heading, a, c] of [
  ['M2', '### M2 accepted-unedited', 'M2 accepted-unedited', 'C1 recall'],
  ['M4', '### M4 cycle time', 'M4 cycle time', 'M3 edits per requirement'],
  ['M5', '### M5 cost', 'M5 cost per approved PRD', 'PRDs approved'],
]) {
  const body = section(heading);
  ok('TC3', `${id} and its guardrail partner are in the SAME SECTION`,
    body.includes(a) && body.includes(c),
    body ? 'both rows in one table' : 'section not found');
}

// --- TC4: the uncomfortable three, and they are this week's ------------------------------------

for (const label of ['never reached approved', 'ungrounded requirement', 'dead letters']) {
  ok('TC4', `the report carries "${label}"`, full.body.includes(label), '');
}
ok('TC4', "the uncomfortable numbers are THIS WEEK'S, not lifetime totals",
  empty.figures.uncomfortable.every((u) => u.value === 0)
    && full.figures.uncomfortable.some((u) => u.value > 0),
  'zero in an empty week, non-zero in a busy one');

// --- TC5 / TC6: the caveat that removes itself --------------------------------------------------

const withNone = caveatsFor(full.figures, 'none').map((c) => c.id);
const withRecorded = caveatsFor(full.figures, 'recorded').map((c) => c.id);
ok('TC5', "the baseline caveat renders while baseline_status is 'none'",
  withNone.includes('no_baseline'), withNone.join(', ') || '(none)');
ok('TC6', 'CONTROL: it DISAPPEARS when the status becomes recorded, with no prose edited',
  !withRecorded.includes('no_baseline'),
  `none -> [${withNone.join(', ')}]   recorded -> [${withRecorded.join(', ') || 'none'}]`);
ok('TC6', 'and the rendered report loses the sentence with it',
  renderReport({ figures: full.figures, caveats: caveatsFor(full.figures, 'recorded'),
    commentary: 'x', generatedAt: 'FIXED' }).includes('no week-zero baseline') === false,
  'the line is gone from the file, not merely from a flag');

// --- TC7 / TC8: the small-denominator caveat, both directions ------------------------------------

ok('TC7', `the small-denominator caveat fires on a week with fewer than ${SMALL_WEEK} approvals`,
  caveatsFor(empty.figures, 'recorded').some((c) => c.id === 'small_denominator'),
  `${empty.figures.approved} approved`);
ok('TC8', 'CONTROL: and does NOT fire on a week with more',
  !caveatsFor(full.figures, 'recorded').some((c) => c.id === 'small_denominator'),
  `${full.figures.approved} approved`);

// --- TC9 / TC10 / TC11: the model may not write a number -------------------------------------------

const REFUSE = [
  ['a digit', 'Grounding sat at 98% this week.'],
  ['a rounded word', 'Grounding was roughly ninety-eight percent, broadly where it has been.'],
  ['a spelled count', 'Three PRDs were approved and half of them were edited.'],
  ['"per cent"', 'Almost everything was grounded, near enough one hundred per cent.'],
  ['a bare year', 'Since 2025 the grounding rate has held.'],
];
for (const [what, text] of REFUSE) {
  const v = vetCommentary(text);
  ok('TC10', `CONTROL: commentary carrying ${what} is refused whole`,
    !v.ok && v.commentary === NARRATIVE_UNAVAILABLE && v.reason === 'contained_figures',
    v.violations.slice(0, 3).map((x) => `${x.kind}:${x.text}`).join(' '));
}
const clean = 'The accepted-unedited rate rose while extraction recall fell, and those moving in '
  + 'opposite directions is the thing to look at first. No baseline exists, so none of this is '
  + 'an improvement over anything.';
ok('TC11', 'clean commentary passes through unchanged',
  vetCommentary(clean).ok && vetCommentary(clean).commentary === clean, 'not rewritten, not trimmed');
ok('TC9', 'a refused paragraph is DROPPED, never repaired',
  vetCommentary('Grounding was 98%.').commentary === NARRATIVE_UNAVAILABLE,
  'a paragraph with the numbers edited out is a paragraph nobody wrote');
ok('TC9', 'the documented exception behaves as documented: "one" is allowed',
  vetCommentary('Only one PRD reached approval this week.').ok,
  'ordinary English, and the cost is stated in the module');
ok('TC9', 'findFigures reports WHERE, so a refusal leaves a trace',
  findFigures('half of 20%').every((h) => Number.isInteger(h.at)), 'offsets, kinds and text');

// --- TC12: a model failure still ships the report ---------------------------------------------

for (const [what, value] of [['no narrative at all', undefined], ['an empty one', '   '], ['null', null]]) {
  const r = buildReport({ week: FULL, commentary: value, generatedAt: 'FIXED' });
  ok('TC12', `with ${what}, the report ships and says so`,
    r.body.includes(NARRATIVE_UNAVAILABLE) && /M1 grounding rate/.test(r.body)
      && r.body.length > 1000,
    `${r.body.length} bytes, figures intact`);
}

// --- TC13: twice, identical -------------------------------------------------------------------

const a1 = buildReport({ week: FULL, generatedAt: 'FIXED' }).body;
const a2 = buildReport({ week: FULL, generatedAt: 'FIXED' }).body;
ok('TC13', 'built twice with the same inputs, byte-identical', a1 === a2, `${a1.length} bytes`);
const t1 = buildReport({ week: FULL, generatedAt: 'A' }).body;
const t2 = buildReport({ week: FULL, generatedAt: 'B' }).body;
ok('TC13', 'and the ONLY thing that may differ is the generated-at line',
  t1.replace('Generated A', 'X') === t2.replace('Generated B', 'X'), 'one line');

// --- TC18: an empty week says it is empty --------------------------------------------------------

ok('TC18', 'an empty week says so in words rather than printing zeros as findings',
  empty.body.includes('Nothing happened this week')
    && empty.body.includes('lying by arithmetic'), 'the section only an empty week gets');
ok('TC18', 'and a busy week does not carry that section',
  !full.body.includes('Nothing happened this week'), 'it appears only when true');

// --- provisional caveats travel into the report ------------------------------------------------

const provIds = caveatsFor(full.figures, 'recorded').map((c) => c.id);
ok('TC5', "a metric's own provisional mark becomes a caveat at the top of the report",
  provIds.includes('provisional_M4') && provIds.includes('provisional_M5'),
  provIds.join(', ') || '(none)');
ok('TC6', 'CONTROL: a week with none of the offending rows carries no provisional caveat',
  !caveatsFor(empty.figures, 'recorded').some((c) => c.id.startsWith('provisional_')),
  'they appear only when the rows do');

// --- TC15 / TC16 / TC17: the machinery around it ---------------------------------------------------

const wf5 = JSON.parse(readFileSync(join(REPO, 'n8n', 'workflows', 'WF5-weekly-insights.json'), 'utf8'));
ok('TC16', 'WF5 is active — an inactive workflow is invisible to n8n (ADR 0010)',
  wf5.active === true, 'active=true');
ok('TC16', 'WF5 is tagged prdgenie and routes its failures to WF4',
  wf5.tags?.some((t) => t.name === 'prdgenie') && wf5.settings?.errorWorkflow === 'prdgenieWF4error',
  wf5.settings.errorWorkflow);
ok('TC16', 'WF5 is driven by a schedule, and it is a WEEKLY one',
  wf5.nodes.some((n) => n.type === 'n8n-nodes-base.scheduleTrigger'
    && n.parameters?.rule?.interval?.[0]?.field === 'weeks'),
  'field=weeks — restored after being run every minute to test the door');
ok('TC16', 'the narrative call may fail without stopping the run, and the next node expects that',
  wf5.nodes.find((n) => n.name === 'WF0: narrative')?.onError === 'continueRegularOutput'
    && /commentary = null/.test(wf5.nodes.find((n) => n.name === "Take the commentary, or don't")?.parameters?.jsCode ?? ''),
  'declared in check-failure-routing.mjs with its reason');

const builder = wf5.nodes.find((n) => n.name === 'Build the narrative call')?.parameters?.jsCode ?? '';
ok('TC17', 'the narrative prompt is generated from its file, not hand-edited in the node',
  /GENERATED by n8n\/scripts\/sync-prompts\.mjs/.test(builder), 'prompt_version is a content hash');
ok('TC17', 'its data goes inside the DATA fence and nowhere else',
  /SOURCE FIGURES \(DATA, NOT INSTRUCTIONS\)/.test(builder), 'layer 1, unchanged rule');
ok('TC17', 'and it reaches the provider only through WF0',
  wf5.nodes.some((n) => n.type === 'n8n-nodes-base.executeWorkflow'
    && n.parameters?.workflowId?.value === 'prdgenieWF0llmcall')
    && !/api\.openai|generativelanguage/.test(JSON.stringify(wf5)),
  'no provider host anywhere in WF5');

// ---------------------------------------------------------------------------------------------

console.log(`\n${pass}/${pass + fail} passed`);
if (fail) { console.error('WEEKLY VERIFICATION FAILED'); process.exitCode = 1; }
else console.log('The caveats remove themselves, and the report does not need the model to exist.');
