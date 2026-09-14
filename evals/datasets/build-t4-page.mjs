// Builds the T4 sign-off page from the fixture and the labels, so every quote on the page is
// byte-identical to the file Vaibhav is signing off. Nothing here is retyped.

import { readFileSync, writeFileSync } from 'node:fs';

const doc = JSON.parse(readFileSync('evals/datasets/docs/T4.json', 'utf8'));
const lab = JSON.parse(readFileSync('evals/datasets/labels/T4.labels.json', 'utf8'));
const raw = doc.raw_text;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// --- every labelled quote, resolved to a span in raw_text --------------------------------
const items = [];
for (const r of lab.expected_requirements) {
  items.push({ id: r.label_id, cls: r.decoy ? 'decoy' : 'req', kind: r.kind, quotes: r.quotes });
}
for (const q of lab.expected_open_questions) {
  items.push({ id: q.label_id, cls: q.explicitness === 'implicit' ? 'implicit' : 'explicit', kind: q.kind, quotes: q.quotes });
}
for (const p of lab.expected_unsettled_positions) {
  items.push({ id: p.label_id, cls: 'pos', kind: 'position', quotes: p.quotes });
}

const spans = [];
for (const it of items) {
  for (const q of it.quotes) {
    const at = raw.indexOf(q);
    if (at < 0) { console.error(`quote missing: ${q}`); process.exit(1); }
    spans.push({ start: at, end: at + q.length, id: it.id, cls: it.cls });
  }
}

// Merge overlaps: a character can belong to several labels (a position's quote sits inside a
// conflict's, on purpose). Colour by the first, list them all.
spans.sort((a, b) => a.start - b.start || b.end - a.end);
const merged = [];
for (const s of spans) {
  const last = merged[merged.length - 1];
  if (last && s.start < last.end) {
    last.end = Math.max(last.end, s.end);
    if (!last.ids.includes(s.id)) last.ids.push(s.id);
  } else {
    merged.push({ start: s.start, end: s.end, ids: [s.id], cls: s.cls });
  }
}

let out = '';
let cursor = 0;
for (const m of merged) {
  out += esc(raw.slice(cursor, m.start));
  const ids = m.ids.join(' ');
  out += `<mark class="hl ${m.cls}" data-ids="${ids}" tabindex="0" title="${ids}">`
    + `${esc(raw.slice(m.start, m.end))}<sup>${m.ids.map((i) => i.replace('T4-', '')).join('·')}</sup></mark>`;
  cursor = m.end;
}
out += esc(raw.slice(cursor));

// Speaker turns become paragraphs; the bracketed stage direction gets its own class.
const transcript = out.split('\n').map((line) => {
  if (!line.trim()) return '';
  if (/^\[/.test(line.trim())) return `<p class="stage">${line}</p>`;
  const m = line.match(/^([A-Z][^:]{0,40}):\s?/);
  if (m) return `<p class="turn"><span class="who">${m[1]}</span>${line.slice(m[0].length)}</p>`;
  return `<p class="turn plain">${line}</p>`;
}).filter(Boolean).join('\n');

// --- label cards -------------------------------------------------------------------------
const card = (id, tag, tagCls, title, body, quotes) => `
  <article class="card" id="${id}">
    <div class="card-head"><code>${id}</code><span class="tag ${tagCls}">${tag}</span></div>
    <p class="claim">${esc(title)}</p>
    ${body ? `<p class="why">${body}</p>` : ''}
    <ul class="quotes">${quotes.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>
  </article>`;

const reqCards = lab.expected_requirements.map((r) => card(
  r.label_id,
  r.decoy ? `decoy · ${r.kind}` : r.kind,
  r.decoy ? 't-decoy' : 't-req',
  r.statement,
  r.decoy ? '<b>This is the decoy.</b> It is the most heated passage in the document and it is a decision: Marcus decides, Tom registers a dissent afterwards, the meeting moves on. Flagging it as a conflict is a false positive, and C4 will score it as one.' : '',
  r.quotes,
)).join('');

const oqCards = lab.expected_open_questions.map((q) => card(
  q.label_id,
  q.kind === 'conflict' ? `conflict · ${q.explicitness}` : q.kind,
  q.explicitness === 'implicit' ? 't-implicit' : (q.kind === 'conflict' ? 't-explicit' : 't-unans'),
  q.question,
  '',
  q.quotes,
)).join('');

const posCards = lab.expected_unsettled_positions.map((p) => card(
  p.label_id,
  `position · ${p.for_conflict.replace('T4-', '')}`,
  't-pos',
  `${p.stakeholder} — ${p.position}`,
  '',
  p.quotes,
)).join('');

const counts = {
  reqs: lab.expected_requirements.length,
  decoys: lab.expected_requirements.filter((r) => r.decoy).length,
  conf: lab.expected_open_questions.filter((q) => q.kind === 'conflict').length,
  imp: lab.expected_open_questions.filter((q) => q.explicitness === 'implicit').length,
  unans: lab.expected_open_questions.filter((q) => q.kind === 'unanswered').length,
  pos: lab.expected_unsettled_positions.length,
  chars: raw.length,
};

const html = `<title>Is T4 Labelled Right</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;1,400&family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  :root {
    --paper: #EDF0F3;
    --sheet: #FFFFFF;
    --sheet-2: #F5F7F9;
    --ink: #131922;
    --soft: #5A6675;
    --rule: #D5DCE3;
    --rule-2: #B4C0CB;
    --indigo: #29457F;
    --indigo-soft: #E2E8F4;
    --clay: #9E4526;
    --clay-soft: #F6E6DF;
    --amber: #F3E2B3;
    --amber-ink: #4A3A11;
    --moss: #3F6B4A;
    --moss-soft: #E1EDE4;
    --serif: 'Spectral', Georgia, serif;
    --sans: 'Archivo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #10141A; --sheet: #171D25; --sheet-2: #1E2530;
      --ink: #E3E8EE; --soft: #96A3B2; --rule: #2A323C; --rule-2: #3A4552;
      --indigo: #93B0E8; --indigo-soft: #1B2740;
      --clay: #E09A78; --clay-soft: #33211A;
      --amber: #4B3D17; --amber-ink: #F2E3BC;
      --moss: #8CC29C; --moss-soft: #1B2C21;
    }
  }
  :root[data-theme="dark"] {
    --paper: #10141A; --sheet: #171D25; --sheet-2: #1E2530;
    --ink: #E3E8EE; --soft: #96A3B2; --rule: #2A323C; --rule-2: #3A4552;
    --indigo: #93B0E8; --indigo-soft: #1B2740;
    --clay: #E09A78; --clay-soft: #33211A;
    --amber: #4B3D17; --amber-ink: #F2E3BC;
    --moss: #8CC29C; --moss-soft: #1B2C21;
  }

  * { box-sizing: border-box; }
  body { background: var(--paper); color: var(--ink); font-family: var(--sans); line-height: 1.6; margin: 0; }
  .page { max-width: 1180px; margin: 0 auto; padding: 2.4rem 1.2rem 5rem; }

  header.top { border-bottom: 2px solid var(--ink); padding-bottom: 1.2rem; margin-bottom: 1.6rem; }
  .stamp { display: flex; flex-wrap: wrap; gap: 0.4rem 1.4rem; font-family: var(--mono);
           font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--soft); }
  h1 { font-family: var(--serif); font-weight: 600; font-size: clamp(2rem, 4.6vw, 3.1rem);
       line-height: 1.05; margin: 0.7rem 0 0.6rem; text-wrap: balance; letter-spacing: -0.015em; }
  .stand { font-family: var(--serif); font-size: 1.12rem; max-width: 62ch; color: var(--ink); margin: 0; }
  .stand em { color: var(--clay); font-style: italic; }

  h2 { font-family: var(--sans); font-weight: 700; font-size: 0.78rem; letter-spacing: 0.13em;
       text-transform: uppercase; color: var(--soft); margin: 2.6rem 0 0.9rem;
       padding-bottom: 0.4rem; border-bottom: 1px solid var(--rule); }
  h3 { font-family: var(--serif); font-weight: 600; font-size: 1.3rem; margin: 1.6rem 0 0.5rem; }
  p { max-width: 68ch; }

  .callout { background: var(--sheet); border: 1px solid var(--rule); border-left: 4px solid var(--indigo);
             padding: 1rem 1.15rem; margin: 1.2rem 0; border-radius: 3px; }
  .callout.warn { border-left-color: var(--clay); }
  .callout p { margin: 0.35rem 0; }

  .asks { display: grid; gap: 0.9rem; margin: 1.2rem 0 0; }
  @media (min-width: 820px) { .asks { grid-template-columns: repeat(3, 1fr); } }
  .ask { background: var(--sheet); border: 1px solid var(--rule); border-radius: 3px; padding: 1rem 1.05rem; }
  .ask .n { font-family: var(--mono); font-size: 0.72rem; color: var(--soft); letter-spacing: 0.08em; }
  .ask p { margin: 0.35rem 0 0; font-size: 0.95rem; }
  .ask strong { display: block; font-family: var(--serif); font-size: 1.05rem; margin-top: 0.25rem; }

  .split { display: grid; gap: 1.6rem; align-items: start; }
  @media (min-width: 980px) { .split { grid-template-columns: 1.15fr 1fr; } }

  .transcript { background: var(--sheet); border: 1px solid var(--rule); border-radius: 3px;
                padding: 1.4rem 1.5rem; font-family: var(--serif); font-size: 1rem; }
  .transcript .turn { margin: 0 0 0.75rem; max-width: none; }
  .transcript .who { font-family: var(--sans); font-weight: 600; font-size: 0.82rem;
                     letter-spacing: 0.01em; display: block; color: var(--soft); }
  .transcript .stage { font-family: var(--mono); font-size: 0.76rem; color: var(--soft);
                       text-align: center; margin: 1.2rem 0; letter-spacing: 0.04em; }

  mark.hl { background: var(--sheet-2); color: inherit; padding: 0.05em 0.12em; border-radius: 2px;
            cursor: pointer; box-decoration-break: clone; -webkit-box-decoration-break: clone;
            border-bottom: 2px solid var(--rule-2); }
  mark.hl sup { font-family: var(--mono); font-size: 0.58em; letter-spacing: 0.03em;
                color: var(--soft); margin-left: 0.15em; }
  mark.req      { background: var(--moss-soft);   border-bottom-color: var(--moss); }
  mark.decoy    { background: var(--clay-soft);   border-bottom-color: var(--clay); }
  mark.implicit { background: var(--amber);       border-bottom-color: #C9A227; color: var(--amber-ink); }
  mark.explicit { background: var(--indigo-soft); border-bottom-color: var(--indigo); }
  mark.pos      { background: var(--sheet-2);     border-bottom-color: var(--rule-2); }
  mark.hl:focus-visible { outline: 2px solid var(--indigo); outline-offset: 2px; }
  mark.lit { animation: lit 1.4s ease-out; }
  @keyframes lit { 0% { box-shadow: 0 0 0 6px var(--indigo-soft); } 100% { box-shadow: 0 0 0 0 transparent; } }

  .legend { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; font-size: 0.8rem; color: var(--soft);
            margin: 0.8rem 0 0; font-family: var(--sans); }
  .legend i { display: inline-block; width: 0.85rem; height: 0.85rem; border-radius: 2px;
              margin-right: 0.35rem; vertical-align: -0.1rem; }

  .cards { display: grid; gap: 0.8rem; }
  .card { background: var(--sheet); border: 1px solid var(--rule); border-radius: 3px; padding: 0.9rem 1rem;
          scroll-margin-top: 1rem; }
  .card.lit { border-color: var(--indigo); box-shadow: 0 0 0 3px var(--indigo-soft); }
  .card-head { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.45rem; }
  .card-head code { font-family: var(--mono); font-size: 0.78rem; color: var(--soft); }
  .tag { font-family: var(--sans); font-size: 0.66rem; font-weight: 700; letter-spacing: 0.08em;
         text-transform: uppercase; padding: 0.15rem 0.42rem; border-radius: 2px; }
  .t-req { background: var(--moss-soft); color: var(--moss); }
  .t-decoy { background: var(--clay-soft); color: var(--clay); }
  .t-implicit { background: var(--amber); color: var(--amber-ink); }
  .t-explicit { background: var(--indigo-soft); color: var(--indigo); }
  .t-unans { background: var(--sheet-2); color: var(--soft); }
  .t-pos { background: var(--sheet-2); color: var(--soft); }
  .claim { font-family: var(--serif); font-size: 1.02rem; margin: 0 0 0.4rem; }
  .why { font-size: 0.88rem; color: var(--soft); margin: 0 0 0.5rem; }
  .quotes { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.3rem; }
  .quotes li { font-family: var(--mono); font-size: 0.76rem; line-height: 1.5; color: var(--soft);
               border-left: 2px solid var(--rule-2); padding-left: 0.55rem; }

  .counts { display: flex; flex-wrap: wrap; gap: 0.6rem; margin: 1rem 0 0; }
  .pill { font-family: var(--mono); font-size: 0.76rem; background: var(--sheet); border: 1px solid var(--rule);
          border-radius: 999px; padding: 0.25rem 0.7rem; color: var(--soft); }
  .pill b { color: var(--ink); }

  pre { background: var(--sheet); border: 1px solid var(--rule); border-radius: 3px; padding: 1rem;
        font-family: var(--mono); font-size: 0.82rem; line-height: 1.7; overflow-x: auto; white-space: pre; }
  button.copy { font-family: var(--sans); font-weight: 600; font-size: 0.85rem; background: var(--ink);
                color: var(--paper); border: 0; border-radius: 3px; padding: 0.55rem 1rem; cursor: pointer;
                margin-top: 0.7rem; }
  button.copy:hover { background: var(--indigo); }

  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--rule);
           font-family: var(--mono); font-size: 0.72rem; color: var(--soft); }
  @media (prefers-reduced-motion: reduce) { mark.lit { animation: none; } }
</style>

<div class="page">

  <header class="top">
    <div class="stamp">
      <span>PRD Genie · E3-S6</span>
      <span>2 September 2026</span>
      <span>blocking: C4 is not built until this comes back</span>
    </div>
    <h1>Is T4 labelled right?</h1>
    <p class="stand">A new transcript, written so the system can be measured on the
    disagreements it has to <em>read</em> rather than hear. You are being asked to check the
    answer key — <em>before</em> anything has been run against it, which is the only thing
    that makes the eventual number mean anything.</p>
  </header>

  <div class="callout warn">
    <p><b>Nothing has been run against T4.</b> No extraction, no grading, no score. The
    transcript was written, then the labels were written from it, and that is all. The
    threshold for C4 gets chosen after you answer and before the first run.</p>
    <p>This is the same review that caught <b>T3-Q03</b> — where I had written a passage to be
    adversarial and you read it, correctly, as a decision taken over a dissent. That review
    cost ten minutes and saved three prompt iterations. It is why T4 exists at all.</p>
  </div>

  <h2>What I need from you</h2>
  <div class="asks">
    <div class="ask">
      <span class="n">01</span>
      <strong>Are the two implicit conflicts really disagreements?</strong>
      <p><code>T4-Q02</code> and <code>T4-Q03</code>. Neither sounds like an argument. If you
      read either as "fine, that's just people talking", it is not a conflict and the label
      goes.</p>
    </div>
    <div class="ask">
      <span class="n">02</span>
      <strong>Is the decoy really decided?</strong>
      <p><code>T4-R02</code>, the SSO cut. It is the most heated passage in the document. If it
      reads as unsettled to you, it is not a decoy and C4 cannot measure precision.</p>
    </div>
    <div class="ask">
      <span class="n">03</span>
      <strong>Anything mislabelled or missing?</strong>
      <p>A requirement I called a requirement that isn't one; something in the room I didn't
      label at all.</p>
    </div>
  </div>

  <h2>The transcript, with every labelled span marked</h2>
  <p>Click any highlight to jump to its label. Click a label's id to come back.</p>
  <div class="legend">
    <span><i style="background:var(--moss-soft);border:1px solid var(--moss)"></i>requirement</span>
    <span><i style="background:var(--clay-soft);border:1px solid var(--clay)"></i>the decoy — decided, not a conflict</span>
    <span><i style="background:var(--amber);border:1px solid #C9A227"></i>implicit conflict</span>
    <span><i style="background:var(--indigo-soft);border:1px solid var(--indigo)"></i>explicit conflict</span>
    <span><i style="background:var(--sheet-2);border:1px solid var(--rule-2)"></i>unsettled position</span>
  </div>

  <div class="counts">
    <span class="pill"><b>${counts.chars}</b> characters</span>
    <span class="pill"><b>${counts.reqs}</b> requirements, ${counts.decoys} decoy</span>
    <span class="pill"><b>${counts.conf}</b> conflicts · ${counts.imp} implicit</span>
    <span class="pill"><b>${counts.unans}</b> unanswered</span>
    <span class="pill"><b>${counts.pos}</b> unsettled positions</span>
  </div>

  <div class="split" style="margin-top:1.2rem">
    <div class="transcript">
${transcript}
    </div>

    <div>
      <h3 style="margin-top:0">The three conflicts and the unanswered question</h3>
      <div class="cards">${oqCards}</div>

      <h3>The requirements — one of them is the decoy</h3>
      <div class="cards">${reqCards}</div>

      <h3>Both sides of every argument, as positions</h3>
      <p style="font-size:0.9rem;color:var(--soft)">These are new since this morning: the
      extractor now has a second box for a position it must not ship as agreed. Nothing grades
      what lands there yet — that is part of what C4 is for.</p>
      <div class="cards">${posCards}</div>
    </div>
  </div>

  <h2>Where I think you'll push back</h2>

  <div class="callout">
    <p><b><code>T4-R04</code> is deliberately both a requirement and one half of
    <code>T4-Q03</code>.</b> Priya states the thirty-day deletion as a decision and Marcus
    assents, so it is extractable as a requirement — and Nadia then contradicts it without
    anyone withdrawing either. <b>A system that emits <code>T4-R04</code> is not wrong; one
    that emits it and misses <code>T4-Q03</code> has missed the disagreement.</b> If you think
    that double-labelling is unfair, say so — it changes how C4 scores.</p>
  </div>

  <div class="callout">
    <p><b><code>T4-R03</code> and <code>T4-R04</code> look contradictory and are not.</b>
    Twelve months for customer-identifiable data, thirty days for raw event rows, with the
    rollups kept. That is a second decoy, at the level of the requirement list rather than the
    argument. If you read them as a genuine contradiction, then one of them is wrong.</p>
  </div>

  <div class="callout">
    <p><b><code>T4-Q04</code> is an unanswered question, not a conflict.</b> Wei asks whether
    three steps means a minute before any data; Tom says it won't; Wei says it might; Marcus
    ends the meeting. Nobody took a position against anybody — what is missing is an answer.
    If you read it as a fourth conflict, the counts change.</p>
  </div>

  <h2>Answer sheet</h2>
  <p>Delete what doesn't apply. Anything left blank, I take as agreed.</p>
<pre>T4 labels — sign-off

  T4-Q02  guided setup vs "nothing between them and data"
          genuine implicit conflict / not a conflict:

  T4-Q03  thirty-day deletion vs thirteen months of history
          genuine implicit conflict / not a conflict:

  T4-R02  SSO cut for the pilot
          genuinely decided (a good decoy) / actually unsettled:

  T4-Q04  how long the three steps may take
          unanswered / conflict / neither:

  T4-R04 double-labelled as a requirement and a position
          fine / unfair, pick one:

  Anything mislabelled or missing:

  Sign off to build C4:  yes / not yet</pre>
  <button class="copy" id="copy">Copy the answer sheet</button>

  <footer>
    Generated from <span>evals/datasets/docs/T4.json</span> and
    <span>evals/datasets/labels/T4.labels.json</span> — every quote on this page is byte-identical
    to the file, because the page is built from it rather than retyped.
    Counts verified by <span>evals/harness/verify-labels.mjs</span>, 18/18.
  </footer>
</div>

<script>
  const lit = (el) => {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('lit');
    setTimeout(() => el.classList.remove('lit'), 1500);
  };
  document.querySelectorAll('mark.hl').forEach((m) => {
    const go = () => lit(document.getElementById(m.dataset.ids.split(' ')[0]));
    m.addEventListener('click', go);
    m.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  document.querySelectorAll('.card-head code').forEach((c) => {
    c.style.cursor = 'pointer';
    c.addEventListener('click', () => {
      const id = c.textContent.trim();
      lit([...document.querySelectorAll('mark.hl')].find((m) => m.dataset.ids.split(' ').includes(id)));
    });
  });
  document.getElementById('copy').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(document.querySelector('pre').textContent);
      e.target.textContent = 'Copied';
      setTimeout(() => { e.target.textContent = 'Copy the answer sheet'; }, 1600);
    } catch { e.target.textContent = 'Select the text above and copy'; }
  });
</script>
`;

writeFileSync(process.argv[2] ?? 't4-signoff.html', html);
console.log(`page built: ${html.length} bytes, ${merged.length} highlighted spans, ${items.length} labels`);
