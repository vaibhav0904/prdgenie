// Every fixture in the extraction corpus takes the GENERATE road, and nothing but state says so.
//
// BUG-052: all ten fixtures were ingested as `forgesight`, `forgesight` has an approved PRD,
// and WF1 sends a document whose product has one to the delta. Under real routing the corpus
// was nine follow-ups of a kickoff transcript, and C1/C2/C3 would have graded a database with
// no generation runs in it. The producer stepped around it with `dispatch: false`.
//
// The corpus is now one product per fixture. That makes "this document generates" structural
// rather than accidental — but *structural* is a claim about state, and state changes. One
// sign-off in one of those products and that fixture silently starts grading a delta. So the
// claim is checked, every sweep.
//
// HOW IT COSTS NOTHING. It asks `routeFor()` — the function WF1's decision is made by, imported
// from the shipped module rather than reimplemented — what road each product is on right now.
// No document is ingested, no model is called, and no row is written. A check that replayed ten
// fixtures through the door every sweep to prove they route correctly would be BUG-059 in a new
// place: real rows, in the tables the figures come from, produced by a check.
//
// WHAT IT DOES NOT ASSERT: that a produce run happened, or that grading is current. This is
// about the shape of the corpus, and it is true or false with no run in the database at all.
//
// Usage:  .\run.cmd evals\harness\verify-corpus-routing.mjs

import { readFileSync } from 'node:fs';
import { loadFixtures, productFor, PRODUCT_PREFIX } from './labels.mjs';
import { routeFor } from '../../review-ui/ingest.mjs';

let checks = 0;
let failures = 0;
const say = (id, pass, what, detail) => {
  checks++;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${what}${detail ? `\n           ${detail}` : ''}`);
};

const fixtures = loadFixtures();

// --- TC1: there is a corpus at all -------------------------------------------------------------
// Coverage asserted, not assumed (BUG-003/019). Zero fixtures would make every row below pass.
say('TC1', fixtures.length > 0, 'the fixture corpus is non-empty',
  `${fixtures.length} fixture(s): ${fixtures.map((f) => f.fixture_id).join(', ')}`);

// --- TC2: one product each ----------------------------------------------------------------------
const products = fixtures.map((f) => ({ fixture: f.fixture_id, product: productFor(f.fixture_id) }));
const distinct = new Set(products.map((p) => p.product));
say('TC2', distinct.size === fixtures.length,
  'each fixture is its own product — ten first documents, not one and nine follow-ups',
  `${distinct.size} product(s) for ${fixtures.length} fixture(s), prefix ${PRODUCT_PREFIX}`);

// --- TC3: and every one of them is on the generate road ------------------------------------------
// Asked of the SHIPPED decision function. A reimplementation here would agree with itself.
const roads = products.map((p) => ({ ...p, ...routeFor(p.product) }));
const delta = roads.filter((r) => r.route !== 'generate');
say('TC3', delta.length === 0 && roads.length > 0,
  'every fixture routes to GENERATE, asked of the function WF1 decides with',
  delta.length
    ? delta.map((d) => `${d.fixture}: ${d.route_reason}`).join('\n           ')
    : `${roads.length} of ${roads.length} — e.g. ${roads[0].fixture}: ${roads[0].route_reason}`);

// --- TC4: the blast radius of an approval is one fixture ------------------------------------------
// Not a restatement of TC2. TC2 says the products differ; this says WHY that is the property
// worth having — under one shared product a single sign-off changes the meaning of every case.
say('TC4', distinct.size === fixtures.length,
  'an approval in one fixture\'s product contaminates one fixture, not the corpus',
  `worst case ${fixtures.length ? (1 / fixtures.length * 100).toFixed(0) : 0}% of the corpus,`
  + ' against 100% when all ten shared a product');

// --- TC5: the flag is gone from the normal path ---------------------------------------------------
// Read from the producer's source. "It was removed" is a claim about a file, so read the file.
{
  const src = readFileSync('evals/harness/produce.mjs', 'utf8');
  const uses = [...src.matchAll(/dispatch:\s*false/g)];
  // The one surviving use is `--ingest-only`, which means "the door and nothing else" and is a
  // different statement from "the corpus is wrong". Derived: the occurrence must sit inside a
  // conditional on INGEST_ONLY, on its own line or the line before.
  const guarded = uses.every((m) => {
    const around = src.slice(Math.max(0, m.index - 200), m.index + 60);
    return /INGEST_ONLY\s*\?/.test(around);
  });
  say('TC5', uses.length <= 1 && guarded,
    'the producer sends `dispatch: false` only for --ingest-only, never on the normal path',
    `${uses.length} occurrence(s), ${guarded ? 'all guarded by INGEST_ONLY' : 'UNGUARDED'}`);
}

// --- TC6: the producer goes through the fork ------------------------------------------------------
// The card's actual demand. One post to the door; no second webhook the producer knows about.
{
  const src = readFileSync('evals/harness/produce.mjs', 'utf8');
  const knowsGenerate = /webhook\/generate|N8N_GENERATE_WEBHOOK_URL/.test(src);
  const posts = [...src.matchAll(/await post\(/g)].length;
  say('TC6', !knowsGenerate && posts === 1,
    'the producer posts to ONE door and does not know the generate webhook exists',
    `${posts} post site(s); generate webhook referenced: ${knowsGenerate}`);
}

// --- TC7: the labels did not move with the products -----------------------------------------------
// The card's point 3, verbatim: "they join on fixture, not product — verify that, do not assume
// it." Read from the two files that do the joining.
{
  const labels = readFileSync('evals/harness/labels.mjs', 'utf8');
  const match = readFileSync('evals/harness/match.mjs', 'utf8');
  // `productFor` lives in labels.mjs, so its own definition is not evidence of a join. What
  // would be evidence is a product reaching resolveLabels or the matcher.
  const resolve = labels.slice(labels.indexOf('export function resolveLabels'));
  const joins = /product/i.test(resolve) || /product/i.test(match);
  say('TC7', !joins,
    'labels resolve on fixture text alone — no product reaches resolveLabels or the matcher',
    'a fixture\'s product may change without touching a single label (the card\'s point 3)');
}

console.log('');
console.log(`${checks - failures}/${checks} checks passed.`);
if (failures) {
  console.log('');
  console.log('If TC3 is the red one, something in an eval product was approved. That fixture is');
  console.log('now grading a delta. Find the approval before re-running produce.');
}
process.exitCode = failures ? 1 : 0;
