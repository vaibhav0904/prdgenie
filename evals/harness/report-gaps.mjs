// What the detector found, per fixture. A REPORT, not a case.
//
// It has no threshold, no verdict and no exit code that means "pass". C4 is E3-S6's, it
// needs a T4 fixture that does not exist yet, and its old >=2-of-3 threshold was declared
// void when Vaibhav's label review withdrew T3-Q03 (STATUS, 2026-09-02). Printing a number
// here and calling it a score would be inventing the threshold nobody has chosen.
//
// So this prints what happened and lets a person read it.
//
// Usage:  .\run.cmd evals/harness/report-gaps.mjs

import { readFileSync } from 'node:fs';
import { all } from '../../review-ui/db.mjs';
import { loadLabels, resolveLabels, fixtureId, overlaps } from './labels.mjs';

const MANIFEST = 'evals/results/.last-run.json';
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const labels = loadLabels();

const docText = (docId) => all('SELECT raw_text FROM source_documents WHERE doc_id=?', [docId])[0]?.raw_text ?? '';

console.log(`Open questions in the run produced ${manifest.produced_at ?? '(undated)'}\n`);

let totalKept = 0;
const byKind = { conflict: 0, unanswered: 0, missing_nfr: 0 };

for (const [fx, run] of Object.entries(manifest.runs ?? {})) {
  const versionId = run.prd_version_id;
  if (!versionId) { console.log(`${fx}: no version (parked without an id)\n`); continue; }

  const rows = all('SELECT kind, question, citations FROM open_questions WHERE prd_version_id=? ORDER BY question_id', [versionId]);
  totalKept += rows.length;
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;

  const parked = run.park_reason ? ` [parked: ${run.park_reason}]` : '';
  console.log(`${fx}  v${versionId}  ${rows.length} open question(s)${parked}`);

  for (const r of rows) {
    const cits = JSON.parse(r.citations);
    const bad = cits.filter((c) => c.match_kind === 'not_found').length;
    const flag = r.kind === 'missing_nfr' ? 'n/a' : (bad ? `UNGROUNDED (${bad} not_found)` : 'grounded');
    console.log(`   [${r.kind}] ${flag}`);
    console.log(`      ${r.question}`);
  }

  // For fixtures with labelled open questions, say which were reached — by the same span
  // overlap C1 uses, so the answer means the same thing it does elsewhere (ADR 0008).
  const labelFile = labels.find((l) => fixtureId(l.file) === fx);
  const expected = labelFile?.expected_open_questions ?? [];
  if (expected.length) {
    const text = docText(run.doc_id);
    const { regionsByLabel } = resolveLabels(labelFile, text);
    const spans = rows.flatMap((r) => JSON.parse(r.citations))
      .filter((c) => Number.isInteger(c.start_char));
    console.log(`   labelled open questions: ${expected.length}`);
    for (const e of expected) {
      const hit = spans.some((s) => overlaps(s, regionsByLabel.get(e.label_id) ?? []));
      console.log(`      ${hit ? 'FOUND   ' : 'MISSED  '} ${e.label_id} (${e.kind}) ${e.question.slice(0, 70)}`);
    }
  }
  console.log('');
}

console.log(`Total kept: ${totalKept}  ${JSON.stringify(byKind)}`);
console.log('');
console.log('No verdict is printed on purpose. C4 owns the threshold, C4 is not built, and its');
console.log('old one is void until E3-S6 writes the T4 fixture.');
