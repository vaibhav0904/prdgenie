// Builds BOTH decks from `slides.mjs`, so they cannot disagree about what is on a slide.
//
//   presentation.html  the nine slides Vaibhav screen-shares, one at a time
//   presenter.html     the same nine slides, each with the script and the demo cue
//
// The block renderers are shared. A new block type appears in both decks or in neither, which
// is the only version of "the notes describe the slide" that survives an edit at 1am.
//
// Usage:  .\run.cmd deliverables\deck\build-deck.mjs

import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECK, SLIDES, RUNBOOK } from './slides.mjs';

const OUT = dirname(fileURLToPath(import.meta.url));

// --- the shared design -------------------------------------------------------------------------
//
// The palette is the product's own review-UI palette, extended with a dark set: approval green,
// ungrounded amber, refusal red. The deck is built out of the product's own components — a
// citation block, a metric with its denominator, an amber badge — so that switching from the
// slide to the live demo is visually continuous rather than a jump between two design systems.

const TOKENS = `
:root{
  --paper:#fbfaf8; --panel:#ffffff; --ink:#16181c; --soft:#5c5f66; --faint:#8b8e95;
  --rule:#e4e0d8; --green:#1f6f4a; --green-soft:#eef5f0; --amber:#a8620d; --amber-soft:#fbf2e6;
  --red:#a3282a; --red-soft:#fbeded; --stage:#f4f1ec;
  --shadow:0 1px 2px rgba(20,22,26,.05), 0 8px 24px rgba(20,22,26,.06);
}
:root:not([data-theme="light"]){ }
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --paper:#15171b; --panel:#1c1f25; --ink:#eceae6; --soft:#a3a7b0; --faint:#7c818b;
    --rule:#2c3038; --green:#5fbb8c; --green-soft:#152a20; --amber:#dda05a; --amber-soft:#2c2216;
    --red:#e59191; --red-soft:#2e1a1a; --stage:#101216;
    --shadow:0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.35);
  }
}
:root[data-theme="dark"]{
  --paper:#15171b; --panel:#1c1f25; --ink:#eceae6; --soft:#a3a7b0; --faint:#7c818b;
  --rule:#2c3038; --green:#5fbb8c; --green-soft:#152a20; --amber:#dda05a; --amber-soft:#2c2216;
  --red:#e59191; --red-soft:#2e1a1a; --stage:#101216;
  --shadow:0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.35);
}
`;

const BLOCK_CSS = `
.eyebrow{ font:600 12px/1.3 var(--sans); letter-spacing:.13em; text-transform:uppercase;
  color:var(--green); margin:0 0 18px; }
h1.head{ font:400 clamp(30px,3.5vw,52px)/1.08 var(--serif); letter-spacing:-.015em;
  margin:0 0 26px; text-wrap:balance; color:var(--ink); max-width:24ch; }
h1.head code{ font:400 .84em/1 var(--mono); background:var(--green-soft); color:var(--green);
  padding:.06em .28em; border-radius:5px; }
.lede{ font:400 clamp(15px,1.35vw,19px)/1.55 var(--sans); color:var(--ink); margin:0 0 14px;
  max-width:62ch; }
.kicker{ font:400 clamp(15px,1.4vw,20px)/1.5 var(--sans); color:var(--ink); margin:22px 0 0;
  max-width:60ch; border-left:3px solid var(--green); padding-left:16px; }
.note{ font:400 13.5px/1.55 var(--sans); color:var(--soft); margin:18px 0 0; max-width:74ch; }
.note strong, .lede strong, .kicker strong{ color:var(--ink); font-weight:600; }

.flow{ display:flex; flex-wrap:wrap; align-items:center; gap:5px 4px; margin:0 0 24px; }
.flow span{ font:500 11.5px/1 var(--mono); letter-spacing:.02em; color:var(--soft);
  background:var(--panel); border:1px solid var(--rule); border-radius:4px; padding:6px 9px; }
.flow span.human{ color:var(--green); border-color:var(--green); background:var(--green-soft);
  font-weight:700; }
.flow span.term{ color:var(--green); font-weight:600; }
.flow i{ color:var(--faint); font-style:normal; font-size:11px; }

ul.points{ list-style:none; margin:0; padding:0; display:grid; gap:14px; }
ul.points li{ display:grid; grid-template-columns:minmax(0,20ch) minmax(0,1fr); gap:4px 22px;
  align-items:baseline; padding-bottom:14px; border-bottom:1px solid var(--rule); }
ul.points li:last-child{ border-bottom:0; padding-bottom:0; }
ul.points b{ font:400 15.5px/1.35 var(--sans); color:var(--ink); font-weight:500; }
ul.points span{ font:400 14px/1.5 var(--sans); color:var(--soft); }
ul.points code{ font:400 .9em var(--mono); }

.figs{ display:flex; flex-wrap:wrap; gap:10px; margin:22px 0 0; }
.fig{ flex:1 1 190px; background:var(--panel); border:1px solid var(--rule); border-radius:8px;
  padding:12px 14px; }
.fig .v{ font:600 clamp(21px,2.1vw,29px)/1 var(--sans); font-variant-numeric:tabular-nums;
  color:var(--ink); }
.fig .l{ font:400 12.5px/1.4 var(--sans); color:var(--soft); margin-top:6px; }
.fig.good .v{ color:var(--green); } .fig.good{ border-color:var(--green); background:var(--green-soft); }
.fig.warn .v{ color:var(--amber); } .fig.warn{ border-color:var(--amber); background:var(--amber-soft); }

.cite{ background:var(--panel); border:1px solid var(--rule); border-radius:9px; overflow:hidden;
  box-shadow:var(--shadow); }
.cite .st{ font:400 clamp(14px,1.3vw,17px)/1.45 var(--sans); color:var(--ink);
  padding:14px 16px 12px; }
.cite .q{ border-top:1px solid var(--rule); background:var(--green-soft); padding:12px 16px 13px; }
.cite .q p{ font:400 clamp(13px,1.2vw,16px)/1.5 var(--serif); font-style:italic;
  color:var(--ink); margin:0; }
.cite .chip{ display:inline-block; margin-top:9px; font:500 11px/1 var(--mono);
  color:var(--green); border:1px solid var(--green); border-radius:999px; padding:5px 10px;
  background:var(--panel); }

.term{ background:var(--panel); border:1px solid var(--rule); border-radius:8px; padding:14px 16px;
  overflow-x:auto; }
.term div{ font:400 clamp(12px,1.05vw,14.5px)/1.65 var(--mono); white-space:pre; }
.term div.prompt{ color:var(--ink); }
.term div.error{ color:var(--red); font-weight:500; }

.delta{ display:grid; gap:8px; margin:0 0 6px; }
.drow{ display:grid; grid-template-columns:minmax(0,11ch) minmax(0,1fr) minmax(0,16ch);
  gap:14px; align-items:baseline; background:var(--panel); border:1px solid var(--rule);
  border-radius:7px; padding:10px 13px; }
.drow .tag{ font:600 10.5px/1 var(--mono); letter-spacing:.06em; text-transform:uppercase; }
.drow.added .tag{ color:var(--green); } .drow.added{ border-left:3px solid var(--green); }
.drow.modified .tag{ color:var(--amber); } .drow.modified{ border-left:3px solid var(--amber); }
.drow.contradicted .tag{ color:var(--red); } .drow.contradicted{ border-left:3px solid var(--red); }
.drow .txt{ font:400 14px/1.45 var(--sans); color:var(--ink); }
.drow .src{ font:400 11px/1.3 var(--mono); color:var(--faint); text-align:right; }

.refusals{ display:grid; grid-template-columns:repeat(auto-fit,minmax(215px,1fr)); gap:11px; }
.ref{ background:var(--panel); border:1px solid var(--rule); border-radius:8px; padding:13px 15px;
  display:flex; flex-direction:column; gap:8px; }
.ref .lab{ font:600 11px/1 var(--sans); letter-spacing:.09em; text-transform:uppercase;
  color:var(--red); }
.ref .body{ font:400 13px/1.5 var(--sans); color:var(--soft); flex:1; }
.ref .body code{ font:400 .92em var(--mono); color:var(--ink); }
.ref .fg{ font:600 clamp(19px,1.9vw,26px)/1 var(--sans); color:var(--green);
  font-variant-numeric:tabular-nums; }
.ref .cap{ font:400 12px/1.4 var(--sans); color:var(--soft); margin-top:-4px; }
.ref .cap code{ font:400 .92em var(--mono); }

table.metrics{ width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
table.metrics th{ font:600 11px/1.35 var(--sans); letter-spacing:.05em; text-transform:uppercase;
  color:var(--soft); text-align:right; padding:0 0 9px; border-bottom:1px solid var(--rule); }
table.metrics th:first-child{ text-align:left; }
table.metrics th.pipe{ color:var(--green); }
table.metrics td{ padding:9px 0; border-bottom:1px solid var(--rule); font:400 14px/1.3 var(--sans); }
table.metrics td.name{ color:var(--ink); }
table.metrics td.v{ text-align:right; font-weight:600; color:var(--ink); padding-left:20px;
  white-space:nowrap; }
table.metrics td.n{ text-align:right; font:400 11.5px/1.3 var(--mono); color:var(--faint);
  padding-left:8px; white-space:nowrap; }
table.metrics td.v.pipe{ color:var(--green); }
table.metrics tr:last-child td{ border-bottom:0; }

.callout{ margin:20px 0 0; border-radius:8px; padding:13px 16px;
  font:400 13.5px/1.6 var(--sans); }
.callout.good{ background:var(--green-soft); border:1px solid var(--green); color:var(--ink); }
.callout.warn{ background:var(--amber-soft); border:1px solid var(--amber); color:var(--ink); }
.callout.bad{ background:var(--red-soft); border:1px solid var(--red); color:var(--ink); }
.callout strong{ font-weight:600; }
.callout code{ font:400 .92em var(--mono); }

.flaws{ display:grid; gap:13px; }
.flaw{ display:grid; grid-template-columns:auto minmax(0,1fr); gap:16px; align-items:start; }
.flaw .n{ font:400 15px/1.1 var(--mono); color:var(--red); padding-top:2px; }
.flaw h3{ font:500 15.5px/1.35 var(--sans); color:var(--ink); margin:0 0 4px; }
.flaw p{ font:400 13.5px/1.55 var(--sans); color:var(--soft); margin:0; }
.flaw code{ font:400 .92em var(--mono); }
.flaw em{ font-style:italic; }

.cmd{ font:400 12px/1.4 var(--mono); color:var(--faint); }
.cmd b{ color:var(--soft); font-weight:400; }

.picture{ margin:0 0 22px; }
.pic-labels{ display:grid; grid-template-columns:2fr 3fr; gap:12px; margin:0 0 6px; }
.pic-labels span{ font:600 11px/1.3 var(--sans); letter-spacing:.1em; text-transform:uppercase; }
.pic-left{ color:var(--soft); } .pic-right{ color:var(--green); text-align:right; }
.pic-row{ display:flex; align-items:stretch; gap:6px; }
.pic-step{ position:relative; flex:1 1 0; background:var(--panel); border:1px solid var(--rule); border-radius:9px;
  padding:26px 12px 12px; display:flex; flex-direction:column; gap:6px; min-height:96px; }
.pic-step.human{ border-color:var(--green); background:var(--green-soft); }
.pic-step.after{ border-color:var(--green); }
.pic-step .n{ font:600 11px/1 var(--mono); color:var(--faint); }
.pic-step .t{ font:500 clamp(13px,1.15vw,15.5px)/1.3 var(--sans); color:var(--ink); }
.pic-step .you{ position:absolute; top:-12px; left:50%; transform:translateX(-50%); font:700 11px/1 var(--sans);
  letter-spacing:.12em; text-transform:uppercase; color:var(--panel); background:var(--green); padding:6px 10px;
  border-radius:999px; }
.pic-row i{ align-self:center; color:var(--faint); font-style:normal; font-size:14px; }

.strip{ display:flex; align-items:center; gap:5px; margin:0 0 18px; }
.strip .cell{ flex:1 1 0; font:500 11px/1.25 var(--sans); color:var(--faint); background:var(--panel);
  border:1px solid var(--rule); border-radius:6px; padding:7px 9px; }
.strip .cell b{ font:600 10px/1 var(--mono); color:var(--faint); margin-right:5px; }
.strip .cell.done{ color:var(--soft); }
.strip .cell.lit{ color:var(--green); border-color:var(--green); background:var(--green-soft); font-weight:600; }
.strip .cell.lit b{ color:var(--green); }
.strip.amber .cell.lit{ color:var(--amber); border-color:var(--amber); background:var(--amber-soft); }
.strip.amber .cell.lit b{ color:var(--amber); }
.strip i{ color:var(--faint); font-style:normal; font-size:11px; }
`;

// --- block renderers, shared -------------------------------------------------------------------

const esc = (s) => String(s);

const RENDER = {
  lede: (b) => `<p class="lede">${b.text}</p>`,
  kicker: (b) => `<p class="kicker">${b.text}</p>`,
  note: (b) => `<p class="note">${b.text}</p>`,
  flow: (b) => `<div class="flow">${b.steps.map((s, i) => {
    const cls = s === 'HUMAN' ? ' class="human"' : (s === 'approved' ? ' class="term"' : '');
    const arrow = i < b.steps.length - 1 ? '<i>&rarr;</i>' : '';
    return `<span${cls}>${s}</span>${arrow}`;
  }).join('')}</div>`,
  points: (b) => `<ul class="points">${b.items
    .map(([h, d]) => `<li><b>${h}</b><span>${d}</span></li>`).join('')}</ul>`,
  figures: (b) => `<div class="figs">${b.items
    .map((f) => `<div class="fig ${f.tone}"><div class="v">${f.value}</div><div class="l">${f.label}</div></div>`)
    .join('')}</div>`,
  citation: (b) => `<div class="cite"><div class="st">${b.statement}</div>`
    + `<div class="q"><p>&ldquo;${b.quote}&rdquo;</p><span class="chip">${b.source}</span></div></div>`,
  terminal: (b) => `<div class="term">${b.lines
    .map(([k, t]) => `<div class="${k}">${esc(t)}</div>`).join('')}</div>`,
  delta: (b) => `<div class="delta">${b.rows
    .map(([kind, txt, src]) => `<div class="drow ${kind}"><span class="tag">${kind}</span>`
      + `<span class="txt">${txt}</span><span class="src">${src}</span></div>`).join('')}</div>`,
  refusals: (b) => `<div class="refusals">${b.items
    .map((r) => `<div class="ref"><div class="lab">${r.label}</div><div class="body">${r.body}</div>`
      + `<div class="fg">${r.figure}</div><div class="cap">${r.caption}</div></div>`).join('')}</div>`,
  metrics: (b) => `<table class="metrics"><thead><tr>`
    + `<th>${b.head[0]}</th><th colspan="2">${b.head[1]}</th><th colspan="2" class="pipe">${b.head[2]}</th>`
    + `</tr></thead><tbody>${b.rows.map(([name, a, an, p, pn]) =>
      `<tr><td class="name">${name}</td><td class="v">${a}</td><td class="n">${an}</td>`
      + `<td class="v pipe">${p}</td><td class="n">${pn}</td></tr>`).join('')}</tbody></table>`,
  callout: (b) => `<div class="callout ${b.tone}">${b.text}</div>`,
  // THE ONE PICTURE (slide 2): five plain boxes, "you" above the step where the person sits, the
  // AI's half labelled on the left and the human's half on the right.
  picture: (b) => `<div class="picture">`
    + `<div class="pic-labels"><span class="pic-left">${b.left}</span><span class="pic-right">${b.right}</span></div>`
    + `<div class="pic-row">${b.steps.map((s, i) => {
      const n = i + 1;
      const you = n === b.you ? '<span class="you">you</span>' : '';
      const cls = n < b.you ? 'ai' : (n === b.you ? 'human' : 'after');
      const arrow = i < b.steps.length - 1 ? '<i>&rarr;</i>' : '';
      return `<div class="pic-step ${cls}">${you}<span class="n">${n}</span><span class="t">${s}</span></div>${arrow}`;
    }).join('')}</div></div>`,
  // THE SAME PICTURE AS A STRIP (slides 3–6): one step lit, so four demos read as one system.
  strip: (b) => `<div class="strip ${b.tone ?? ''}">${b.steps.map((s, i) => {
    const n = i + 1;
    return `<span class="cell${n === b.lit ? ' lit' : ''}${n < b.lit ? ' done' : ''}"><b>${n}</b> ${s}</span>`;
  }).join('<i>&rarr;</i>')}</div>`,
  flaws: (b) => `<div class="flaws">${b.items
    .map((f) => `<div class="flaw"><div class="n">${f.n}</div><div><h3>${f.head}</h3><p>${f.body}</p></div></div>`)
    .join('')}</div>`,
};

function body(slide) {
  const missing = slide.blocks.filter((b) => !RENDER[b.type]);
  if (missing.length) throw new Error(`no renderer for block type(s): ${missing.map((m) => m.type).join(', ')}`);
  return slide.blocks.map((b) => RENDER[b.type](b)).join('\n      ');
}

const FONTS = '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
  + 'family=Instrument+Serif:ital@0;1&family=Public+Sans:wght@400;500;600;700'
  + '&family=JetBrains+Mono:wght@400;500;600&display=swap">';

const FACES = `
  --serif:"Instrument Serif", Georgia, "Times New Roman", serif;
  --sans:"Public Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  --mono:"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
`;

// --- 1. the presentation -------------------------------------------------------------------------

function presentation() {
  const slides = SLIDES.map((s, i) => `
  <section class="slide" data-i="${i}"${i === 0 ? '' : ' hidden'}>
    <div class="inner">
      <p class="eyebrow">${s.eyebrow}</p>
      <h1 class="head">${s.headline}</h1>
      ${body(s)}
      ${s.command ? `<p class="cmd"><b>reproduce:</b> ${s.command.cmd}</p>` : ''}
    </div>
  </section>`).join('\n');

  return `<title>PRD Genie</title>
${FONTS}
<style>
${TOKENS}
:root{${FACES}}
${BLOCK_CSS}
*{box-sizing:border-box}
body{ margin:0; background:var(--stage); color:var(--ink); font-family:var(--sans);
  -webkit-font-smoothing:antialiased; }
.stage{ min-height:100vh; display:flex; flex-direction:column; }
.slide{ flex:1; display:flex; align-items:center; justify-content:center; padding:clamp(24px,4vh,56px) clamp(20px,5vw,72px) 84px; }
.slide[hidden]{ display:none !important; }
.inner{ width:100%; max-width:1080px; }
.cmd{ margin:26px 0 0; padding-top:14px; border-top:1px solid var(--rule); }

/* the spine: nine ticks, because a talk is a sequence and the ticks say where you are */
.rail{ position:fixed; left:0; right:0; bottom:0; background:var(--paper);
  border-top:1px solid var(--rule); padding:11px clamp(20px,5vw,72px);
  display:flex; align-items:center; gap:16px; }
.ticks{ display:flex; gap:5px; flex:1; }
.tick{ height:3px; flex:1; background:var(--rule); border-radius:2px; border:0; padding:0;
  cursor:pointer; }
.tick.on{ background:var(--green); }
.tick.done{ background:var(--soft); }
.tick:focus-visible{ outline:2px solid var(--green); outline-offset:3px; }
.meta{ font:400 11.5px/1 var(--mono); color:var(--faint); white-space:nowrap;
  font-variant-numeric:tabular-nums; }
.brand{ font:400 13px/1 var(--serif); color:var(--soft); white-space:nowrap; }
.hint{ font:400 11px/1 var(--sans); color:var(--faint); }
@media (max-width:720px){ .hint,.brand{ display:none } }
@media (prefers-reduced-motion:no-preference){ .slide{ animation:in .22s ease-out } }
@keyframes in{ from{ opacity:.4 } to{ opacity:1 } }
</style>

<div class="stage">
${slides}
</div>

<nav class="rail">
  <span class="brand">${DECK.title}</span>
  <div class="ticks" id="ticks"></div>
  <span class="meta" id="pos">1 / ${SLIDES.length}</span>
  <span class="hint">&larr; &rarr; or click</span>
</nav>

<script>
(function(){
  var slides = [].slice.call(document.querySelectorAll('.slide'));
  var ticks = document.getElementById('ticks');
  var pos = document.getElementById('pos');
  var at = 0;
  slides.forEach(function(_, i){
    var b = document.createElement('button');
    b.className = 'tick'; b.type = 'button';
    b.setAttribute('aria-label', 'Slide ' + (i+1));
    b.addEventListener('click', function(){ go(i); });
    ticks.appendChild(b);
  });
  function go(n){
    at = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach(function(s, i){ s.hidden = i !== at; });
    [].slice.call(ticks.children).forEach(function(t, i){
      t.className = 'tick' + (i === at ? ' on' : (i < at ? ' done' : ''));
    });
    pos.textContent = (at + 1) + ' / ' + slides.length;
    try { history.replaceState(null, '', '#' + (at + 1)); } catch (e) {}
  }
  document.addEventListener('keydown', function(e){
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { go(at + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { go(at - 1); e.preventDefault(); }
    else if (e.key === 'Home') { go(0); }
    else if (e.key === 'End') { go(slides.length - 1); }
  });
  document.querySelector('.stage').addEventListener('click', function(e){
    if (e.target.closest('a,button')) return;
    go(at + (e.clientX < window.innerWidth * 0.25 ? -1 : 1));
  });
  var start = parseInt((location.hash || '').slice(1), 10);
  go(isFinite(start) && start > 0 ? start - 1 : 0);
})();
</script>`;
}

// --- 2. the presenter's copy -----------------------------------------------------------------------

// HOW LONG A SLIDE TAKES, DERIVED FROM THE WORDS (not typed beside them).
//
// The first version carried a hand-written `seconds` on each slide, which is a number somebody
// guessed once and then never moved when the script changed — the shape of every stale figure
// in this project. This counts the words actually written and divides by a stated speaking rate,
// so editing a line moves the estimate, and a slide that grew says so during rehearsal instead
// of at 4:58.
//
// 150 words per minute is a measured-presentation pace, not a reading pace. The demo allowance
// is for the switch itself — finding the window, waiting for a run — and is separate because it
// is not speech.
const WPM = 150;

// TWO COSTS, because they are two different acts. Going OUT means finding a tab, orienting on a
// screen full of someone else's UI, and driving it while talking. Coming BACK means one click
// onto a deck already sitting on the right slide.
//
// The old model charged 12s for a demo and nothing for the return, which was not a claim that
// returning is free — it was a model that had no row for it. Now every switch is a row, so both
// are counted, and pretending the return costs as much as the departure would be as wrong in the
// other direction.
const DEMO_SWITCH_SECONDS = 12;
const RETURN_SECONDS = 4;
const isReturn = (go) => /^back/i.test(String(go ?? ''));

// A line may be written as a plain string or as `{ t, cut: true }`. `cut` marks a line as the
// first thing to drop when the clock is against you — decided while writing, in daylight,
// rather than at 4:50 on the take. The builder reports BOTH running times, so what the cut
// buys is a number and not a hope.
const textOf = (l) => (typeof l === 'string' ? l : l.t);
const words = (lines) => lines.join(' ').split(/\s+/).filter(Boolean).length;

export function secondsFor(notes, { trimmed = false } = {}) {
  // ONE SOURCE. `run` is the script and the choreography in one ordered list, so the timing is
  // computed from the same rows the presenter reads. When they were two lists — `say` beside
  // `demo.steps` — nothing said which line went with which action, and the deck's own reader
  // could not tell what he was supposed to be doing while he talked.
  const rows = (notes?.run ?? []).filter((r) => !(trimmed && r.cut));
  const lines = rows.map((r) => r.say).filter(Boolean).map(textOf);
  const moves = rows.filter((r) => r.go)
    .reduce((a, r) => a + (isReturn(r.go) ? RETURN_SECONDS : DEMO_SWITCH_SECONDS), 0);
  return Math.round((words(lines) / WPM) * 60) + moves;
}


/**
 * THE RUNBOOK — everything that has to be true before slide 1 (BUG-069).
 *
 * Kept above the cards, not appended below them, because it is read FIRST and once. A setup
 * section at the bottom of a run sheet is a setup section nobody reads.
 */
function runbook() {
  const A = RUNBOOK.appendix;
  return `
<section class="runbook">
  <h2>Before you hit record</h2>
  <p class="tworuns">${RUNBOOK.twoRuns}</p>

  <h3>Two double-clicks. Nothing to type.</h3>
  <ol class="setup launchers">
    ${RUNBOOK.before.map((b) => `<li>
      <div class="sw">${b.what}
        <span class="wherechip">${b.where}</span>
        ${b.takes ? `<span class="takes">${b.takes}</span>` : ''}
      </div>
      <pre class="run dbl">${b.cmd}</pre>
      <p class="sd"><b>What it does.</b> ${b.does}</p>
      <p class="se"><b>What you will see.</b> ${b.expect}</p>
    </li>`).join('')}
  </ol>

  <p class="oncamera">${RUNBOOK.onCamera}</p>

  <h3>Open in front of you</h3>
  <table class="wins"><tbody>
    ${RUNBOOK.windows.map((w) => `<tr>
      <td class="wn">${w.n}</td>
      <td class="ww">${w.what}<div class="wnote">${w.note}</div></td>
      <td class="wa"><code>${w.at}</code></td>
    </tr>`).join('')}
  </tbody></table>

  <h3>If it goes wrong</h3>
  <table class="rec"><tbody>
    ${RUNBOOK.recovery.map((r) => `<tr><td class="rs">${r.symptom}</td><td class="rf">${r.fix}</td></tr>`).join('')}
  </tbody></table>
</section>

<section class="runbook appendix">
  <h2>Appendix &mdash; the same thing by hand</h2>
  <p class="apwhy">${A.why}</p>

  <h3>Opening a window, once for each</h3>
  <ol class="opensteps">${A.open.map((x) => `<li>${x}</li>`).join('')}</ol>
  <p class="se">${A.whatIsRunCmd}</p>

  <h3>The eight commands, in order</h3>
  <ol class="setup manual">
    ${A.steps.map((s) => `<li>
      <pre class="run">${s.cmd}</pre>
      <p class="sd">${s.does}</p>
    </li>`).join('')}
  </ol>
</section>`;
}

function presenter() {
  const total = SLIDES.reduce((a, s) => a + secondsFor(s.notes), 0);
  const trim = SLIDES.reduce((a, s) => a + secondsFor(s.notes, { trimmed: true }), 0);
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  let elapsed = 0;

  const cards = SLIDES.map((s, i) => {
    const n = s.notes ?? {};
    const secs = secondsFor(n);
    const from = elapsed;
    elapsed += secs;
    // TWO COLUMNS: what is on the screen, and what you say while it is. Nothing else.
    //
    // This card used to stack three separate blocks — the script, then the demo steps, then the
    // command — and left the reader to work out which sentence went with which click. Vaibhav
    // read it and said he was completely clueless about what was happening, which is the correct
    // response to a procedure whose two halves are printed one after the other.
    //
    // A row with `go` is a SWITCH and is the only thing coloured. A row with no `say` is
    // something you do in silence, and the right-hand cell says so rather than sitting empty.
    const script = `
      <table class="two"><thead><tr>
        <th class="cdo">What is on the screen</th><th class="csay">What you say</th>
      </tr></thead><tbody>
      ${(n.run ?? []).map((r) => `<tr class="${r.go ? 'sw' : ''}${r.cut ? ' cut' : ''}">
        <td class="cdo">
          ${r.go ? `<span class="gotag${isReturn(r.go) ? ' back' : ''}">${isReturn(r.go) ? r.go : `Switch to ${r.go}`}</span>` : ''}
          ${r.on ? `<div class="ondo">${r.on}</div>` : ''}
          ${r.note ? `<div class="onnote">${r.note}</div>` : ''}
        </td>
        <td class="csay">
          ${r.cut ? '<span class="cuttag">cut first</span>' : ''}
          ${r.say ? `<span class="line">${textOf(r.say)}</span>` : '<span class="silent">— nothing; just do it —</span>'}
        </td>
      </tr>`).join('')}
      </tbody></table>`;

    // WHAT THIS COMMAND DOES, on every card that carries one, and an explicit line on every
    // card that does not. A reproduce line with no explanation is a line the presenter cannot
    // answer a question about.
    const cmd = s.command ? `
      <div class="cmdbox">
        <p class="clab">Not a step &mdash; the proof, if you are asked</p>
        <pre class="run">${s.command.cmd}</pre>
        <p class="cdoes">${s.command.does}</p>
      </div>`
      : '<div class="nocmd">Nothing to reproduce here — this slide carries no measured figure.</div>';

    return `
  <article class="card" id="s${i + 1}">
    <header class="chead">
      <span class="num">${String(i + 1).padStart(2, '0')}</span>
      <span class="ttl">${s.eyebrow}</span>
      <span class="clock">${mmss(from)} &ndash; ${mmss(elapsed)} &nbsp;·&nbsp; ${secs}s</span>
    </header>
    <div class="cols">
      <div class="preview">
        <div class="inner">
          <p class="eyebrow">${s.eyebrow}</p>
          <h1 class="head">${s.headline}</h1>
          ${body(s)}
          ${s.command ? `<p class="cmd"><b>reproduce:</b> ${s.command.cmd}</p>` : ''}
        </div>
      </div>
      <div class="script">
        ${script}
        ${cmd}
      </div>
    </div>
  </article>`;
  }).join('\n');

  return `<title>PRD Genie Run Sheet</title>
${FONTS}
<style>
${TOKENS}
:root{${FACES}}
${BLOCK_CSS}
*{box-sizing:border-box}
body{ margin:0; background:var(--stage); color:var(--ink); font-family:var(--sans); }
.top{ background:var(--paper); border-bottom:1px solid var(--rule);
  padding:24px clamp(18px,4vw,44px) 20px; }
.top h1{ font:400 clamp(24px,3vw,38px)/1.1 var(--serif); margin:0 0 6px; }
.top p{ font:400 14px/1.5 var(--sans); color:var(--soft); margin:0; max-width:76ch; }
.budget{ display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
.budget span{ font:500 11.5px/1 var(--mono); color:var(--soft); background:var(--panel);
  border:1px solid var(--rule); border-radius:999px; padding:6px 11px; }
.budget span.over{ color:var(--amber); border-color:var(--amber); background:var(--amber-soft); }
.wrap{ padding:clamp(18px,3vw,34px) clamp(18px,4vw,44px) 60px; display:grid; gap:22px; }
.card{ background:var(--paper); border:1px solid var(--rule); border-radius:11px;
  overflow:hidden; box-shadow:var(--shadow); }
.chead{ display:flex; align-items:baseline; gap:14px; padding:12px 18px;
  border-bottom:1px solid var(--rule); background:var(--panel); }
.chead .num{ font:400 15px/1 var(--mono); color:var(--green); }
.chead .ttl{ font:600 11.5px/1 var(--sans); letter-spacing:.11em; text-transform:uppercase;
  color:var(--soft); }
.chead .clock{ margin-left:auto; font:400 12px/1 var(--mono); color:var(--faint);
  font-variant-numeric:tabular-nums; }
.cols{ display:grid; grid-template-columns:minmax(0,1.35fr) minmax(0,1fr); }
@media (max-width:900px){ .cols{ grid-template-columns:minmax(0,1fr) } }
.preview{ padding:22px 24px; border-right:1px solid var(--rule); overflow-x:auto; }
@media (max-width:900px){ .preview{ border-right:0; border-bottom:1px solid var(--rule) } }
.preview .inner{ max-width:none; }
.preview h1.head{ font-size:clamp(21px,2.1vw,29px); margin-bottom:18px; }
.preview .cmd{ margin:20px 0 0; padding-top:12px; border-top:1px solid var(--rule); }
.script{ padding:22px 24px; background:var(--panel); }
  color:var(--green); margin:0 0 12px; }
.line{ font:400 14.5px/1.6 var(--serif); color:var(--ink); margin:0 0 11px; max-width:52ch; }
  border-radius:8px; padding:13px 15px; }
.runbook{ background:var(--paper); border:1px solid var(--rule); border-radius:11px;
  padding:22px 26px 26px; box-shadow:var(--shadow); }
.tworuns{ background:var(--amber-soft); border:1px solid var(--amber);
  border-radius:8px; padding:12px 15px; margin:14px 0 4px; font:400 13.5px/1.6 var(--sans);
  color:var(--ink); max-width:88ch; }
.tworuns strong{ font-weight:600; }
.runbook h2{ font:400 clamp(21px,2.2vw,28px)/1.15 var(--serif); margin:0 0 4px; color:var(--ink); }
.runbook h3{ font:600 11.5px/1 var(--sans); letter-spacing:.11em; text-transform:uppercase;
  color:var(--green); margin:26px 0 12px; }
ol.setup{ margin:14px 0 0; padding-left:20px; display:grid; gap:15px; }
ol.setup li{ font:400 14px/1.5 var(--sans); }
.sw{ color:var(--ink); font-weight:500; margin-bottom:6px; }
.se{ color:var(--soft); font-size:13px; line-height:1.55; margin:6px 0 0; max-width:80ch; }
.se code, .rf code, .wa code{ font:400 .92em var(--mono); }
pre.run{ background:var(--ink); color:#f4f2ee; border-radius:6px; padding:9px 12px; margin:0;
  font:500 13px/1.6 var(--mono); overflow-x:auto; white-space:pre; }
:root[data-theme="dark"] pre.run, :root:not([data-theme="light"]) pre.run{ background:#0c0e12; }
table.wins, table.rec{ width:100%; border-collapse:collapse; }
table.wins td, table.rec td{ border-top:1px solid var(--rule); padding:9px 10px 9px 0;
  font:400 13.5px/1.5 var(--sans); vertical-align:top; }
.wn{ font:500 12px/1.6 var(--mono); color:var(--green); width:2ch; }
.ww{ color:var(--ink); width:34%; }
.wnote{ font-size:12px; color:var(--faint); margin-top:3px; }
.wa code{ color:var(--soft); font-size:12.5px; overflow-wrap:anywhere; }
.rs{ color:var(--ink); width:34%; }
.rf{ color:var(--soft); }
.line.cut{ color:var(--faint); }
.cuttag{ display:inline-block; font:600 9.5px/1 var(--sans); letter-spacing:.09em;
  text-transform:uppercase; color:var(--amber); border:1px solid var(--amber);
  border-radius:3px; padding:3px 5px; margin-right:8px; vertical-align:2px; }
.budget span.ok{ color:var(--green); border-color:var(--green); background:var(--green-soft); }
/* THE TWO COLUMNS. Left is what the audience sees; right is what comes out of your mouth while
   they see it. Rows align, so a glance answers "where am I and what am I saying" together. */
table.two{ width:100%; border-collapse:collapse; table-layout:fixed; }
table.two th{ font:600 10.5px/1 var(--sans); letter-spacing:.1em; text-transform:uppercase;
  color:var(--soft); text-align:left; padding:0 14px 9px 0; border-bottom:1px solid var(--rule); }
table.two th.csay{ padding-right:0; }
table.two td{ border-bottom:1px solid var(--rule); padding:13px 14px 13px 0; vertical-align:top; }
table.two td.csay{ padding-right:0; }
table.two tr:last-child td{ border-bottom:0; }
table.two col{ }
table.two th.cdo, table.two td.cdo{ width:44%; }
.ondo{ font:400 13px/1.55 var(--sans); color:var(--ink); }
.ondo code{ font:400 .9em var(--mono); overflow-wrap:anywhere; }
.ondo strong{ font-weight:600; }
.onnote{ font:400 12px/1.5 var(--sans); color:var(--faint); margin-top:6px;
  border-left:2px solid var(--rule); padding-left:9px; }
.onnote code{ font:400 .9em var(--mono); overflow-wrap:anywhere; }
.onnote strong{ color:var(--soft); font-weight:600; }
td.csay .line{ font:400 14.5px/1.6 var(--serif); color:var(--ink); }
.silent{ font:400 12.5px/1.6 var(--sans); color:var(--faint); font-style:italic; }

/* A switch is the only coloured row, because leaving the deck is the only thing on this card
   that goes wrong if it is missed. */
table.two tr.sw td{ background:var(--amber-soft); }
table.two tr.sw td.cdo{ border-left:3px solid var(--amber); padding-left:11px; }
.gotag.back{ color:var(--soft); border-color:var(--rule); }
table.two tr.sw:has(.gotag.back) td{ background:transparent; }
table.two tr.sw:has(.gotag.back) td.cdo{ border-left-color:var(--rule); }
.gotag{ display:inline-block; font:600 10px/1 var(--sans); letter-spacing:.08em;
  text-transform:uppercase; color:var(--amber); border:1px solid var(--amber);
  background:var(--panel); border-radius:3px; padding:5px 7px; margin-bottom:8px; }
table.two tr.cut td.csay .line{ color:var(--faint); }

.nocmd{
  border-top:1px dashed var(--rule); padding-top:12px; }

/* Stay-on-the-slide block: same anatomy as the amber demo block, deliberately quiet, so the
   eye can tell "leave the deck" from "point at the deck" without reading a word. */
  border-radius:8px; padding:13px 15px; }

/* What the slide's command does. Every card has one of these or the line saying it has none. */
.cmdbox{ margin-top:16px; border-top:1px dashed var(--rule); padding-top:14px; }
.clab{ font:600 11px/1 var(--sans); letter-spacing:.11em; text-transform:uppercase;
  color:var(--soft); margin:0 0 9px; }
.cdoes{ font:400 12.5px/1.6 var(--sans); color:var(--soft); margin:9px 0 0; max-width:64ch; }
.cdoes code{ font:400 .92em var(--mono); }
.cdoes strong{ color:var(--ink); font-weight:600; }

/* Opening a window — appendix only now; the main path never mentions one. */
ol.opensteps{ margin:0 0 13px; padding-left:20px; display:grid; gap:7px; }
ol.opensteps li{ font:400 13.5px/1.55 var(--sans); color:var(--ink); }
ol.opensteps code{ font:400 .9em var(--mono); overflow-wrap:anywhere; }
.sd{ color:var(--ink); font-size:13px; line-height:1.6; margin:8px 0 0; max-width:80ch; }
.sd b, .se b{ font-weight:600; color:var(--ink); }
.sd code{ font:400 .92em var(--mono); }
.wherechip{ display:inline-block; font:600 10px/1 var(--sans); letter-spacing:.07em;
  text-transform:uppercase; color:var(--green); border:1px solid var(--green);
  background:var(--green-soft); border-radius:3px; padding:4px 6px; margin-left:9px;
  vertical-align:2px; }

/* The two double-clicks. A file you double-click is not a command you type, and it should not
   look like one — hence the pale panel rather than the black terminal block. */
ol.setup.launchers{ padding-left:0; gap:12px; }
ol.setup.launchers li{ background:var(--green-soft); border:1px solid var(--green);
  border-radius:9px; padding:14px 17px; list-style-position:inside; }
pre.run.dbl{ background:var(--panel); color:var(--ink); border:1px solid var(--green);
  font:600 14px/1.6 var(--mono); }
:root[data-theme="dark"] pre.run.dbl, :root:not([data-theme="light"]) pre.run.dbl{
  background:var(--panel); color:var(--ink); }

/* The appendix: present, complete, and visibly not the path you are meant to take. */
section.runbook.appendix{ background:transparent; border-style:dashed; box-shadow:none; }
section.runbook.appendix h2{ color:var(--soft); font:400 clamp(18px,1.8vw,23px)/1.2 var(--serif); }
section.runbook.appendix h3{ color:var(--soft); }
.apwhy{ font:400 13.5px/1.6 var(--sans); color:var(--soft); margin:10px 0 0; max-width:84ch; }
.apwhy strong{ color:var(--ink); font-weight:600; }
ol.setup.manual{ gap:11px; }
ol.setup.manual li{ font:400 13px/1.5 var(--sans); }
ol.setup.manual pre.run{ font-size:12.5px; }
ol.setup.manual .sd{ margin-top:7px; font-size:12.5px; color:var(--soft); }

.wherechip strong{ font-weight:700; }
.takes{ font:500 11px/1 var(--mono); color:var(--faint); margin-left:8px; vertical-align:2px; }
.oncamera{ margin:22px 0 0; border:1px solid var(--green); background:var(--green-soft);
  border-radius:8px; padding:13px 15px; font:400 13.5px/1.6 var(--sans); color:var(--ink);
  max-width:88ch; }
.oncamera strong{ font-weight:600; }
kbd{ font:500 11.5px/1 var(--mono); border:1px solid var(--rule); border-bottom-width:2px;
  border-radius:4px; padding:3px 5px; background:var(--paper); color:var(--ink);
  white-space:nowrap; }
@media print{
  body{ background:#fff }
  .card{ break-inside:avoid; box-shadow:none }
  .top{ border-bottom:2px solid #000 }
}
</style>

<div class="top">
  <h1>${DECK.title} — presenter&rsquo;s copy</h1>
  <p><strong>Read each card left to right.</strong> The left column is what is on the screen at
  that moment; the right column is what you say while it is there. Rows line up, so you never have
  to work out which sentence goes with which click.
  <strong>An amber row means leave the deck</strong> and drive a browser tab &mdash; those are the
  only four moments in the whole five minutes where you touch anything.
  Cards that carry a figure also name the command that reproduces it, and say what it does.
  <strong>Those are never something to run</strong> — not in setup, not on camera. They are there
  so a stranger can check the number themselves, and so you can answer if you are asked how you know.
  <strong>Everything you actually do is the two double-clicks below.</strong>
  Figures were read from the database on ${DECK.refreshed}.</p>
  <div class="budget">
    <span>${SLIDES.length} slides</span>
    <span class="${total > DECK.budgetSeconds ? 'over' : ''}">full script ${mmss(total)}</span>
    <span class="${trim > DECK.budgetSeconds ? 'over' : 'ok'}">${mmss(trim)} without the &lsquo;cut first&rsquo; lines &middot; budget ${mmss(DECK.budgetSeconds)}</span>
    <span>${SLIDES.filter((s) => s.notes?.demo).length} live demo switches</span>
    <span>print this page for a paper copy</span>
  </div>
</div>

<div class="wrap">
${runbook()}
${cards}
</div>`;
}

// --- write -------------------------------------------------------------------------------------

// --- THE COUNTS, CHECKED AGAINST THE FOLDERS BEFORE ANYTHING IS WRITTEN ------------------------
//
// Three separate counts on this deck drifted while it was being written in one evening: the
// number of checks (twice), the number of stories, and the number of open bug cards. Each was
// typed, each was true when typed, and each stopped being true within the hour.
//
// So the build refuses. A deck is the one artefact nobody re-reads before showing it, and a
// wrong count on a slide is a thing a stranger can falsify with `ls`.
{
  const REPO = join(OUT, '..', '..');
  const md = (d) => { try { return readdirSync(join(REPO, d)).filter((f) => f.endsWith('.md') && !f.endsWith('.tests.md')); } catch { return []; } };
  const done = md('stories/done');
  const backlog = md('stories/backlog');
  const actual = {
    'stories done': done.length,
    'bug cards closed': done.filter((f) => f.startsWith('BUG-')).length,
    'open bug cards': backlog.filter((f) => f.startsWith('BUG-')).length,
    // ADR 0000 is the template and records nothing (BUG-087).
    'recorded decisions': md('docs/adr').filter((f) => /^\d{4}-/.test(f) && !f.startsWith('0000-')).length,
  };
  const text = JSON.stringify(SLIDES);
  const claims = [
    [/(\d+) stories done/, 'stories done'],
    [/(\d+) closed, (?:\d+) open and written down/, 'bug cards closed'],
    [/<strong>(\d+) open bug cards/, 'open bug cards'],
    [/\d+ closed, (\d+) open and written down/, 'open bug cards'],
    [/(\d+) recorded decisions/, 'recorded decisions'],
  ];
  const wrong = [];
  for (const [re, key] of claims) {
    const m = re.exec(text);
    if (!m) { wrong.push(`the deck no longer states "${key}" — this guard has lost its anchor`); continue; }
    if (Number(m[1]) !== actual[key]) wrong.push(`${key}: deck says ${m[1]}, the folders hold ${actual[key]}`);
  }
  if (wrong.length) {
    console.error('REFUSED — a count on a slide disagrees with the repository:\n');
    for (const w of wrong) console.error(`  ${w}`);
    console.error('\nFix slides.mjs. Nothing was written.');
    process.exit(1);
  }
  console.log(`counts checked against the folders: ${Object.entries(actual).map(([k, v]) => `${v} ${k}`).join(', ')}\n`);
}

mkdirSync(OUT, { recursive: true });
const files = [
  ['presentation.html', presentation()],
  ['presenter.html', presenter()],
];
for (const [name, html] of files) {
  writeFileSync(join(OUT, name), html);
  console.log(`  wrote  deliverables/deck/${name.padEnd(20)} ${(html.length / 1024).toFixed(1)} KB`);
}
const spoken = SLIDES.reduce((a, s) => a + secondsFor(s.notes), 0);
const trimmed = SLIDES.reduce((a, s) => a + secondsFor(s.notes, { trimmed: true }), 0);
const clock = (x) => Math.floor(x / 60) + ':' + String(x % 60).padStart(2, '0');
console.log('');
console.log(`${SLIDES.length} slides, one source. Timing is DERIVED from the words at ${'150'} wpm, not typed:`);
console.log(`  full script                     ${clock(spoken)}`);
console.log(`  without the 'cut first' lines   ${clock(trimmed)}`);
console.log(`  budget                          ${clock(DECK.budgetSeconds)}`);
if (trimmed > DECK.budgetSeconds) {
  console.log('');
  console.log(`OVER by ${trimmed - DECK.budgetSeconds}s even trimmed. Mark another line { t, cut: true }`);
  console.log('in slides.mjs — never the honest-limitations slide (E9-S3).');
}
