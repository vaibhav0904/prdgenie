// BUG-041. What a stored provider message has to keep, checked against the SHIPPED node.
//
// The bug was that `skipped_detail` truncated Google's quota error one word before the metric
// name — the only part that says WHICH quota, and so whether a key is on a daily cap, calling
// too fast, or never reached the paid tier. The record could not tell those three apart.
//
// THE FIX'S OWN FIRST ATTEMPT IS WHY THIS FILE EXISTS. `bounded()` was written correctly,
// checked as standalone JavaScript, and shipped into the workflow with its `\s` eaten by the
// shell on the way in — so the node ran `/s+/g` and replaced every letter *s* with a space.
// The standalone check passed. The stored value read "plea e check your plan and billing
// detail ". A helper verified as a copy of itself is not a helper that was verified
// (CLAUDE.md: test each entry through itself).
//
// So this extracts `bounded` FROM the workflow JSON and executes THAT.
//
// Usage:  .\run.cmd review-ui/scripts/verify-detail-budget.mjs

import { readFileSync } from 'node:fs';

const WF0 = 'n8n/workflows/WF0-llm-call.json';
const CAP = 300;

let checks = 0; let failures = 0;
const say = (id, pass, msg, detail = '') => {
  checks++;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${msg}${detail ? `  — ${detail}` : ''}`);
};

const wf = JSON.parse(readFileSync(WF0, 'utf8'));
const node = wf.nodes.find((n) => n.name === 'Parse or park');
const code = node?.parameters?.jsCode ?? '';

const src = code.match(/const bounded = \([\s\S]*?\n};/);
say('TC1', Boolean(src), 'the shipped node defines the truncation helper',
  src ? `${src[0].length} chars lifted from ${WF0}` : 'NOT FOUND');
if (!src) { console.log('\nCannot verify what is not there.'); process.exit(1); }

// Executed, not read. A regex that looks right and a regex that runs right are different
// claims, and only one of them is what the provider's message meets.
// eslint-disable-next-line no-new-func
const bounded = new Function(`${src[0]}\nreturn bounded;`)();

say('TC2', code.includes('detail: bounded(e?.message)'),
  'and the provider-error path actually calls it',
  code.includes('.slice(0, 300)') ? 'a raw 300-char slice still survives somewhere' : 'no raw slice left on that path');

// The real message, as the provider sent it on 2026-09-04 (sweep #21, free tier, limit 20).
const REAL = 'You exceeded your current quota, please check your plan and billing details. For more '
  + 'information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To '
  + 'monitor your current usage, head to: https://ai.dev/rate-limit.\n'
  + '* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, '
  + 'limit: 20, model: gemini-3.8-flash\nPlease retry in 2.678110283s.';

const out = bounded(REAL);

say('TC3', out.length <= CAP, 'the cap still holds — an unbounded provider string is a liability',
  `${out.length} of ${CAP}`);

say('TC4', /generate_content_free_tier_requests/.test(out),
  'THE METRIC NAME SURVIVES — the part that says which quota was exceeded',
  /free_tier/.test(out) ? 'free_tier is legible in the stored value' : 'LOST');

say('TC5', /limit: 20/.test(out) && /gemini-3\.8-flash/.test(out),
  'and so do the limit and the model it applied to');

say('TC6', out.startsWith('You exceeded your current quota'),
  'the head is kept too — a reader still sees what kind of error it was');

// THE REGRESSION THAT SHIPPED. Every letter s became a space, and the value still looked
// plausible enough to read past. Checked as a property of the OUTPUT, not of the source.
const intact = ['please check your plan and billing details', 'https://', 'free_tier_requests'];
const eaten = intact.filter((phrase) => !out.includes(phrase) && REAL.includes(phrase));
say('TC7', eaten.length === 0,
  'letters are not being eaten — the whitespace regex is a regex, not the letter it looks like',
  eaten.length ? `MANGLED: ${eaten.join(' | ')}` : `${intact.length} phrases survive character-for-character`);

say('TC8', out.includes('…'), 'the join is visible, so a spliced string is not read as a whole one');

// A message that fits is returned untouched: the budget only spends itself when it must.
const short = 'insufficient_quota';
say('TC9', bounded(short) === short, 'a message under the cap passes through unchanged');

// And the counter-control: a head-only truncation WOULD lose the metric, which is what makes
// the fix load-bearing rather than decorative.
const headOnly = REAL.replace(/\s+/g, ' ').trim().slice(0, CAP);
say('TC10', !/generate_content_free_tier_requests/.test(headOnly),
  'CONTROL: the old head-only truncation really did lose the metric name',
  `${headOnly.length} chars, ending "...${headOnly.slice(-24)}"`);

// THE CONTROL. Reintroduce the exact regression — `\s` becomes `s` — in memory, and TC7's
// condition must go red. Done here rather than by editing the workflow because the shell is
// what ate the backslash in the first place, and a control a shell can silently no-op is a
// control that proves nothing. (The first attempt at this control did exactly that: the
// substitution never applied, the check stayed green, and it looked like a pass.)
const brokenSrc = src[0].replace('/\\s+/g', '/s+/g');
say('TC11a', brokenSrc !== src[0], 'CONTROL: the regression can be reintroduced for the test',
  brokenSrc === src[0] ? 'SUBSTITUTION DID NOT APPLY — this control is a no-op' : 'applied in memory');
// eslint-disable-next-line no-new-func
const brokenOut = new Function(`${brokenSrc}\nreturn bounded;`)()(REAL);
const stillIntact = intact.filter((phrase) => brokenOut.includes(phrase) || !REAL.includes(phrase));
say('TC11b', stillIntact.length < intact.length,
  'CONTROL: with the regression back, TC7 goes red and the mangling is visible',
  `"${brokenOut.slice(0, 46)}…"`);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log('\nThe cap does not move to make this green. What moves is how the cap is spent.');
  process.exit(1);
}
console.log(`
Stored value, as the node produces it:

  ${out}`);
