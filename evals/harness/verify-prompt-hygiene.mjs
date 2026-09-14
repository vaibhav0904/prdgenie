// A prompt must not quote the answer key.
//
// BUG-018: the extraction prompt used "let's call it cut for now" as its worked example of
// what NOT to extract — and that sentence is T3-R07's own supporting quote. Two costs, and
// the second one outlives the bug:
//
//   1. The prompt and the labels contradicted each other outright.
//   2. Even where they agree, a prompt that hands the model a sentence from a graded fixture
//      turns part of C1 into a test of string matching. The model is not being asked to
//      recognise a kind of statement; it is being asked to spot a string it was given.
//
// So this is not a one-off repair. It is a standing check over every prompt and every label.
//
// Usage:  .\run.cmd evals/harness/verify-prompt-hygiene.mjs

import { readFileSync, readdirSync } from 'node:fs';

const PROMPT_DIR = 'n8n/prompts';
const LABEL_DIR = 'evals/datasets/labels';

// Short quotes collide by accident — "In." or "Both in." would fire on any prose. The floor
// is set by length in words, not characters, because a long-but-generic fragment is still a
// coincidence and a short distinctive one is still worth catching.
const MIN_WORDS = 4;

const norm = (s) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

// Trim the punctuation at each END of a quote before comparing.
//
// This line is the whole check. Without it the first version of this file PASSED on the very
// prompt BUG-018 was filed against, and said so out loud: the label reads
//   "Let's call it cut for now."   (a sentence, so the answer key keeps the full stop)
// and the prompt read
//   "let's call it cut for now"    (dropped into a sentence of its own, so it does not)
// An exact substring test on the whole quote misses by one character, and a check that
// cannot catch its own founding case is decoration. Interior punctuation is left alone —
// that is a genuinely different sentence, not the same one re-punctuated.
const trimEnds = (s) => s.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');

const prompts = readdirSync(PROMPT_DIR)
  .filter((n) => n.endsWith('.md'))
  .map((n) => ({ name: n, text: norm(readFileSync(`${PROMPT_DIR}/${n}`, 'utf8')) }));

// Every quote string in every label file, whatever it supports — requirements, open
// questions, injections. A quote is a quote.
const quotes = [];
for (const file of readdirSync(LABEL_DIR).filter((n) => n.endsWith('.json'))) {
  const labels = JSON.parse(readFileSync(`${LABEL_DIR}/${file}`, 'utf8'));
  const walk = (node, id) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, id));
    if (!node || typeof node !== 'object') return;
    const label = node.label_id ?? id;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'quotes' && Array.isArray(value)) {
        value.forEach((q) => quotes.push({ file, label, quote: q }));
      } else {
        walk(value, label);
      }
    }
  };
  walk(labels, null);
}

const checked = quotes
  .map((q) => ({ ...q, needle: trimEnds(norm(q.quote)) }))
  .filter((q) => q.needle.split(' ').filter(Boolean).length >= MIN_WORDS);
const skipped = quotes.length - checked.length;

const hits = [];
for (const q of checked) {
  for (const p of prompts) {
    if (p.text.includes(q.needle)) hits.push({ ...q, prompt: p.name });
  }
}

// Coverage, asserted rather than assumed (BUG-003). "0 hits" over 0 quotes, or over a
// prompt directory that failed to list, is not a pass — it is a check that ran on nothing.
console.log(`Prompts scanned:  ${prompts.length}  (${prompts.map((p) => p.name).join(', ') || 'NONE'})`);
console.log(`Label files:      ${readdirSync(LABEL_DIR).filter((n) => n.endsWith('.json')).length}`);
console.log(`Quotes found:     ${quotes.length}`);
console.log(`Quotes checked:   ${checked.length}  (${skipped} shorter than ${MIN_WORDS} words, skipped as collision-prone)`);
console.log();

let failed = false;

if (prompts.length === 0) {
  console.error(`FAIL  no prompts found in ${PROMPT_DIR} — the check examined nothing.`);
  failed = true;
}
if (checked.length === 0) {
  console.error(`FAIL  no quotes long enough to check — the check examined nothing.`);
  failed = true;
}

if (hits.length) {
  failed = true;
  console.error(`FAIL  ${hits.length} fixture quote(s) appear verbatim in a prompt:`);
  for (const h of hits) {
    console.error(`  ${h.prompt}  <-  ${h.file} ${h.label ?? ''}`);
    console.error(`      "${h.quote}"`);
  }
  console.error();
  console.error('A prompt that quotes a graded fixture makes part of that fixture a test of');
  console.error('string matching. Rewrite the instruction with an invented example.');
} else if (!failed) {
  console.log(`PASS  no prompt quotes any labelled fixture (${checked.length} quotes x ${prompts.length} prompt(s)).`);
}

process.exitCode = failed ? 1 : 0;
