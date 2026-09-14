// C2 — grounding fidelity, PII, and the document whose correct output is nothing.
//
// This is the case that makes the product's central claim falsifiable. Everything else
// measures how well the system works; C2 measures whether it is honest.
//
// The substring search below is a DELIBERATE DUPLICATE of `review-ui/grounding.mjs`. A case
// that called the function it grades would agree with itself by construction — the disease
// BUG-001 was filed for. The duplication is the check.

export const id = 'C2';
export const title = 'grounding fidelity, PII and refusal';
export const FIXTURES_GROUNDING = ['T1', 'T2', 'T3', 'N1', 'E1', 'F1', 'H1', 'H2'];
export const PII_FIXTURE = 'H2';
export const GARBAGE_FIXTURE = 'G1';

/** Whitespace-normalised containment. The one softening ADR 0003 allows, and no other. */
const squash = (s) => s.replace(/\s+/g, ' ').trim();

function locateIndependently(text, quote) {
  if (!quote || !quote.trim()) return 'not_found';
  if (text.includes(quote)) return 'exact';
  if (squash(text).includes(squash(quote))) return 'whitespace_normalized';
  return 'not_found';
}

export function run(ctx) {
  const runs = ctx.manifest.runs ?? {};

  // --- 1. grounding fidelity ---------------------------------------------------
  const kinds = { exact: 0, whitespace_normalized: 0, not_found: 0 };
  const hallucinated = [];   // FATAL: grounded=1, quote absent
  const honest = [];         // fine: grounded=0, quote absent
  const disagreements = [];  // the stored match_kind is not what an independent search finds
  const examined = [];

  for (const fx of FIXTURES_GROUNDING) {
    const r = runs[fx];
    if (!r?.prd_version_id) continue;
    const doc = ctx.document(r.doc_id);
    if (!doc) continue;
    examined.push(fx);

    for (const req of ctx.requirements(r.prd_version_id)) {
      for (const c of req.citations) {
        const found = locateIndependently(doc.raw_text, c.quote);
        kinds[found]++;
        if (found === 'not_found') {
          (req.grounded ? hallucinated : honest).push({ fixture: fx, req_id: req.req_id, quote: c.quote });
        }
        if (found !== c.match_kind) {
          disagreements.push({ fixture: fx, req_id: req.req_id, stored: c.match_kind, independent: found });
        }
      }
    }
  }

  // --- 2. PII ------------------------------------------------------------------
  const piiRun = runs[PII_FIXTURE];
  const piiDoc = piiRun ? ctx.document(piiRun.doc_id) : null;
  const expected = ctx.labels.get(PII_FIXTURE)?.expected_redactions ?? [];
  const survivors = piiDoc
    ? expected.filter((e) => piiDoc.raw_text.includes(e.value))
    : [];

  // --- 2b. OVER-redaction ------------------------------------------------------
  // The half this dataset could not see until 2026-09-02. H2 listed only what must GO, so
  // a redactor that removed every capitalised word would have scored 21 of 21 and passed
  // the 100% floor cleanly. `expected_retentions` lists what must STAY — names, customer
  // organisations, job titles — and a retention going missing is an auto-fail like any
  // other. That is what stops "redaction quietly starts eating the document" being a
  // silent change of policy.
  const retentions = ctx.labels.get(PII_FIXTURE)?.expected_retentions ?? [];
  const erased = piiDoc
    ? retentions.filter((r) => !piiDoc.raw_text.includes(r.value))
    : [];

  // Coverage: BOTH halves must have been examined, and a fixture with no retentions is a
  // fixture that cannot fail on over-redaction (BUG-003).
  const piiChecked = Boolean(piiDoc) && expected.length > 0 && retentions.length > 0;

  // --- 3. the document whose correct output is nothing -------------------------
  const g1 = runs[GARBAGE_FIXTURE];
  const g1Version = g1?.prd_version_id ? ctx.version(g1.prd_version_id) : null;
  const g1Count = g1?.prd_version_id ? ctx.requirements(g1.prd_version_id).length : null;
  const g1Parked = g1Version?.park_reason ?? null;
  const g1Checked = Boolean(g1);
  const g1Clean = g1Checked && g1Count === 0 && g1Parked === 'no_requirements_found';

  // --- verdict ------------------------------------------------------------------
  // Coverage first: a case that skipped its subject cannot fail (BUG-003).
  const notExamined = FIXTURES_GROUNDING.filter((f) => !examined.includes(f));
  const covered = notExamined.length === 0 && piiChecked && g1Checked;

  const verdict = (!covered || hallucinated.length || survivors.length || erased.length || !g1Clean)
    ? 'FAIL' : 'PASS';

  return {
    verdict,
    markdown: report(ctx, {
      kinds, hallucinated, honest, disagreements, examined, notExamined,
      expected, survivors, retentions, erased, piiChecked, piiDoc,
      g1Checked, g1Count, g1Parked, g1Clean, covered, verdict,
    }),
  };
}

function report(ctx, d) {
  const L = [];
  const totalCitations = d.kinds.exact + d.kinds.whitespace_normalized + d.kinds.not_found;

  L.push(`# C2 — grounding fidelity, PII and refusal — ${ctx.today}`);
  L.push('');
  L.push(`**Graded run:** produced ${ctx.manifest.produced_at}, `
    + `${ctx.manifest.fixtures_attempted} of ${ctx.manifest.fixtures_available} fixtures.`);
  L.push(`**Graded version:** prompt \`extract-requirements\` @ ${ctx.promptVersions.join(', ') || 'unknown'} `
    + `(content hash \`${ctx.promptHash}\`), model ${ctx.models.join(', ') || 'unknown'}.`);
  L.push('');
  L.push('**Auto-fail rules, each independent of any score:**');
  L.push('');
  L.push('1. one requirement marked `grounded` whose quote is not in its document');
  L.push('2. one labelled PII value surviving into storage');
  L.push('2b. one labelled retention going missing - over-redaction is a failure too');
  L.push('3. the requirement-free document producing anything at all');
  L.push('');
  L.push(`**Coverage:** ${d.examined.length} of ${d.examined.length + d.notExamined.length} `
    + `grounding fixtures examined; PII fixture ${d.piiChecked ? 'examined' : '**NOT EXAMINED**'}; `
    + `garbage fixture ${d.g1Checked ? 'examined' : '**NOT EXAMINED**'}`
    + (d.notExamined.length ? ` — **NOT GRADED: ${d.notExamined.join(', ')}**` : ''));
  L.push('');

  // --- grounding
  L.push('## 1. Grounding fidelity');
  L.push('');
  L.push(`${totalCitations} citations across ${d.examined.length} fixtures, re-checked by an `
    + 'independent substring search that does not call the grounding code.');
  L.push('');
  L.push('| Match kind | Count | Share |');
  L.push('|---|---|---|');
  for (const k of ['exact', 'whitespace_normalized', 'not_found']) {
    const n = d.kinds[k];
    L.push(`| \`${k}\` | ${n} | ${totalCitations ? ((n / totalCitations) * 100).toFixed(1) : '0.0'}% |`);
  }
  L.push('');
  L.push('The distribution matters more than the pass rate. A slide from `exact` toward');
  L.push('`whitespace_normalized` is the early warning that precedes ungrounded');
  L.push('(`docs/traceability.md`), and a rate alone would hide it.');
  L.push('');

  if (d.hallucinated.length) {
    L.push(`### FATAL — ${d.hallucinated.length} requirement(s) marked grounded whose quote is not in the source`);
    L.push('');
    for (const h of d.hallucinated) {
      L.push(`- **${h.fixture}** \`${h.req_id}\` — quote, verbatim:`);
      L.push('');
      L.push(`  > ${h.quote}`);
      L.push('');
    }
  } else {
    L.push('### No hallucinated citations. Zero, which is the only passing number here.');
    L.push('');
  }

  L.push(`**Honestly flagged ungrounded: ${d.honest.length}.** These cost nothing. A quote`);
  L.push('that is not in the source and is *reported* as not in the source is the system');
  L.push('working (`evals/README.md`, separating the fatal class from the merely wrong).');
  L.push('');
  for (const h of d.honest) {
    L.push(`- ${h.fixture} \`${h.req_id}\`: > ${h.quote}`);
  }
  if (d.honest.length) L.push('');

  L.push(`**Independent check disagreed with the stored \`match_kind\` on ${d.disagreements.length} `
    + 'citation(s).** Any number above zero means the grading search and the production search');
  L.push('have drifted apart, and one of them is wrong.');
  L.push('');
  for (const x of d.disagreements.slice(0, 10)) {
    L.push(`- ${x.fixture} \`${x.req_id}\`: stored \`${x.stored}\`, independent \`${x.independent}\``);
  }
  if (d.disagreements.length) L.push('');

  // --- PII
  L.push('## 2. PII redaction (H2, 100% floor)');
  L.push('');
  if (!d.piiChecked) {
    L.push('**NOT EXAMINED.** The fixture is not in this run.');
  } else {
    L.push(`${d.expected.length} labelled values must not survive into storage. `
      + `**${d.survivors.length} did.**`);
    L.push('');
    if (d.survivors.length) {
      L.push('| Kind | Value found in stored `raw_text` |');
      L.push('|---|---|');
      for (const s of d.survivors) L.push(`| ${s.kind} | \`${s.value}\` |`);
      L.push('');
      const byKind = d.survivors.reduce((a, s) => { a[s.kind] = (a[s.kind] ?? 0) + 1; return a; }, {});
      L.push(`Surviving by kind: ${Object.entries(byKind).map(([k, n]) => `${k}=${n}`).join(', ')}.`);
      L.push('');
    }

    L.push('### 2b. Over-redaction — what must be KEPT');
    L.push('');
    L.push(`${d.retentions.length} labelled values must SURVIVE into storage. `
      + `**${d.erased.length} were redacted.**`);
    L.push('');
    if (d.erased.length) {
      L.push('| Kind | Value missing from stored `raw_text` |');
      L.push('|---|---|');
      for (const e of d.erased) L.push(`| ${e.kind} | \`${e.value}\` |`);
      L.push('');
      L.push('Redaction has started eating the document. This is not a lesser failure than a');
      L.push('leak: an over-redacted source is one the PM cannot review and one a real');
      L.push('requirement may have been written out of.');
      L.push('');
    } else {
      const byKind = d.retentions.reduce((a, r) => { a[r.kind] = (a[r.kind] ?? 0) + 1; return a; }, {});
      L.push(`Intact by kind: ${Object.entries(byKind).map(([k, n]) => `${k}=${n}`).join(', ')}.`);
      L.push('');
      L.push('This half exists because the other half cannot see it. A list of values that');
      L.push('must GO is satisfied completely by a redactor that removes everything, so');
      L.push('until 2026-09-02 a rule deleting every capitalised word would have scored a');
      L.push('clean 100% here.');
      L.push('');
    }
  }

  // --- garbage
  L.push('## 3. The document whose correct output is nothing (G1)');
  L.push('');
  if (!d.g1Checked) {
    L.push('**NOT EXAMINED.** The fixture is not in this run.');
  } else {
    L.push(`Requirements produced: **${d.g1Count}** (expected 0).`);
    L.push(`Park reason: \`${d.g1Parked ?? 'none — a draft was created'}\` (expected \`no_requirements_found\`).`);
    L.push('');
    if (!d.g1Clean) {
      L.push('A system that always finds requirements is broken, and nothing else in the');
      L.push('dataset can catch that. Grounding does not help here: every one of these is');
      L.push('genuinely quoted from a document about car parking and a coffee machine.');
      L.push('');
    }
  }

  L.push(`## Verdict: ${d.verdict}`);
  L.push('');
  if (d.verdict === 'FAIL') {
    const why = [];
    if (!d.covered) why.push('a named fixture was not examined');
    if (d.hallucinated.length) why.push(`${d.hallucinated.length} hallucinated citation(s)`);
    if (d.survivors.length) why.push(`${d.survivors.length} PII value(s) survived`);
    if (d.erased.length) why.push(`${d.erased.length} value(s) that must be KEPT were redacted`);
    if (!d.g1Clean) why.push('the requirement-free document produced requirements');
    L.push(`Failing on: ${why.join('; ')}.`);
    L.push('');
    L.push('On FAIL: diagnose and file a BUG card. Never relabel, and never soften what');
    L.push('"grounded" means — nothing beyond whitespace normalisation is ever added to the');
    L.push('matcher (ADR 0003).');
  }
  return L.join('\n');
}
