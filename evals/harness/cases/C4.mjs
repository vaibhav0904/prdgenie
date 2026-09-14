// C4 — ambiguity detection: does the system surface what the room never settled, and are the
// things it calls unsettled really unsettled?
//
// Read `evals/cases/C4-ambiguity-detection.md` first. Two rules can fail this case and they
// are both about T4:
//
//   R1  the EXPLICIT conflict is found                 1 of 1, hard
//   R2  the DECOY is not reported as a conflict        0 false positives, hard
//
// Everything else is REPORTED. Implicit conflicts, missing_nfr categories and unsettled
// positions all carry no threshold this epic, because a floor invented before the range is
// known is a number chosen to be met (the split PRD-E7 used for injection payload P4).
//
// THE SPAN MATCH IS A DELIBERATE DUPLICATE of the one in the product, for the reason C2
// states: a case that called the code it grades would agree with itself by construction.

export const id = 'C4';
export const title = 'ambiguity detection';

export const PRIMARY = 'T4';
export const SECONDARY = 'T3';

/** Half-open intervals, so touching is not overlapping (ADR 0008). */
const overlaps = (a, b) => a.start < b.end && b.start < a.end;

/** Where each of a label's quotes sits in the document. */
function regions(rawText, quotes) {
  const out = [];
  for (const q of quotes ?? []) {
    let at = rawText.indexOf(q);
    while (at >= 0) { out.push({ start: at, end: at + q.length }); at = rawText.indexOf(q, at + 1); }
  }
  return out;
}

/** Where a reported item's citations landed. Code wrote these offsets, so they are trusted. */
const citedRegions = (item) => (item.citations ?? [])
  .filter((c) => c.match_kind && c.match_kind !== 'not_found')
  .map((c) => ({ start: c.start_char, end: c.end_char }));

const hit = (a, b) => a.some((x) => b.some((y) => overlaps(x, y)));

function scoreFixture(ctx, fx) {
  const run = ctx.manifest.runs?.[fx];
  const lab = ctx.labels.get(fx);
  if (!run?.prd_version_id || !lab) return null;
  const doc = ctx.document(run.doc_id);
  if (!doc) return null;
  const raw = doc.raw_text;

  const reported = ctx.openQuestions(run.prd_version_id);
  const positions = ctx.unsettledPositions(run.prd_version_id);

  const labelledConflicts = (lab.expected_open_questions ?? []).filter((q) => q.kind === 'conflict');
  const labelledUnanswered = (lab.expected_open_questions ?? []).filter((q) => q.kind === 'unanswered');
  const decoys = (lab.expected_requirements ?? []).filter((r) => r.decoy === true);

  const reportedConflicts = reported.filter((q) => q.kind === 'conflict');
  const reportedUnanswered = reported.filter((q) => q.kind === 'unanswered');
  const reportedNfr = reported.filter((q) => q.kind === 'missing_nfr');

  // --- labelled items, found or missed --------------------------------------------------
  const claimed = new Set();
  const conflicts = labelledConflicts.map((l) => {
    const lr = regions(raw, l.quotes);
    const found = reportedConflicts.find((r) => !claimed.has(r) && hit(lr, citedRegions(r)));
    if (found) claimed.add(found);
    return { label: l, found: Boolean(found), reported: found ?? null };
  });

  const unanswered = labelledUnanswered.map((l) => {
    const lr = regions(raw, l.quotes);
    const found = reportedUnanswered.find((r) => hit(lr, citedRegions(r)));
    return { label: l, found: Boolean(found), reported: found ?? null };
  });

  // --- the decoy, scored on BOTH outputs (BUG-024) ---------------------------------------
  const decoyRegions = decoys.flatMap((d) => regions(raw, d.quotes));
  const decoyAsConflict = reportedConflicts.filter((r) => hit(decoyRegions, citedRegions(r)));
  const decoyAsPosition = positions.filter((p) => hit(decoyRegions, citedRegions(p)));

  // --- conflicts reported that no label claims -------------------------------------------
  const unlabelled = reportedConflicts.filter((r) => !claimed.has(r) && !decoyAsConflict.includes(r));

  // --- unsettled positions ---------------------------------------------------------------
  const labelledPositions = lab.expected_unsettled_positions ?? [];
  const takenPositions = new Set();
  const positionRows = labelledPositions.map((l) => {
    const lr = regions(raw, l.quotes);
    const found = positions.find((p) => !takenPositions.has(p) && hit(lr, citedRegions(p)));
    if (found) takenPositions.add(found);
    return { label: l, found: Boolean(found), reported: found ?? null };
  });
  const unlabelledPositions = positions.filter((p) => !takenPositions.has(p) && !decoyAsPosition.includes(p));

  return {
    fx,
    versionId: run.prd_version_id,
    conflicts,
    unanswered,
    reportedNfr,
    decoyAsConflict,
    decoyAsPosition,
    unlabelled,
    positionRows,
    unlabelledPositions,
    reportedTotals: {
      conflict: reportedConflicts.length,
      unanswered: reportedUnanswered.length,
      missing_nfr: reportedNfr.length,
      positions: positions.length,
    },
  };
}

export function run(ctx) {
  const primary = scoreFixture(ctx, PRIMARY);
  const secondary = scoreFixture(ctx, SECONDARY);

  const L = [];
  L.push(`# C4 — ambiguity detection — ${ctx.today}`);
  L.push('');
  L.push(`**Graded run:** produced ${ctx.manifest.produced_at}, ${ctx.manifest.fixtures_attempted} of ${ctx.manifest.fixtures_available} fixtures.`);
  L.push(`**Graded version:** prompts ${ctx.promptVersions.join(', ') || '(none recorded)'}, model ${ctx.models.join(', ') || '(none)'}.`);
  L.push('**Thresholds:** R1 the explicit conflict is found, 1 of 1 — hard. R2 the decoy is not');
  L.push('reported as a conflict, 0 false positives — hard. Everything else is **reported with no');
  L.push('threshold this epic**, and the counts carry their denominators.');
  L.push('');

  if (!primary) {
    L.push(`**No gradable run for ${PRIMARY}.** Produce it first:`);
    L.push('');
    L.push('```');
    L.push(`.\\run.cmd evals/harness/produce.mjs ${PRIMARY}`);
    L.push('```');
    return { verdict: 'FAIL', markdown: L.join('\n') };
  }

  const explicit = primary.conflicts.filter((c) => c.label.explicitness === 'explicit');
  const implicit = primary.conflicts.filter((c) => c.label.explicitness === 'implicit');
  const explicitFound = explicit.filter((c) => c.found).length;
  const implicitFound = implicit.filter((c) => c.found).length;

  // --- coverage, asserted rather than assumed (BUG-003) -----------------------------------
  const labelledCount = (ctx.labels.get(PRIMARY)?.expected_open_questions ?? []).length;
  const examinedCount = primary.conflicts.length + primary.unanswered.length;
  const coverageOk = examinedCount === labelledCount;

  L.push(`**Coverage:** ${examinedCount} of ${labelledCount} labelled open questions examined on ${PRIMARY}`
    + (coverageOk ? '' : ' — **GAP**'));
  L.push('');

  // --- the two hard rules -----------------------------------------------------------------
  L.push('## The two rules that can fail this case');
  L.push('');
  L.push('| Rule | Result | |');
  L.push('|---|---|---|');
  L.push(`| **R1** the explicit conflict is found | **${explicitFound} of ${explicit.length}** | ${explicitFound === explicit.length ? 'pass' : '**FAIL**'} |`);
  L.push(`| **R2** the decoy is not called a conflict | **${primary.decoyAsConflict.length}** false positive(s) | ${primary.decoyAsConflict.length === 0 ? 'pass' : '**FAIL**'} |`);
  L.push('');

  // --- reported, no threshold --------------------------------------------------------------
  L.push('## Reported, with no threshold this epic');
  L.push('');
  L.push('| | Found | Of | |');
  L.push('|---|---|---|---|');
  L.push(`| **Implicit** conflicts | ${implicitFound} | ${implicit.length} | the kind this fixture was written for |`);
  L.push(`| Unanswered questions | ${primary.unanswered.filter((u) => u.found).length} | ${primary.unanswered.length} | |`);
  L.push(`| Unsettled positions | ${primary.positionRows.filter((p) => p.found).length} | ${primary.positionRows.length} | one day old (BUG-007) |`);
  L.push(`| Decoy filed as an unsettled position | ${primary.decoyAsPosition.length} | — | a false positive, counted (BUG-024) |`);
  L.push(`| \`missing_nfr\` emitted | ${primary.reportedNfr.length} | — | by category, never span (BUG-020) |`);
  L.push('');
  L.push('**Nothing above is averaged with anything else.** The two outputs come from different');
  L.push('model calls with different prompts; one being right does not make the other right.');
  L.push('');

  // --- the words, when the implicit ones are missed ------------------------------------------
  if (implicit.length && implicitFound === 0) {
    L.push('> **This system finds explicit disagreements and misses implicit ones.**');
    L.push('> On this run it found every disagreement that announced itself and none of the');
    L.push('> disagreements that had to be read. That is a description of the capability, not a');
    L.push('> defect to tune away, and it is what the deck should say.');
    L.push('');
  } else if (implicit.length && implicitFound < implicit.length) {
    L.push(`> **Implicit disagreements are found inconsistently: ${implicitFound} of ${implicit.length} on this run.**`);
    L.push('> Two data points cannot support a rate, which is why this line is a count.');
    L.push('');
  }

  // --- per-item ----------------------------------------------------------------------------
  L.push(`## ${PRIMARY} — per-item (${primary.reportedTotals.conflict} conflicts, `
    + `${primary.reportedTotals.unanswered} unanswered, ${primary.reportedTotals.missing_nfr} missing_nfr, `
    + `${primary.reportedTotals.positions} positions reported)`);
  L.push('');
  L.push('| Label | Kind | Result | Reported as |');
  L.push('|---|---|---|---|');
  for (const c of [...primary.conflicts, ...primary.unanswered]) {
    const kind = c.label.kind === 'conflict' ? `conflict · ${c.label.explicitness}` : c.label.kind;
    L.push(`| \`${c.label.label_id}\` | ${kind} | ${c.found ? 'found' : '**missed**'} | ${c.reported ? c.reported.question.slice(0, 90) : '—'} |`);
  }
  L.push('');

  L.push('**Unsettled positions:**');
  L.push('');
  L.push('| Label | Whose | Result |');
  L.push('|---|---|---|');
  for (const p of primary.positionRows) {
    L.push(`| \`${p.label.label_id}\` | ${p.label.stakeholder} | ${p.found ? 'found' : '**missed**'} |`);
  }
  L.push('');

  if (primary.decoyAsConflict.length || primary.decoyAsPosition.length) {
    L.push('**The decoy was flagged:**');
    L.push('');
    for (const d of primary.decoyAsConflict) L.push(`- as a **conflict**: ${d.question}`);
    for (const d of primary.decoyAsPosition) L.push(`- as an **unsettled position**: ${d.position}`);
    L.push('');
  }

  if (primary.unlabelled.length) {
    L.push('**Reported conflicts no label claims — for a human, not counted against the system:**');
    L.push('');
    for (const u of primary.unlabelled) L.push(`- ${u.question}`);
    L.push('');
  }
  if (primary.unlabelledPositions.length) {
    L.push('**Unsettled positions no label claims — for a human:**');
    L.push('');
    for (const u of primary.unlabelledPositions) L.push(`- ${u.stakeholder ?? '(nobody named)'}: ${u.position}`);
    L.push('');
  }

  if (primary.reportedNfr.length) {
    L.push('**`missing_nfr` categories emitted** (BUG-020 watches this number):');
    L.push('');
    L.push(primary.reportedNfr.map((q) => `\`${q.category ?? '?'}\``).join(' · '));
    L.push('');
  }

  // --- secondary ---------------------------------------------------------------------------
  if (secondary) {
    const se = secondary.conflicts.filter((c) => c.found).length;
    L.push(`## ${SECONDARY} — secondary, reported only`);
    L.push('');
    L.push(`Both of T3's conflicts are **explicit** since \`T3-Q03\` was withdrawn, so this fixture`);
    L.push('cannot say anything about implicit detection. It is here as a second sample of the');
    L.push('easy case, with no threshold of its own.');
    L.push('');
    L.push(`- conflicts found: **${se} of ${secondary.conflicts.length}**`);
    L.push(`- reported: ${secondary.reportedTotals.conflict} conflicts, ${secondary.reportedTotals.missing_nfr} missing_nfr, ${secondary.reportedTotals.positions} positions`);
    L.push('');
  }

  // --- verdict ------------------------------------------------------------------------------
  const r1 = explicitFound === explicit.length && explicit.length > 0;
  const r2 = primary.decoyAsConflict.length === 0;
  let verdict;
  if (!coverageOk) verdict = 'FAIL';
  else if (!r1 || !r2) verdict = 'FAIL';
  else if (primary.unlabelled.length || primary.unlabelledPositions.length) verdict = 'PASS-PENDING-MANUAL-REVIEW';
  else verdict = 'PASS';

  L.push('## What this case cannot claim');
  L.push('');
  L.push('**C4\'s labels were written and approved by the same person.** An implicit conflict in');
  L.push('T4 is implicit in one reader\'s judgment, and no second reader has tested that: E3-S6');
  L.push('required an independent sign-off and it was delegated back on 2026-09-02. What survives');
  L.push('is mechanical — T4\'s labels are frozen at `sha256[0:16] = 3bac9d940f97d88c` and');
  L.push('`verify-labels.mjs` TC12 fails if they move.');
  L.push('');
  L.push(`## Verdict: ${verdict}`);

  return { verdict, markdown: L.join('\n') };
}
