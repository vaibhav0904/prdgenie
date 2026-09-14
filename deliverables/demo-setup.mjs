// The whole demo setup, as one double-click, with the answer in a browser.
//
// WHY THIS EXISTS. The setup was eight typed commands, and over two days the SETUP — never the
// product — produced every failure that mattered: a stack trace at step 2 (BUG-074), a run sheet
// that never said which window to type in, and a "Window A / Window B" abstraction its only
// reader could not use. The riskiest part of the release was the part that is not the project.
//
// So: `2-SET-UP-THE-DEMO.cmd` runs this, this runs the four steps that already work, and the
// answer opens in a browser instead of scrolling past in a console.
//
// IT DOES NOT REIMPLEMENT ANYTHING. Each step is the existing script, run as a child process the
// same way `run.cmd` runs it. They are not imported: all three are top-level scripts that call
// `process.exit`, and importing one would end this one. Running them as children also means the
// manual path stays exactly as it was — if this orchestrator is wrong, nothing it wraps is.
//
// AND IT DOES NOT PARSE THEIR OUTPUT. Each step writes what it decided into `.demo-state.json`
// (see `demo-state.mjs`); this reads that. A summary scraped out of printed text is a contract
// nobody declared — it breaks when a sentence is reworded, silently, which is the only kind of
// breakage that reaches a recording.
//
// Usage:  double-click 2-SET-UP-THE-DEMO.cmd
//         .\run.cmd deliverables\demo-setup.mjs            the same thing
//         .\run.cmd deliverables\demo-setup.mjs --cheap    skip the live ingest (free, unproven)
//         .\run.cmd deliverables\demo-setup.mjs --no-open  write the page, open nothing

import { spawnSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readState } from './demo-state.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATUS_PATH = join(REPO, 'deliverables', '.demo-status.html');
const CHEAP = process.argv.includes('--cheap');
const NO_OPEN = process.argv.includes('--no-open');

const steps = [];

/**
 * One setup step, run the way `run.cmd` runs it: this Node, the same `--env-file-if-exists`, and
 * cwd pinned to the repo root, because every one of these scripts reads fixtures by relative path
 * and a double-clicked launcher does not necessarily start where a prompt would.
 */
function step(label, what, script, args = []) {
  process.stdout.write(`  ${label} ${what} ... `);
  const started = Date.now();
  const r = spawnSync(process.execPath, ['--env-file-if-exists=.env', script, ...args], {
    cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const ok = r.status === 0;
  console.log(`${ok ? 'ok' : 'FAILED'}  (${secs}s)`);
  steps.push({ label, what, script, args, ok, code: r.status, secs, out });
  return ok;
}

console.log('');
console.log('SETTING UP THE DEMO');
console.log('─'.repeat(70));
console.log('');
console.log(CHEAP
  ? '  Cheap mode: the pieces are checked, the whole path is not proven.'
  : '  This takes about three minutes and costs a few cents in model calls.');
console.log('');

// --- 1. is this machine ready, and which version -----------------------------------------------
const readinessOk = step('1/4', 'checking the machine end to end',
  'deliverables/demo-readiness.mjs', CHEAP ? [] : ['--live']);

let state = readState();
const version = state.readiness?.version ?? null;

// STOP HERE ON NO-GO. Carrying on would prep a version that may not exist, ingest against a door
// that may be shut, and end by opening five tabs onto a broken machine — which is a worse place to
// discover it than this line.
if (readinessOk && version) {
  step('2/4', `leaving v${version} three clicks from sign-off`,
    'deliverables/demo-prep.mjs', [String(version)]);
  step('3/4', 'building the hostile-transcript tab', 'deliverables/demo-injection.mjs');
} else {
  console.log('');
  console.log('  Stopping here. The machine is not ready, and the page will say what to fix.');
}

// --- 4. the follow-up transcript, onto the clipboard -------------------------------------------
//
// `show-fixture.mjs T2 --raw` already exists "for a pipe". `clip.exe` is the pipe. This removes
// the last manual step of the old setup — selecting a transcript out of a console by eye and
// hoping nothing else touches the clipboard before the form.
let clipped = false;
if (readinessOk) {
  const fx = spawnSync(process.execPath,
    ['--env-file-if-exists=.env', 'evals/harness/show-fixture.mjs', 'T2', '--raw'],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (fx.status === 0 && (fx.stdout ?? '').length > 400) {
    const clip = spawnSync('cmd', ['/c', 'clip'], { input: fx.stdout, encoding: 'utf8' });
    clipped = clip.status === 0;
  }
  console.log(`  4/4 putting the follow-up transcript on your clipboard ... ${clipped ? 'ok' : 'FAILED'}`);
  steps.push({
    label: '4/4', what: 'the follow-up transcript (T2) on the clipboard', script: 'evals/harness/show-fixture.mjs',
    args: ['T2', '--raw'], ok: clipped, code: clipped ? 0 : 1, secs: '0',
    out: clipped ? `${(fx.stdout ?? '').length} characters copied.` : 'Could not reach clip.exe.',
  });
}

state = readState();

// --- the page ----------------------------------------------------------------------------------
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const go = Boolean(state.readiness?.go);
const inj = state.injection ?? {};
const prep = state.prep ?? {};

const tabs = go ? [
  ['1', 'The deck', `file:///${join(REPO, 'deliverables', 'deck', 'presentation.html').replace(/\\/g, '/')}`,
    'Press F11 for full screen. Arrow keys move between slides.'],
  ['2', 'Demo 1 &mdash; the review screen', state.readiness?.review_url,
    `v${version}. ${prep.left ?? '?'} items left to decide on camera${prep.amber_left ? ', including the amber one' : ''}.`],
  ['3', 'Demo 3 &mdash; the ingest form', state.readiness?.form_url,
    'n8n&rsquo;s own form. Five fields, four required. T2 is already on your clipboard.'],
  ['4', 'Demo 4 &mdash; the hostile transcript', inj.review_url,
    `v${inj.version ?? '?'}. Click a citation chip first, then Ctrl+F.`],
  ['5', 'Demo 3 &mdash; the delta view', state.readiness?.history_url,
    'Where the result of the form appears. The form does not take you here.'],
].filter((t) => t[2]) : [];

const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${!go ? 'Not ready yet' : CHEAP ? 'Ready, not proven' : 'Ready to record'} &mdash; PRD Genie</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
:root{ --paper:#fbfaf8; --panel:#fff; --ink:#16181c; --soft:#5c5f66; --faint:#8b8e95;
  --rule:#e4e0d8; --green:#1f6f4a; --green-soft:#eef5f0; --red:#a3282a; --red-soft:#fbeded;
  --amber:#a8620d; --amber-soft:#fbf2e6; --stage:#f4f1ec;
  --serif:"Instrument Serif",Georgia,serif; --sans:"Public Sans",-apple-system,"Segoe UI",sans-serif;
  --mono:"JetBrains Mono",ui-monospace,Consolas,monospace; }
@media (prefers-color-scheme: dark){ :root{
  --paper:#15171b; --panel:#1c1f25; --ink:#eceae6; --soft:#a3a7b0; --faint:#7c818b;
  --rule:#2c3038; --green:#5fbb8c; --green-soft:#152a20; --red:#e59191; --red-soft:#2e1a1a;
  --amber:#dda05a; --amber-soft:#2c2216; --stage:#101216; } }
*{box-sizing:border-box}
body{ margin:0; background:var(--stage); color:var(--ink); font-family:var(--sans);
  padding:clamp(18px,4vw,48px); }
.wrap{ max-width:64rem; margin:0 auto; display:grid; gap:20px; }
.verdict{ background:var(--panel); border:1px solid ${go ? 'var(--green)' : 'var(--red)'};
  border-left:6px solid ${go ? 'var(--green)' : 'var(--red)'};
  border-radius:12px; padding:24px 28px; }
.verdict h1{ font:400 clamp(30px,4vw,46px)/1.1 var(--serif); margin:0 0 8px;
  color:${go ? 'var(--green)' : 'var(--red)'}; }
.verdict p{ font:400 15px/1.6 var(--sans); color:var(--soft); margin:0; max-width:70ch; }
.verdict strong{ color:var(--ink); font-weight:600; }
h2{ font:600 11.5px/1 var(--sans); letter-spacing:.11em; text-transform:uppercase;
  color:var(--green); margin:8px 0 0; }
.card{ background:var(--panel); border:1px solid var(--rule); border-radius:11px; padding:6px 22px 18px; }
a.tab{ display:grid; grid-template-columns:2.4rem 1fr; gap:0 16px; align-items:baseline;
  padding:14px 0; border-bottom:1px solid var(--rule); text-decoration:none; color:inherit; }
a.tab:last-child{ border-bottom:0 }
a.tab:hover .t{ text-decoration:underline }
a.tab .n{ font:500 12px/1.6 var(--mono); color:var(--green) }
a.tab .t{ font:500 15px/1.4 var(--sans); color:var(--ink) }
a.tab .d{ font:400 13px/1.5 var(--sans); color:var(--soft); grid-column:2; margin-top:3px }
a.tab .u{ font:400 11.5px/1.5 var(--mono); color:var(--faint); grid-column:2; margin-top:3px;
  overflow-wrap:anywhere }
table.k{ width:100%; border-collapse:collapse }
table.k td{ border-top:1px solid var(--rule); padding:10px 10px 10px 0;
  font:400 13.5px/1.5 var(--sans); vertical-align:top }
table.k td:first-child{ color:var(--soft); width:34% }
table.k strong{ font-weight:600 }
.fix{ background:var(--red-soft); border:1px solid var(--red); border-radius:8px;
  padding:14px 16px; margin:12px 0 0 }
.fix .w{ font:500 14px/1.5 var(--sans); color:var(--ink) }
.fix .f{ font:400 13px/1.55 var(--mono); color:var(--soft); margin-top:6px; overflow-wrap:anywhere }
details{ border-top:1px solid var(--rule); padding:12px 0 0; margin-top:12px }
summary{ cursor:pointer; font:500 13px/1.5 var(--sans); color:var(--soft) }
pre{ background:var(--stage); border:1px solid var(--rule); border-radius:8px; padding:14px 16px;
  font:400 12px/1.6 var(--mono); overflow-x:auto; white-space:pre; margin:12px 0 0 }
.foot{ font:400 12.5px/1.6 var(--sans); color:var(--faint); max-width:70ch }
.foot code{ font:400 .92em var(--mono) }
code{ font:400 .92em var(--mono) }
</style></head><body><div class="wrap">

<div class="verdict">
  <h1>${!go ? 'Not ready yet.' : CHEAP ? 'Ready &mdash; but not proven.' : 'Ready to record.'}</h1>
  <p>${go
    ? `Everything is up${CHEAP ? '' : ', and a real document went through the whole pipeline just now'}. `
      + `Your tabs are open behind this page. ${clipped
        ? '<strong>The follow-up transcript is already on your clipboard</strong> &mdash; paste it into the form with Ctrl+V and do not copy anything else before you record.'
        : 'The clipboard copy did not work; use the appendix command for T2.'}`
    : 'Nothing was changed. Fix the items below and double-click <strong>2-SET-UP-THE-DEMO.cmd</strong> again.'}</p>
</div>

${state.readiness?.failures?.length ? `
<div class="card">
  <h2>Fix these, in this order</h2>
  ${state.readiness.failures.map((f) => `<div class="fix">
    <div class="w">${esc(f.what)}</div>
    <div class="f">${esc(f.fix ?? '')}</div>
  </div>`).join('')}
</div>` : ''}

${tabs.length ? `
<div class="card">
  <h2>Your tabs &mdash; already open, click to reopen one</h2>
  ${tabs.map(([n, t, u, d]) => `<a class="tab" href="${esc(u)}" target="_blank" rel="noopener">
    <span class="n">${n}</span><span class="t">${t}</span>
    <span class="d">${d}</span><span class="u">${esc(u)}</span>
  </a>`).join('')}
</div>` : ''}

${go ? `
<div class="card">
  <h2>What this run decided</h2>
  <table class="k"><tbody>
    <tr><td>Demo 1 &mdash; the version you sign off</td><td><strong>v${esc(version)}</strong>
      &middot; ${esc(state.readiness?.reqs)} requirements, ${esc(state.readiness?.amber)} amber,
      ${esc(state.readiness?.stories)} stories</td></tr>
    <tr><td>Left to decide on camera</td><td><strong>${esc(prep.left ?? '?')}</strong>
      ${prep.amber_left ? '&middot; one of them is amber, so a plain approve is refused' : '&middot; <strong>no amber one left</strong> &mdash; the override beat will not happen'}
      ${prep.ready ? '&middot; <strong>sign-off is already enabled</strong>, so the counter will not reach zero on camera' : '&middot; sign-off is still refused, which is correct'}</td></tr>
    <tr><td>Demo 4 &mdash; the hostile transcript</td><td><strong>v${esc(inj.version ?? '?')}</strong>
      &middot; state <code>${esc(inj.state ?? '?')}</code>
      &middot; ${esc(inj.floor_payloads ?? '?')} of ${esc(inj.floor_payloads ?? '?')} attacks resisted${inj.breaches ? ` &middot; <strong>${esc(inj.breaches)} BREACHED &mdash; do not record demo 4</strong>` : ''}</td></tr>
    ${(inj.find ?? []).length ? `<tr><td>Ctrl+F phrases for demo 4</td><td>${
      inj.find.map((f) => `<code>${esc(f.phrase)}</code>`).join('<br>')
    }</td></tr>` : ''}
    <tr><td>Proven end to end?</td><td>${CHEAP
      ? '<strong>No.</strong> Cheap mode ran. Every piece is up; the whole path is unproven.'
      : '<strong>Yes.</strong> A document went in and a PRD came out during this run.'}</td></tr>
  </tbody></table>
</div>` : ''}

<div class="card">
  <h2>Every step, and exactly what it printed</h2>
  ${steps.map((s) => `<details>
    <summary>${s.ok ? 'ok' : 'FAILED'} &nbsp; ${s.label} &nbsp; ${esc(s.what)} &nbsp;&middot;&nbsp; ${s.secs}s &nbsp;&middot;&nbsp; <code>${esc(s.script)} ${esc(s.args.join(' '))}</code></summary>
    <pre>${esc(s.out)}</pre>
  </details>`).join('')}
</div>

<p class="foot">Written by <code>deliverables/demo-setup.mjs</code> at ${new Date().toLocaleString()}.
This page is regenerated every time you double-click <code>2-SET-UP-THE-DEMO.cmd</code>, and it
describes that run only. Nothing here is a claim about a run you did earlier.</p>

</div></body></html>`;

writeFileSync(STATUS_PATH, html, 'utf8');

// --- open it ------------------------------------------------------------------------------------
// `start` with an empty first argument: the first quoted argument to `start` is the WINDOW TITLE,
// so a URL in quotes without it opens a console window called that URL and nothing else.
function open(url) {
  try { spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref(); }
  catch { /* reported by the summary below */ }
}

console.log('');
if (!NO_OPEN) {
  for (const [, , url] of tabs) open(url);
  open(STATUS_PATH.replace(/\\/g, '/'));
  console.log(`  Opened ${tabs.length} tab(s) and the results page in your browser.`);
} else {
  console.log(`  Wrote ${STATUS_PATH}`);
}
console.log('');
console.log(NO_OPEN
  ? (go ? '  GO. Open the page above to read it.' : '  NOT READY. Open the page above; it says what to fix.')
  : (go ? '  GO. Read the page that just opened, then start recording.'
        : '  NOT READY. The page that just opened says what to fix.'));
console.log('');
process.exitCode = go ? 0 : 1;
