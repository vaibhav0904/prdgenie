// EVERY STANDING CHECK, IN ONE VERDICT — the repair BUG-038 actually asked for.
//
// The missing `spine-ok` comment was the symptom. The finding was this: `check-spine.mjs` was
// red for a day while E8-S1, S2 and S4 all shipped green, because each story ran the verifiers
// it had written and nothing ran the ones it hadn't. **A verifier a story does not own is a
// verifier a story does not run** — and with thirty-odd audits scattered across three
// directories, "the audits pass" quietly meant "the audits I remembered pass".
//
// THE LIST IS DERIVED, NOT TYPED. Every `.mjs` in the three script directories is either RUN
// or DECLARED below with a reason, and a file that is neither **fails this check**. That is
// the same rule the audits themselves follow (CLAUDE.md: a check must assert its own
// coverage, derived not typed) — because a runner with a hand-written list is a runner that
// silently stops covering whatever was added after it.
//
// Usage:  .\run.cmd check-all.mjs            every standing check
//         .\run.cmd check-all.mjs --list     what it would run, and what it declines
//
// Exit code is non-zero if any check fails OR if any script is neither run nor declared.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { takeExclusive, exclusiveEnvFor } from './exclusive.mjs';

// `deliverables` and `deliverables/deck` were added 2026-09-07. The demo tools and the deck
// builder are executable scripts, and a whole directory of scripts sitting outside the scan is
// exactly the hole this file exists to close (BUG-070). The scan is not recursive, so both are
// named rather than one implying the other.
const DIRS = ['n8n/scripts', 'review-ui/scripts', 'evals/harness', 'deliverables', 'deliverables/deck'];

// What a "standing check" is: it asserts something and exits non-zero when the assertion
// fails, and it costs nothing but time. Prefixes rather than names, so a new verifier written
// tomorrow is picked up without editing this file.
const RUNS = [/^check-/, /^verify-/, /^negative-control/, /^audit-/, /^recompute-/];

// NOT checks, each with the reason it is not one. These are declarations, not exemptions: the
// reason prints on `--list`, and a script that stops matching this map starts failing.
const DECLARED = {
  // --- tools, not assertions
  'bind-provider-credential.mjs': 'a setup tool — it changes n8n, it asserts nothing',
  'provision-internal-credential.mjs': 'setup tool, same reason',
  'import-workflows.mjs': 'deploys the repo into n8n; running it here would deploy mid-check',
  'deploy-hosted.mjs': 'setup tool for an n8n with no Docker shell; it deploys through the API, so running it here would deploy mid-check',
  'export-workflows.mjs':
    'OVERWRITES every file in n8n/workflows from the running instance — the mirror of import, '
    + 'and a sweep that rewrote the exports mid-run would have every workflow checker reading a '
    + 'file it did not start with. Its GATE, check-export-hygiene, runs here every sweep instead',
  'sync-prompts.mjs': 'writes prompts into workflows — a generator, not a check (its drift check is check-injection-layers)',
  'init-db.mjs': 'creates the schema; a check that creates what it checks is BUG-001',
  'preflight.mjs': 'run.cmd already runs it before every bare invocation',
  'query.mjs': 'prints rows for a human to read; no verdict',
  'fake-provider.mjs': 'a stand-in server the drills start; nothing to assert alone',
  'weekly-report.mjs': 'writes a report; verify-weekly is the check for it',
  'judge-sweep.mjs': 'CALLS A PAID PROVIDER. Never in a check that runs unattended',
  'labels.mjs': 'a library the harness imports',
  'match.mjs': 'a library the harness imports',
  'grade.mjs': 'the eval grader — run per case via /eval, and it needs a produce run first',
  'produce.mjs': 'CALLS A PAID PROVIDER, and replays every fixture',
  'show-fixture.mjs': 'prints a fixture for a human to paste into the ingest form; no verdict',
  'demo-readiness.mjs': 'a GO/NO-GO for a person about to record; --live SPENDS MONEY on a real ingest',
  'demo-prep.mjs': 'writes real review decisions into a chosen version; a setup tool, never unattended',
  'demo-setup.mjs': 'the whole demo setup as one double-click — it runs demo-readiness --live, '
    + 'demo-prep and demo-injection as child processes, so a sweep that ran it would spend money '
    + 'three times over and prepare a version nobody asked for. Every step it runs IS checked here, '
    + 'individually, which is the point: it orchestrates, it asserts nothing of its own',
  'demo-state.mjs': 'the small JSON file the setup steps use to tell the launcher what they '
    + 'decided, instead of the launcher parsing their console output. Two functions, no assertions',
  'demo-injection.mjs': 'ingests the hostile fixture through the real door to build the demo-4 browser '
    + 'tab; SPENDS MONEY and adds a row every run. It checks the same floor C6 checks, but it is '
    + 'setup, not a check — a sweep that quietly bought a model call every time would be a sweep '
    + 'nobody runs twice',
  'build-deck.mjs': 'renders the two decks from slides.mjs; a generator, and its count guard is the gate',
  'slides.mjs': 'the deck content — a data module the builder imports',
  'prove-the-gate.mjs':
    'a DEMONSTRATION instrument for the video: it attempts the forbidden write live and rolls it '
    + 'back. verify-gate and verify-review-gate are the checks; this exists to be watched',
  'spread.mjs': 'CALLS A PAID PROVIDER three times over; run before publishing a figure',
  'verify-pm-document.mjs':
    'CALLS A PAID PROVIDER twice (a brief, then a follow-up transcript) and signs off a real '
    + 'version. A UAT for E6-S6, transcribed in the story; run deliberately, not every sweep',
  'report-gaps.mjs': 'prints a gap listing for a human',
  'probe-delta.mjs': 'CALLS A PAID PROVIDER — a probe, and its findings are on E6-S5',
  'probe-missing-deadline.mjs': 'CALLS A PAID PROVIDER — a probe',

  // --- controls that DEPLOY: the prefix earned them a place here, what they do took it away
  //
  // Both of these swap something into a live workflow, import it, measure, and swap back. That
  // is a drill wearing a control's name, and running one unattended means a sweep of checks can
  // change what the product runs — which is exactly what happened (BUG-053), and what an
  // overlapping pair of sweeps then failed to undo (BUG-054).
  //
  // `check-deployed-prompts.mjs` is the cheap standing check that covers the hazard: the prompt
  // in the repository is the prompt in the shipped workflow, every sweep, for nothing.
  'negative-control-clause.mjs':
    'CALLS A PAID PROVIDER six times and DEPLOYS a non-shipping prompt into WF2; run deliberately (BUG-053)',
  'negative-control-error-routing.mjs':
    'mutates WF0 and WF2, re-imports, restarts n8n four times, and TC15 costs a fixture of model calls',

  // --- drills: they take something away and put it back
  'drill-judge-unavailable.mjs': 'MUTATES WF0 and re-imports it; run deliberately, not in a sweep of checks',
  'drill-provider-failures.mjs': 'mutates the provider binding, same reason',
  'drill-retry-attempts.mjs': 'starts a stand-in provider and re-imports WF0',
  'drill-service-unreachable.mjs': 'stops the review service — it would break every check running beside it',
  'drill-telemetry.mjs': 'starts a stand-in provider and re-imports WF0',
};

// Checks that need a running service or a live n8n. Skipped-with-a-reason when the thing they
// need is absent, and the skip is REPORTED — a check that quietly passes because its
// dependency was missing is the failure this whole file exists to stop.
const NEEDS_N8N = [/^check-/];

const scripts = [];
for (const dir of DIRS) {
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.mjs')).sort()) {
    scripts.push({ dir, file: f, path: join(dir, f) });
  }
}

// COVERAGE, ASSERTED FIRST. Before anything runs: is every script accounted for?
const uncovered = scripts.filter((s) => !RUNS.some((r) => r.test(s.file)) && !(s.file in DECLARED));

// A DECLARATION EXCLUDES. It did not, until BUG-053 tried to use it.
//
// `DECLARED` read like an exclusion list and was only an accounting one: the drills stayed out
// of the sweep because `drill-` matches no prefix in `RUNS`, not because they were declared.
// Declaring a `negative-control-*` therefore changed nothing at all — it appeared in both
// lists, and ran anyway.
//
// The two are now the same fact. `EXCLUDED` names the scripts a prefix would have run and a
// declaration keeps out, and it is printed on every run so an exclusion cannot be quiet.
const EXCLUDED = scripts.filter((s) => RUNS.some((r) => r.test(s.file)) && s.file in DECLARED);
const toRun = scripts.filter((s) => RUNS.some((r) => r.test(s.file)) && !(s.file in DECLARED));

if (process.argv.includes('--list')) {
  console.log(`WOULD RUN (${toRun.length}):`);
  for (const s of toRun) console.log(`  ${s.path}`);
  if (EXCLUDED.length) {
    console.log(`\nHELD OUT (${EXCLUDED.length}) — a prefix would have run these; a declaration keeps them out:`);
    for (const s of EXCLUDED) console.log(`  ${s.path.padEnd(44)} ${DECLARED[s.file]}`);
  }
  console.log(`\nDECLARED NOT A CHECK (${Object.keys(DECLARED).length}):`);
  for (const s of scripts.filter((x) => x.file in DECLARED)) {
    console.log(`  ${s.path.padEnd(44)} ${DECLARED[s.file]}`);
  }
  if (uncovered.length) {
    console.log(`\nUNCOVERED (${uncovered.length}) — these fail the run:`);
    for (const s of uncovered) console.log(`  ${s.path}`);
  }
  process.exit(uncovered.length ? 1 : 0);
}

// ONE SWEEP AT A TIME, and one mutator at a time (BUG-054). Held for the whole run and handed
// to every child through the environment, so a mutating check inside the sweep proceeds while
// the same script started BESIDE the sweep is refused with a sentence — instead of the two
// interleaving until a 600-second timeout kills one and the report blames the script.
//
// Taken here rather than at the top of the file because `--list` changes nothing and should
// never be refused.
const lock = takeExclusive('check-all.mjs', {
  files: ['review-ui/server.js', 'n8n/workflows/*.json', 'n8n/prompts/*.md'],
});

console.log(`Running ${toRun.length} standing check(s) across ${DIRS.length} directories.`);
console.log(`${Object.keys(DECLARED).length} script(s) declared not-a-check; `
  + `${uncovered.length} uncovered.\n`);

const n8nUp = (() => {
  try {
    execFileSync('curl', ['-s', '-o', process.platform === 'win32' ? 'NUL' : '/dev/null',
      '-m', '3', 'http://localhost:5678/'], { stdio: 'ignore' });
    return true;
  } catch { return false; }
})();

// ARE THE DOORS ACTUALLY REGISTERED (BUG-058)?
//
// n8n answering on :5678 is not the same fact as its webhooks being registered. In the incident
// this comes from, n8n was up for four hours, reported WF1 **active**, and answered every door
// with "not registered" — and the sweep ran the door checks against it and produced two red rows
// with a true message and a completely misleading cause.
//
// A sweep that reports "the door check failed" when the door is shut is reporting the symptom as
// the defect. Asked once, here, with a GET that starts nothing.
const doorsUp = await (async () => {
  if (!n8nUp) return false;
  try {
    const { doorsFromWorkflows, probeDoor } = await import('./n8n/scripts/check-doors-registered.mjs');
    const doors = doorsFromWorkflows();
    if (!doors.length) return false;
    for (const d of doors) if (await probeDoor(d) !== 'registered') return false;
    return true;
  } catch { return false; }
})();

// WHICH CHECKS NEED A LIVE DOOR, derived from what they DO rather than from a list here: a
// script that fetches a `/webhook/` path dials a door. `check-doors-registered` dials one too
// and must never be skipped — it is the script whose whole job is to say the doors are shut.
const DOOR_CHECKER = 'check-doors-registered.mjs';
const dialsADoor = (s) => {
  if (s.file === DOOR_CHECKER) return false;
  try {
    const src = readFileSync(s.path, 'utf8');
    return /\/webhook\/|N8N_INGEST_WEBHOOK_URL/.test(src);
  } catch { return false; }
};

const results = [];
for (const s of toRun) {
  const started = Date.now();
  if (!n8nUp && NEEDS_N8N.some((r) => r.test(s.file))) {
    results.push({ ...s, status: 'skipped', detail: 'n8n is not answering on :5678', ms: 0 });
    process.stdout.write(`SKIP  ${s.path}\n`);
    continue;
  }
  if (n8nUp && !doorsUp && dialsADoor(s)) {
    results.push({
      ...s,
      status: 'skipped',
      detail: 'a declared door is not registered — run check-doors-registered.mjs; this check '
        + 'would fail for that reason and report it as its own (BUG-058)',
      ms: 0,
    });
    process.stdout.write(`SKIP  ${s.path.padEnd(44)} the doors are shut\n`);
    continue;
  }
  try {
    const out = execFileSync(process.execPath, ['--env-file-if-exists=.env', s.path],
      // The lock travels to the child. Without this line every mutating check inside the sweep
      // would queue behind its own parent and be refused — a lock that stops the thing it
      // protects. `check-exclusive.mjs` asserts the handoff by name, because nothing else here
      // would have noticed it missing until a sweep went red for the wrong reason.
      { encoding: 'utf8', timeout: 600000, env: { ...process.env, ...exclusiveEnvFor() } });
    const tail = out.trim().split('\n').filter(Boolean).slice(-40)
      .find((l) => /passed|agreed|PASS\b|earned/.test(l)) ?? '';
    results.push({ ...s, status: 'pass', detail: tail.trim().slice(0, 90), ms: Date.now() - started });
    process.stdout.write(`PASS  ${s.path.padEnd(44)} ${tail.trim().slice(0, 60)}\n`);
  } catch (e) {
    const out = String(e.stdout ?? '') + String(e.stderr ?? '');
    const why = out.split('\n').filter((l) => /^FAIL|Error|CONTROL FAILED/.test(l))[0] ?? `exit ${e.status}`;
    results.push({ ...s, status: 'fail', detail: why.trim().slice(0, 120), ms: Date.now() - started });
    process.stdout.write(`FAIL  ${s.path.padEnd(44)} ${why.trim().slice(0, 60)}\n`);
  }
}

const failed = results.filter((r) => r.status === 'fail');
const skipped = results.filter((r) => r.status === 'skipped');
const secs = (results.reduce((a, r) => a + r.ms, 0) / 1000).toFixed(0);

console.log(`\n${results.length - failed.length - skipped.length}/${toRun.length} passed`
  + `${skipped.length ? `, ${skipped.length} skipped` : ''} in ${secs}s`);

if (skipped.length) {
  console.log('\nSKIPPED, and a skip is not a pass:');
  for (const r of skipped) console.log(`  ${r.path} — ${r.detail}`);
}
if (failed.length) {
  console.log('\nFAILED:');
  for (const r of failed) console.log(`  ${r.path}\n      ${r.detail}`);
}
if (uncovered.length) {
  console.log(`\nNOT COVERED BY THIS RUNNER (${uncovered.length}) — every script must be run or`
    + ' declared, with a reason:');
  for (const s of uncovered) console.log(`  ${s.path}`);
}

// Released here AND on `exit` and on the signals a terminal sends — the explicit call is for
// the reader, the handlers are for the ways a run actually ends.
lock.release();

if (failed.length || uncovered.length) process.exit(1);

console.log(`
WHAT THIS DOES NOT RUN, deliberately: the drills, which take a provider or the service away
and put it back, and anything that calls a paid provider. Those are named above with their
reasons and are run on purpose, not on a schedule. --list prints the whole accounting.`);
