// Verifies the labelled ground truth is usable before anything is graded against it.
//
// Why this exists: every quality number this project will ever report inherits these
// files. A quote that does not resolve is indistinguishable from an extraction failure
// once C1 is running, so it gets caught here instead of being diagnosed later.
//
// Usage:
//   .\run.cmd evals\harness\verify-labels.mjs           check the authored files
//   .\run.cmd evals\harness\verify-labels.mjs --stored  also check against stored raw_text (TC13)

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { loadFixtures, loadLabels, resolveLabels, fixtureId } from './labels.mjs';
import { all } from '../../review-ui/db.mjs';

const CHECK_STORED = process.argv.includes('--stored');
const MANIFEST_PATH = 'evals/results/.last-run.json';
const RULE = 'Labels written BEFORE any tuning. Never edit labels to match output.';
const EXPECTED = {
  T1: 'transcript', T2: 'transcript', T3: 'transcript', T4: 'transcript', N1: 'notes',
  E1: 'email', F1: 'feature_brief', G1: 'notes', H1: 'transcript', H2: 'email',
};

const results = [];
const ok = (id, desc, pass, detail = '') => results.push({ id, desc, pass, detail });

const fixtures = loadFixtures();
const labels = loadLabels();
const fixById = new Map(fixtures.map((f) => [f.fixture_id ?? fixtureId(f.file), f]));
const labById = new Map(labels.map((l) => [l.fixture_id ?? fixtureId(l.file), l]));

// --- TC1 / TC2 ---------------------------------------------------------------
const missingFixtures = Object.keys(EXPECTED).filter((id) => !fixById.has(id));
// An UNEXPECTED fixture fails too, and that half is new. This check read "nine fixtures
// exist" while ten sat on disk and passed, because the set was a floor: a fixture could be
// added and never pinned. A denominator that cannot grow cannot report a gap (BUG-003).
const unexpectedFixtures = [...fixById.keys()].filter((id) => !(id in EXPECTED));
ok('TC1', `${Object.keys(EXPECTED).length} fixtures exist, with the expected doc_types and no others`,
  missingFixtures.length === 0 && unexpectedFixtures.length === 0
    && Object.entries(EXPECTED).every(([id, t]) => fixById.get(id)?.doc_type === t),
  [missingFixtures.length ? `missing: ${missingFixtures.join(', ')}` : '',
   unexpectedFixtures.length ? `unpinned: ${unexpectedFixtures.join(', ')} — add it to EXPECTED and give it a count row` : '',
   Object.entries(EXPECTED).filter(([id, t]) => fixById.get(id)?.doc_type !== t)
     .map(([id, t]) => `${id} should be ${t}`).join('; ')].filter(Boolean).join('; '));

const missingLabels = Object.keys(EXPECTED).filter((id) => !labById.has(id));
const wrongRule = [...labById.values()].filter((l) => l.rule !== RULE).map((l) => l.file);
ok('TC2', `${Object.keys(EXPECTED).length} label files exist, each carrying the rule verbatim`,
  missingLabels.length === 0 && wrongRule.length === 0,
  [missingLabels.length ? `missing: ${missingLabels.join(', ')}` : '',
   wrongRule.length ? `rule wrong in: ${wrongRule.join(', ')}` : ''].filter(Boolean).join('; '));

// --- TC3 / TC4: every quote resolves -----------------------------------------
const allUnresolved = [];
let totalRegions = 0;
let multiOccurrence = 0;
for (const [id, lab] of labById) {
  const fix = fixById.get(id);
  if (!fix) continue;
  const { regionsByLabel, unresolved } = resolveLabels(lab, fix.raw_text);
  allUnresolved.push(...unresolved.map((u) => ({ fixture: id, ...u })));
  for (const regions of regionsByLabel.values()) {
    totalRegions += regions.length;
    if (regions.length > 1) multiOccurrence++;
  }
}
ok('TC3', 'every labelled quote is a verbatim substring of its fixture',
  allUnresolved.length === 0,
  allUnresolved.length
    ? allUnresolved.slice(0, 3).map((u) => `${u.fixture}/${u.label_id}: "${(u.quote ?? '').slice(0, 45)}…"`).join(' | ')
      + (allUnresolved.length > 3 ? ` (+${allUnresolved.length - 3} more)` : '')
    : `${totalRegions} regions resolved`);
ok('TC4', 'quotes resolve to regions, multi-occurrence labels keep all of them',
  totalRegions > 0, `${multiOccurrence} labels resolve to more than one region`);

// --- TC5 ---------------------------------------------------------------------
const t1 = labById.get('T1');
const t1n = t1?.expected_requirements?.length ?? 0;
const t1kinds = new Set((t1?.expected_requirements ?? []).map((r) => r.kind));
// Pinned exactly, not as a range. A range lets the answer key drift by one without anyone
// deciding to change it, and the answer key is the thing every quality number is measured
// against. 14 until 2026-09-02, when Vaibhav's label review added T1-R15 (the forty-one
// million row scale constraint); see evals/results/README.md.
ok('TC5', 'T1 has exactly 15 requirements across all three kinds',
  t1n === 15 && t1kinds.size === 3, `${t1n} requirements, kinds: ${[...t1kinds].join('/')}`);

// --- TC6 / TC7: the delta ----------------------------------------------------
const d = labById.get('T2')?.expected_delta;
ok('TC6', 'T2 delta is 2 modified, 1 contradicted, 1 added, >=3 unchanged-restated',
  d?.modified?.length === 2 && d?.contradicted?.length === 1
    && d?.added?.length === 1 && (d?.unchanged_restated?.length ?? 0) >= 3,
  d ? `mod=${d.modified?.length} contra=${d.contradicted?.length} add=${d.added?.length} unchanged=${d.unchanged_restated?.length}` : 'no expected_delta');

const t1Ids = new Set((t1?.expected_requirements ?? []).map((r) => r.label_id));
const refs = [...(d?.modified ?? []), ...(d?.contradicted ?? [])].map((x) => x.of_label)
  .concat(d?.unchanged_restated ?? []);
const badRefs = refs.filter((r) => !t1Ids.has(r));
ok('TC7', 'every T2 delta reference points at a real T1 label',
  refs.length > 0 && badRefs.length === 0, badRefs.length ? `unknown: ${badRefs.join(', ')}` : `${refs.length} refs`);

// --- TC8 / TC9 / TC10 / TC11 -------------------------------------------------
const t3conf = (labById.get('T3')?.expected_open_questions ?? []).filter((q) => q.kind === 'conflict');
// Two since 2026-09-02: Vaibhav read T3-Q03, the tablet exchange, as a decision taken over
// a registered dissent rather than an unsettled argument, and it became the constraint
// T3-R07. Both remaining conflicts are EXPLICIT, so this fixture no longer contains a case
// that punishes a system for keying on tone — which is what the removed one was for.
// C4's "at least 2 of 3" threshold and story E3-S6 both lost their basis; neither may be
// inherited silently. See the T3 label notes and evals/results/README.md.
ok('TC8', 'T3 has exactly two conflicts', t3conf.length === 2, `${t3conf.length} conflicts`);

// --- TC8b: T4, the fixture E3-S6 exists to write ------------------------------
//
// T3 lost its only implicit conflict when T3-Q03 was withdrawn, and C4's threshold lost its
// basis with it. These pins are what stop that happening quietly a second time: the counts
// are exact, and the IMPLICIT count is pinned separately because it is the one that matters
// and the one that would be cheapest to erode.
const t4 = labById.get('T4');
const t4conf = (t4?.expected_open_questions ?? []).filter((q) => q.kind === 'conflict');
const t4implicit = t4conf.filter((q) => q.explicitness === 'implicit');
const t4explicit = t4conf.filter((q) => q.explicitness === 'explicit');
const t4decoys = (t4?.expected_requirements ?? []).filter((r) => r.decoy === true);

ok('TC8b', 'T4 has exactly three conflicts: two implicit, one explicit control',
  t4conf.length === 3 && t4implicit.length === 2 && t4explicit.length === 1,
  `${t4conf.length} conflicts — ${t4implicit.length} implicit, ${t4explicit.length} explicit`);
ok('TC8c', 'every T4 conflict declares its explicitness',
  t4conf.length > 0 && t4conf.every((q) => ['implicit', 'explicit'].includes(q.explicitness)),
  t4conf.filter((q) => !['implicit', 'explicit'].includes(q.explicitness))
    .map((q) => q.label_id).join(', ') || 'all declared');
ok('TC8d', 'T4 carries at least one decoy: an exchange that sounds unsettled and is decided',
  t4decoys.length >= 1,
  t4decoys.map((r) => `${r.label_id} (${r.kind})`).join(', ') || 'none — C4 cannot measure conflict precision without one');
ok('TC8e', 'no T4 decoy is also labelled a conflict',
  t4decoys.every((r) => !t4conf.some((q) => (q.quotes ?? []).some((x) => (r.quotes ?? []).includes(x)))),
  'a passage cannot be both the decoy and the thing it is a decoy for');
ok('TC8f', 'T4 labels both sides of every conflict as unsettled positions',
  t4conf.every((q) => (t4?.expected_unsettled_positions ?? []).filter((p) => p.for_conflict === q.label_id).length >= 2),
  `${(t4?.expected_unsettled_positions ?? []).length} positions across ${t4conf.length} conflicts`);

const g1 = labById.get('G1');
ok('TC9', 'G1 expects zero requirements',
  Array.isArray(g1?.expected_requirements) && g1.expected_requirements.length === 0,
  `${g1?.expected_requirements?.length ?? '?'} requirements`);

// H1's payload set is DERIVED, never counted by hand. It was "three payloads of three
// distinct kinds" until E7-S2 added a fourth, and a hand-typed denominator would have had to
// be edited to let the dataset grow — the exact shape of BUG-003/BUG-019. What is actually
// required is that there are several, that no two attack the same way, and that each one is
// really in the document.
const h1 = labById.get('H1');
const payloads = h1?.injection_payloads ?? [];
const kinds = new Set(payloads.map((p) => p.kind));
ok('TC10a', 'H1 carries several injection payloads, no two of the same kind, plus real requirements',
  payloads.length >= 3 && kinds.size === payloads.length
    && (h1?.expected_requirements?.length ?? 0) > 0,
  `${payloads.length} payloads (${[...kinds].join('/')}), ${h1?.expected_requirements?.length ?? 0} requirements`);

// A labelled attack that is not in the document is an attack nothing was exposed to.
const h1doc = fixById.get('H1');
const notInDoc = payloads.filter((p) => !h1doc || !h1doc.raw_text.includes(p.quote));
ok('TC10b', 'every payload quote is VERBATIM in H1 raw_text',
  Boolean(h1doc) && notInDoc.length === 0,
  notInDoc.length ? `missing: ${notInDoc.map((p) => p.payload_id).join(', ')}` : `${payloads.length} verified`);

// The markers C6 searches the output for. Each must come from the payload's own quote —
// a marker taken from something the system was observed to emit would make C6 a test of
// what the system already does.
const badMarkers = payloads.flatMap((p) => (p.markers ?? [])
  .filter((m) => !p.quote.includes(m))
  .map((m) => `${p.payload_id}: ${m}`));
const noMarkers = payloads.filter((p) => !(p.markers ?? []).length).map((p) => p.payload_id);
ok('TC10c', 'every payload declares markers, and every marker is verbatim in its own quote',
  noMarkers.length === 0 && badMarkers.length === 0,
  [noMarkers.length ? `no markers: ${noMarkers.join(', ')}` : '', badMarkers.join(' | ')]
    .filter(Boolean).join(' — ') || `${payloads.flatMap((p) => p.markers).length} markers`);

const h2 = labById.get('H2');
const reds = h2?.expected_redactions ?? [];
const INTERNAL = ['Priya', 'Marcus', 'Dana', 'Wei', 'Tom'];
const leakedInternal = reds.filter((r) => INTERNAL.some((n) => String(r.value ?? '').includes(n)));
ok('TC11', 'H2 lists redactions and does not list internal stakeholders',
  reds.length > 0 && leakedInternal.length === 0,
  `${reds.length} redactions; ${leakedInternal.length} internal names wrongly listed`);

// TC11b — the half a redaction answer key is missing by default.
//
// A list of values that must GO is satisfied completely by a redactor that removes
// everything. Until 2026-09-02, H2 listed only those, so a rule deleting every capitalised
// word would have scored 21 of 21 and passed the 100% floor. `expected_retentions` lists
// what must STAY, C2 fails on one going missing, and this row makes sure the list itself
// does not quietly empty.
const keeps = h2?.expected_retentions ?? [];
const keepKinds = new Set(keeps.map((r) => r.kind));
const keepsInDoc = keeps.filter((r) => (fixById.get('H2')?.raw_text ?? '').includes(r.value));
ok('TC11b', 'H2 lists what must be KEPT, across every kind, and all of it is in the fixture',
  keeps.length === 22 && keepKinds.size === 4 && keepsInDoc.length === keeps.length,
  `${keeps.length} retentions (${[...keepKinds].sort().join('/')}); ${keepsInDoc.length} present in the fixture`);

// TC11c — the two lists must not contradict each other. A value required to go AND to stay
// is a dataset that can never pass, and the failure would read as a code defect.
const keepValues = new Set(keeps.map((r) => r.value));
const contradictions = reds.filter((r) => keepValues.has(r.value));
ok('TC11c', 'No value is required both to be redacted and to be kept',
  contradictions.length === 0,
  contradictions.length ? contradictions.map((r) => r.value).join(', ') : 'no overlap');

// --- TC12: STRUCK, deliberately ----------------------------------------------
//
// This row asserted that `n8n/prompts/` was empty — the labels-before-tuning rule made
// checkable. It passed in E1-S3, which is the moment it could ever be true, and E1-S4 then
// wrote the extraction prompt.
//
// It is removed rather than left failing or quietly relaxed. E1-S3's test plan said so in
// advance: "a test of sequence, not of code — it can only ever pass once; strike it after
// E1-S4 rather than keeping it green." The ordering claim is now a historical fact
// evidenced by that story's archived run, not a property this checker can re-verify.
//
// What still enforces the rule is `evals/README.md` rule 2 and the BUG-card discipline on
// eval failure: labels are never edited to match output.

// --- TC13: quotes still resolve against STORED text --------------------------
if (CHECK_STORED) {
  // Join on the run manifest, not on text similarity. Matching by content silently
  // skipped H2 — the one fixture redaction rewrites, and the only one this row exists
  // for (BUG-003).
  let manifest = null;
  if (existsSync(MANIFEST_PATH)) manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

  if (!manifest) {
    ok('TC13', 'quotes still resolve against stored (post-redaction) raw_text', false,
      'no run manifest — produce a run first: .\\run.cmd evals/harness/produce.mjs');
  } else {
    const brokenAfterStorage = [];
    const notChecked = [];
    let checked = 0;
    for (const [id, lab] of labById) {
      const run = manifest.runs?.[id];
      const stored = run ? all('SELECT raw_text FROM source_documents WHERE doc_id=?', [run.doc_id])[0] : null;
      if (!stored) { notChecked.push(id); continue; }
      checked++;
      const { unresolved } = resolveLabels(lab, stored.raw_text);
      brokenAfterStorage.push(...unresolved.map((u) => `${id}/${u.label_id}`));
    }
    // Coverage is asserted, not assumed. "8 of 9 checked" is a failure, not a footnote:
    // a check that can skip its subject is a check that cannot fail (BUG-003).
    ok('TC13', 'every fixture is checked against stored text, and every quote still resolves',
      checked === labById.size && brokenAfterStorage.length === 0,
      `${checked}/${labById.size} checked`
        + (notChecked.length ? `; NOT CHECKED: ${notChecked.join(', ')}` : '')
        + (brokenAfterStorage.length ? `; broken: ${brokenAfterStorage.slice(0, 3).join(', ')}` : ''));
  }
}


// --- TC12: the labels are FROZEN --------------------------------------------
//
// "Never edit labels to match output" has been a rule in prose since E1-S3, and prose is not
// a check. It became worth enforcing on 2026-09-02, when the independent sign-off on T4's
// labels was delegated back to the person who wrote them: the second reader is gone, so the
// one guard left is that the key cannot move once a score exists.
//
// The hash was taken BEFORE C4's first run and is recorded in evals/cases/C4-*.md. If a label
// file has to change for a legitimate reason, the hash changes in the same commit, with the
// reason written down — which is exactly the friction that makes a quiet edit visible.
const FROZEN_LABELS = {
  T4: '3bac9d940f97d88c',
};
for (const [id, expected] of Object.entries(FROZEN_LABELS)) {
  const file = labels.find((l) => (l.fixture_id ?? fixtureId(l.file)) === id)?.file;
  const actual = file
    ? createHash('sha256').update(readFileSync(`evals/datasets/labels/${file}`)).digest('hex').slice(0, 16)
    : '(file missing)';
  ok('TC12', `${id}'s labels are unchanged since they were frozen`, actual === expected,
    actual === expected ? actual
      : `expected ${expected}, found ${actual} — if this edit is legitimate, change the hash in the SAME commit and say why`);
}

// --- report -------------------------------------------------------------------
const width = Math.max(...results.map((r) => r.desc.length));
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(5)} ${r.desc.padEnd(width)}${r.detail ? '  ' + r.detail : ''}`);
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.error('LABEL VERIFICATION FAILED'); process.exit(1); }
console.log('Ground truth verified: every quote resolves, every count is as specified.');
