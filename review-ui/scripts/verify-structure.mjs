// The instrument for E3-S1, S2 and S3: does code own every link and the one number?
//
// Exercised against `structure.mjs` directly, without a model call. C3 measures the same
// properties on real output; this file measures that the rules can fire at all — and, as
// always, that they do not fire on well-formed input.
//
// Usage:  .\run.cmd review-ui/scripts/verify-structure.mjs

import {
  computeScore, validateClusters, validateStories, validateFactors, assertModelDidNotScore,
  IMPACT_VALUES, RANGES,
} from '../structure.mjs';

let failures = 0;
let checks = 0;
const say = (id, pass, msg) => {
  checks++;
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${msg}`);
};

const REQS = [
  { req_id: 'REQ-001', kind: 'functional', statement: 'A user can export a chart as PNG.' },
  { req_id: 'REQ-002', kind: 'nonfunctional', statement: 'The first chart renders in two seconds.' },
  { req_id: 'REQ-003', kind: 'constraint', statement: 'No card numbers are stored.' },
];

const CLUSTERS = {
  epics: [{
    epic_id: 'EPIC-001',
    title: 'Charts a user can take away',
    summary: null,
    features: [{ feature_id: 'FEAT-001', title: 'Chart export', req_ids: ['REQ-001', 'REQ-002'] }],
  }],
};

// --- TC1: the happy path, checked as hard as the failures ---------------------------------
const good = validateClusters(REQS, CLUSTERS);
say('TC1', good.problems.length === 0 && good.epics.length === 1 && good.features.length === 1,
  `a well-formed clustering passes (${good.epics.length} epics, ${good.features.length} features, ${good.problems.length} problems)`);
say('TC1', good.unclustered.length === 1 && good.unclustered[0] === 'REQ-003',
  `a requirement in no feature is REPORTED, not lost (${good.unclustered.join(', ')})`);
say('TC1', good.accounted, 'every requirement is either placed or listed — the property, asserted');
say('TC1', good.ratio === 3, `the requirements-per-epic ratio is surfaced, never capped (${good.ratio})`);

// --- TC2: a reference to a requirement that does not exist --------------------------------
const dangling = validateClusters(REQS, {
  epics: [{ epic_id: 'E1', title: 'x', features: [{ feature_id: 'F1', title: 'y', req_ids: ['REQ-999'] }] }],
});
say('TC2', dangling.problems.some((p) => p.includes('REQ-999')),
  'a feature naming an unknown requirement is reported as a problem, not silently dropped');
say('TC2', dangling.features[0].req_ids.length === 0,
  'and the unknown id does not reach storage');

// --- TC3: a requirement in two features ----------------------------------------------------
const twice = validateClusters(REQS, {
  epics: [{
    epic_id: 'E1', title: 'x',
    features: [
      { feature_id: 'F1', title: 'a', req_ids: ['REQ-001'] },
      { feature_id: 'F2', title: 'b', req_ids: ['REQ-001'] },
    ],
  }],
});
say('TC3', twice.duplicated.includes('REQ-001') && twice.problems.length === 0,
  'a requirement in two features is reported, not rejected — sometimes the honest answer is both');

// --- TC4: stories ---------------------------------------------------------------------------
const stories = validateStories(good.features, REQS, {
  stories: [{
    story_id: 'STORY-001', feature_id: 'FEAT-001',
    as_a: 'analyst', i_want: 'a PNG', so_that: 'I can paste it',
    acceptance_criteria: [
      { criterion: 'The PNG matches the chart resolution.', req_id: 'REQ-001' },
      { criterion: 'It is available within two seconds.', req_id: 'REQ-002' },
    ],
  }],
});
say('TC4', stories.problems.length === 0 && stories.stories.length === 1,
  'a well-formed story passes with its criteria intact');
const badStory = validateStories(good.features, REQS, {
  stories: [{ story_id: 'S1', feature_id: 'FEAT-404', acceptance_criteria: [] }],
});
say('TC4', badStory.problems.some((p) => p.includes('FEAT-404')) && badStory.stories.length === 0,
  'a story attached to an unknown feature is reported and does not reach storage');
const badCriterion = validateStories(good.features, REQS, {
  stories: [{
    story_id: 'S1', feature_id: 'FEAT-001',
    acceptance_criteria: [{ criterion: 'x', req_id: 'REQ-404' }],
  }],
});
say('TC4', badCriterion.problems.some((p) => p.includes('REQ-404')),
  'a criterion citing an unknown requirement is reported');
say('TC4', badCriterion.stories[0].acceptance_criteria.length === 0,
  'and that criterion does not reach storage');
say('TC5', validateStories([{ feature_id: 'FEAT-001' }, { feature_id: 'FEAT-002' }], REQS, { stories: [] })
  .features_without_stories.length === 2,
  'a feature nobody wrote a story for is REPORTED, not skipped');

// --- TC6: factors, and the range rule -------------------------------------------------------
const okFactors = validateFactors(good.features, {
  priority_factors: [{ feature_id: 'FEAT-001', reach: 9, impact: 2, confidence: 0.9, effort: 3 }],
});
say('TC6', okFactors.problems.length === 0 && okFactors.factors.length === 1,
  'valid factors pass');
say('TC6', okFactors.factors[0].priority_score === 5.4,
  `and the score is computed by code: 9 x 2 x 0.9 / 3 = ${okFactors.factors[0].priority_score}`);

const outOfRange = [
  ['reach', { reach: 11, impact: 2, confidence: 0.9, effort: 3 }],
  ['reach', { reach: 0, impact: 2, confidence: 0.9, effort: 3 }],
  ['impact', { reach: 5, impact: 1.5, confidence: 0.9, effort: 3 }],
  ['impact', { reach: 5, impact: 4, confidence: 0.9, effort: 3 }],
  ['confidence', { reach: 5, impact: 2, confidence: 0.4, effort: 3 }],
  ['confidence', { reach: 5, impact: 2, confidence: 1.1, effort: 3 }],
  ['effort', { reach: 5, impact: 2, confidence: 0.9, effort: 0 }],
  ['effort', { reach: 5, impact: 2, confidence: 0.9, effort: 9 }],
];
for (const [name, f] of outOfRange) {
  const r = validateFactors(good.features, { priority_factors: [{ feature_id: 'FEAT-001', ...f }] });
  say('TC7', r.factors.length === 0 && r.problems.some((p) => p.includes(name)),
    `${name}=${f[name]} is REJECTED, never clamped — a clamped value hides a model that misread the scale`);
}

say('TC8', validateFactors(good.features, {
  priority_factors: [{ feature_id: 'FEAT-404', reach: 5, impact: 2, confidence: 0.9, effort: 3 }],
}).problems.some((p) => p.includes('FEAT-404')), 'factors for an unknown feature are reported');

say('TC8', validateFactors([{ feature_id: 'FEAT-001' }, { feature_id: 'FEAT-002' }], {
  priority_factors: [{ feature_id: 'FEAT-001', reach: 5, impact: 2, confidence: 0.9, effort: 3 }],
}).features_without_factors.length === 1, 'a feature nobody scored is reported, not silently unscored');

// --- TC9: the model may not write the number ------------------------------------------------
say('TC9', assertModelDidNotScore([{ feature_id: 'FEAT-001', priority_score: 9.9 }]).length === 1,
  'a model-supplied priority_score is reported as an offender, exactly like a self-certified `grounded`');
say('TC9', assertModelDidNotScore([{ feature_id: 'FEAT-001' }]).length === 0,
  'a clean payload produces no offenders');

// --- TC10: the arithmetic itself ------------------------------------------------------------
const cases = [
  [{ reach: 9, impact: 2, confidence: 0.9, effort: 3 }, 5.4],
  [{ reach: 2, impact: 1, confidence: 0.6, effort: 2 }, 0.6],
  [{ reach: 10, impact: 3, confidence: 1, effort: 1 }, 30],
  [{ reach: 1, impact: 0.25, confidence: 0.5, effort: 8 }, 0],
];
for (const [f, expected] of cases) {
  say('TC10', computeScore(f) === expected,
    `round(${f.reach} x ${f.impact} x ${f.confidence} / ${f.effort}, 1) = ${computeScore(f)}`);
}
say('TC10', IMPACT_VALUES.length === 5 && RANGES.reach[1] === 10 && RANGES.confidence[0] === 0.5,
  'the RICE scales are the published ones, untuned (docs/assumptions.md)');

console.log('');
if (failures) console.error(`FAILED — ${failures} of ${checks} checks.`);
else {
  console.log(`${checks}/${checks} passed. Every id a model refers to is checked against the list it`);
  console.log('was given, everything that could not be placed is reported rather than lost, and the');
  console.log('score is arithmetic the model never touches.');
  console.log('');
  console.log('This is the CODE half. Whether the CLUSTERING IS ANY GOOD is C3 and a human reading');
  console.log('it — and a green run here says nothing about that.');
}
process.exitCode = failures ? 1 : 0;
