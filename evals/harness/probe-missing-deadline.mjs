// BUG-023 diagnostic probe. It DIAGNOSES; it does not fix and it does not grade.
//
// The finding: `T1-R05`, the fixed 30 November deadline, is extracted in 1 of 11 measured
// runs across three prompt versions, on a prompt that singles dates out and says "never
// skip it". The card lists three candidate causes -- position, phrasing, competition --
// and refuses to guess between them.
//
// Two of the three are already dead from the existing run archive, before any model call:
//
//   position     T1-R05's quote sits at 41% of the document and T1-R15's at 16%. The three
//                labels nearest the END (T1-R12, R13, R14, at 85-93%) are extracted in 13
//                runs of 13. Lateness cannot be the cause of a miss that happens in the
//                middle while the tail survives.
//   competition  the model emits 13 of 15 and the two it drops are the 2nd and 5th in
//                document order. It is not running out of room; it is skipping past them.
//
// What both survivors have in common is the passage they live in. The deadline and the
// forty-one-million-row scale are BOTH spoken inside the one contested exchange in T1 --
// Priya's pushback on streaming, which ends with Marcus withdrawing the thirty seconds.
// The prompt tells the model that when a speaker reverses themselves it should extract
// only the final position. The hypothesis this probe tests is that the model applies that
// to the whole EXCHANGE rather than to the withdrawn position: it reduces the passage to
// its one outcome (hourly refresh, T1-R04, extracted every run) and discards the other
// commitments stated while arguing.
//
// Variants, three runs each. Round one used B and C:
//
//   B  isolated   the deadline sentence moved to the END of the same document, prefixed
//                 "One last thing before we close."   -> found 3 of 3
//   C  alone      the contested exchange on its own, ~250 words                -> 3 of 3
//
// B came back 3 of 3 and the probe was WRONG, because B changed two things at once: it
// moved the sentence AND it added a framing cue. That is the mistake this project files
// bug cards about, so round two splits them, one changed thing each:
//
//   M  move only     the turn moved verbatim to the end, no prefix, nothing else changed
//   P  prefix only   the turn left exactly where it is, prefixed with the same cue
//
// M alone finding it means lateness; P alone finding it means the cue; both finding it
// means either is sufficient; neither means the pair only works together.
//
// No variant is a fixture and none is labelled. Nothing here changes a threshold, a label
// or a prompt. The probe reports what came back and names which cause survives.
//
// Usage:  .\run.cmd evals/harness/probe-missing-deadline.mjs [runs] [variant...]

import { readFileSync } from 'node:fs';
import { all } from '../../review-ui/db.mjs';

const INGEST = process.env.N8N_INGEST_WEBHOOK_URL ?? 'http://localhost:5678/webhook/ingest';
const GENERATE = INGEST.replace(/\/ingest$/, '/generate');
const PRODUCT = process.env.EVAL_PRODUCT_ID ?? 'forgesight';
const RUNS = Number(process.argv[2] ?? 3);
const WANTED = process.argv.slice(3).map((s) => s.toUpperCase());

const T1 = JSON.parse(readFileSync('evals/datasets/docs/T1.json', 'utf8')).raw_text;

// The sentence under test, copied character for character out of the fixture.
const DEADLINE = 'The pilot has to be in front of Northwind by the thirtieth of November. That one is fixed, I put it on a slide.';

if (!T1.includes(DEADLINE)) {
  console.error('The deadline sentence is not in T1 verbatim. The probe is out of date with the fixture.');
  process.exit(1);
}

// --- B: the same sentence, moved out of the argument and to the end -------------------
const withoutDeadline = T1.replace(`Marcus (Head of Product): ${DEADLINE}\n`, '');
if (withoutDeadline === T1) {
  console.error('Could not remove the deadline turn. The probe is out of date with the fixture.');
  process.exit(1);
}
const CUE = 'One last thing before we close.';
const B = `${withoutDeadline.trimEnd()}\nMarcus (Head of Product): ${CUE} ${DEADLINE}\n`;

// M: the same move, WITHOUT the cue. Position, and nothing else.
const M = `${withoutDeadline.trimEnd()}\nMarcus (Head of Product): ${DEADLINE}\n`;

// P: the cue, WITHOUT the move. The turn stays exactly where it was.
const P = T1.replace(`Marcus (Head of Product): ${DEADLINE}`,
  `Marcus (Head of Product): ${CUE} ${DEADLINE}`);
if (P === T1) {
  console.error('Could not add the cue in place. The probe is out of date with the fixture.');
  process.exit(1);
}

// --- C: the contested exchange alone --------------------------------------------------
const START = 'Priya (Eng Lead): Before we go further. Refresh.';
const END = 'I would rather it was the thirty seconds than the two seconds.';
const s = T1.indexOf(START);
const e = T1.indexOf(END);
if (s < 0 || e < 0) {
  console.error('Could not locate the contested exchange. The probe is out of date with the fixture.');
  process.exit(1);
}
const C = `ForgeSight kickoff (extract) - 14 August 2026\n\n${T1.slice(s, e + END.length)}\n`;

// R: moved OUT of the argument but not to the end -- dropped in after Wei's tablet ask,
// around 30% of the document, where the labels either side of it are extracted every run.
// This is the variant that separates "the middle of a long document" from "inside a
// disagreement", which M could not: M moved the turn out of the argument AND to the end.
const ANCHOR = 'Priya (Eng Lead): Noted.\n';
const R = withoutDeadline.replace(ANCHOR, `${ANCHOR}Marcus (Head of Product): ${DEADLINE}\n`);
if (R === withoutDeadline) {
  console.error('Could not find the relocation anchor. The probe is out of date with the fixture.');
  process.exit(1);
}

const ALL_VARIANTS = [
  { key: 'B', name: 'moved to the end AND cued (round one, both at once)', text: B },
  { key: 'C', name: 'the contested exchange alone', text: C },
  { key: 'M', name: 'moved to the end, no cue -- position only', text: M },
  { key: 'P', name: 'cued where it stands, not moved -- cue only', text: P },
  { key: 'R', name: 'moved out of the argument to 30%, not to the end', text: R },
];
const VARIANTS = WANTED.length
  ? ALL_VARIANTS.filter((v) => WANTED.includes(v.key))
  : ALL_VARIANTS;

if (!VARIANTS.length) {
  console.error(`No such variant: ${WANTED.join(', ')}. Have: ${ALL_VARIANTS.map((v) => v.key).join(', ')}`);
  process.exit(1);
}

// What counts as "the deadline was extracted": the statement names the date or the quarter.
// Deliberately generous -- a generous test that still comes back empty is a stronger
// finding than a strict one.
const DEADLINE_RE = /(30 november|thirtieth of november|november|q4|fourth quarter)/i;
const SCALE_RE = /(forty-one million|41 ?million|41,000,000)/i;

const post = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ status: 'error', payload: { reason: `HTTP ${res.status}` } }));
};

console.log(`BUG-023 probe - ${RUNS} run(s) per variant, ${VARIANTS.length} variants`);
console.log(`  door: ${INGEST}`);
console.log(`  T1 is ${T1.length} chars; ${VARIANTS.map((v) => `${v.key} is ${v.text.length}`).join(', ')}\n`);

const results = {};

for (const v of VARIANTS) {
  results[v.key] = [];
  for (let i = 1; i <= RUNS; i++) {
    const env = await post(INGEST, {
      product_id: PRODUCT,
      doc_type: 'transcript',
      raw_text: v.text,
      title: `BUG-023 probe ${v.key} run ${i}`,
      received_at: '2026-08-14T10:00:00Z',
    });
    if (env.status !== 'ok') {
      console.log(`  FAIL ${v.key}${i} door: ${env.payload?.reason}`);
      results[v.key].push(null);
      continue;
    }
    const gen = await post(GENERATE, { doc_id: env.doc_id });
    const versionId = gen.payload?.prd_version_id ?? null;
    if (!versionId) {
      console.log(`  ${v.key}${i}  ${env.doc_id}  ${gen.status}: ${gen.payload?.reason}`);
      results[v.key].push({ versionId: null, hitDeadline: false, hitScale: false, statements: [] });
      continue;
    }
    const reqs = all('SELECT statement FROM requirements WHERE prd_version_id=? ORDER BY req_id',
      [versionId]).map((r) => r.statement);
    const hitDeadline = reqs.some((st) => DEADLINE_RE.test(st));
    const hitScale = reqs.some((st) => SCALE_RE.test(st));
    results[v.key].push({ versionId, hitDeadline, hitScale, statements: reqs });
    console.log(`  ${v.key}${i}  v${versionId}  ${reqs.length} requirements  `
      + `deadline: ${hitDeadline ? 'FOUND' : 'missing'}  scale: ${hitScale ? 'FOUND' : 'missing'}`);
  }
  console.log('');
}

// --- what came back -------------------------------------------------------------------

for (const v of VARIANTS) {
  const rs = results[v.key].filter(Boolean);
  const d = rs.filter((r) => r.hitDeadline).length;
  console.log(`${v.key} (${v.name}): deadline in ${d} of ${rs.length} runs`);
  for (const r of rs) {
    const hit = r.statements.find((st) => DEADLINE_RE.test(st));
    if (hit) console.log(`    v${r.versionId}: ${hit}`);
  }
}

console.log('\nStatements from the last run of each variant, in full:');
for (const v of VARIANTS) {
  const last = results[v.key].filter(Boolean).at(-1);
  console.log(`\n  ${v.key} - v${last?.versionId}`);
  for (const st of last?.statements ?? []) console.log(`    - ${st}`);
}

console.log('\nThis probe asserts nothing and gates nothing. Read the counts above against');
console.log('the four outcomes on BUG-023 and write down which cause survives.');
