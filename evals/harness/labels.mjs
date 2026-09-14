// Loading and resolving the labelled ground truth.
//
// Labels are authored as **verbatim quotes**, not character offsets, and this module
// resolves them to regions. Authored offsets would rot the moment the door's redaction
// changed a fixture by one character, and the failure would look like an extraction bug
// rather than a data bug. The quote is the durable thing (ADR 0003 makes the same choice
// for citations, for the same reason).

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

export const DOCS_DIR = 'evals/datasets/docs';
export const LABELS_DIR = 'evals/datasets/labels';

/**
 * ONE PRODUCT PER FIXTURE (BUG-052). E6-S2 found this; nothing here is a preference.
 *
 * All ten fixtures used to be ingested as `forgesight`, and `forgesight` has an approved PRD.
 * WF1 routes a document whose product has one to the **delta**, so under real routing T2
 * through H2 were all follow-up documents of T1 and C1, C2 and C3 would have graded a database
 * with no generation runs in it at all. The producer stepped around that by asking the door not
 * to dispatch and driving generate by hand — which made the one file whose job is "replay
 * through the real doors" the one file that did not.
 *
 * These are **ten first documents**. G1 is garbage, H1 is an attack, H2 is a PII sample,
 * N1/E1/F1 are separate briefs; none is a follow-up of a kickoff transcript in any sense. A
 * product each is not a workaround, it is what the corpus is — and it makes "this document
 * generates" structural rather than a state a stray sign-off can flip. Under one shared product
 * a single approval contaminates all ten; here it contaminates one, and
 * `verify-corpus-routing.mjs` names which.
 *
 * T2 IS genuinely T1's follow-up, and is still graded here as a first document, because
 * C1/C2/C3 grade its extraction against its own labels and never look at T1. The pair is only
 * true for C5, which needs an approved baseline and therefore its own product — `forgesight`
 * itself, which keeps the approved versions it already has. C5 is E6-S5 and is not built.
 *
 * The labels do not move with it: they join on `fixture_id`, and nothing in this file or in
 * `match.mjs` has ever read a product. `verify-corpus-routing.mjs` asserts that rather than
 * asserting this sentence.
 */
export const PRODUCT_PREFIX = process.env.EVAL_PRODUCT_ID ?? 'forgesight';
export const productFor = (fixtureId) => `${PRODUCT_PREFIX}-${String(fixtureId).toLowerCase()}`;

export function loadFixtures() {
  if (!existsSync(DOCS_DIR)) return [];
  return readdirSync(DOCS_DIR).filter((f) => f.endsWith('.json')).sort()
    .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(DOCS_DIR, f), 'utf8')) }));
}

export function loadLabels() {
  if (!existsSync(LABELS_DIR)) return [];
  return readdirSync(LABELS_DIR).filter((f) => f.endsWith('.json')).sort()
    .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(LABELS_DIR, f), 'utf8')) }));
}

/** Every occurrence of `quote` in `text`, as {start_char, end_char}. */
export function findAll(text, quote) {
  const regions = [];
  if (!quote) return regions;
  let i = text.indexOf(quote);
  while (i !== -1) {
    regions.push({ start_char: i, end_char: i + quote.length });
    i = text.indexOf(quote, i + 1);
  }
  return regions;
}

/**
 * Resolve one label file's quotes against a fixture's text.
 * Returns { regionsByLabel: Map<label_id, region[]>, unresolved: [{label_id, quote}] }.
 *
 * A label with several quotes contributes ALL of their regions: a requirement stated
 * twice must not score as a miss when the extractor cites the second mention (ADR 0008).
 */
export function resolveLabels(labelFile, rawText) {
  const regionsByLabel = new Map();
  const unresolved = [];

  const consider = (id, quotes) => {
    const regions = [];
    for (const q of quotes ?? []) {
      const found = findAll(rawText, q);
      if (!found.length) unresolved.push({ label_id: id, quote: q });
      regions.push(...found);
    }
    regionsByLabel.set(id, regions);
  };

  for (const r of labelFile.expected_requirements ?? []) consider(r.label_id, r.quotes);
  for (const q of labelFile.expected_open_questions ?? []) consider(q.label_id, q.quotes);
  for (const p of labelFile.injection_payloads ?? []) consider(p.payload_id, [p.quote]);

  return { regionsByLabel, unresolved };
}

/** True when an extracted citation span overlaps any region a label was drawn from. */
export function overlaps(span, regions) {
  return regions.some((r) => span.start_char < r.end_char && r.start_char < span.end_char);
}

export function fixtureId(file) {
  return basename(file).replace(/\.labels\.json$|\.json$/, '');
}
