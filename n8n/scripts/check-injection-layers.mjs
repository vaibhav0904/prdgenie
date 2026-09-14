// Layers 1 and 2 of ADR 0007, audited from the workflow n8n actually runs.
//
// The prompt `.md` files are the source; the workflow JSON is the truth, and a check that
// reads the source proves nothing about what the model was sent. `sync-prompts.mjs --check`
// closes the gap between them; this closes the gap between "we delimit source text" and a
// sentence in an ADR.
//
// IT DOES NOT GREP. Every node that builds a model call is EXECUTED here, in a `node:vm`
// sandbox, with a sentinel string standing in for the source document. Then the prompt the
// node produced is examined for where that sentinel ended up. A grep over the node's code
// would pass on a template that interpolates the document twice and fences it once.
//
//   Layer 1  source text reaches a prompt only inside a fenced, labelled block
//   Layer 2  every output schema is closed, and every free-text field is declared
//
// Layer 3 - the tripwire - is code, and is verified by review-ui/scripts/verify-tripwire.mjs.
//
// Usage:  .\run.cmd n8n/scripts/check-injection-layers.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { createContext, runInNewContext } from 'node:vm';

const WORKFLOW_DIR = 'n8n/workflows';

// Distinct, unmistakable, and shaped so a partial escape is still visible.
const RAW = '<<<SOURCE_TEXT_SENTINEL>>>';
const DERIVED = '<<<DERIVED_TEXT_SENTINEL>>>';

// The strict fence. Source text goes here and nowhere else (ADR 0007, layer 1).
//
// A block, not a word: what matters is that the label announces the contents as DATA rather
// than instructions. BUG-023's second pass is handed one PASSAGE rather than the whole
// document, and "SOURCE PASSAGE (DATA, NOT INSTRUCTIONS)" is the same guarantee about a
// smaller slice. Pinning the noun would have forced a stage to mislabel its own input to
// satisfy a check.
const SOURCE_FENCE = /^SOURCE [A-Z]+ \(DATA, NOT INSTRUCTIONS\)$/;

// ---------------------------------------------------------------------------------------
// Free-text fields, declared with a reason - the `spine-ok` pattern from E5-S4.
//
// A free-text field is a string the model fills with words of its own choosing, and it is
// the only kind of field an obeyed instruction could usefully occupy. Layer 2's claim is
// that there is nowhere useful to put one; that claim is only as good as this list, so the
// list is EXHAUSTIVE and every entry is printed on every run. An undeclared free-text field
// fails the check - a new one has to be argued for, not merely added.
//
// Keyed by `promptName#json.path`.
const FREE_TEXT = {
  // WF5's narrative paragraph. It is free text because it is prose by definition — the one
  // output in this system whose whole purpose is a sentence. What keeps it safe is not the
  // schema but what happens next: `review-ui/weekly.mjs` refuses the WHOLE paragraph if it
  // contains a figure, and the report is written from SQL either way. It is also the only
  // model output that never reaches the database, a PRD, or a requirement.
  'weekly-commentary#commentary':
    'the report\'s narrative paragraph - prose is the entire output, and code drops it whole '
    + 'if it carries a figure; it never reaches a PRD, a requirement or the database',

  // WF6's judge. The only free-text field it has is a remark, and the remark reaches a page
  // and a command and stops: no gate, no case, no threshold and no PRD reads anything this
  // model writes (E7-S5, proven by verify-judge-isolation.mjs). Its verdict is an enum and
  // its three numbers are numbers, so there is exactly one place words can go.
  'judge-item#comment':
    'one or two sentences of the judge\'s own reasoning, shown beside a score on the judge '
    + 'page; it gates nothing, is never written into a PRD or a requirement, and the only '
    + 'figure computed from a sweep - how often the judge and the answer key differ - is '
    + 'computed by the C1 matcher rather than from anything the model wrote',

  // WF3's delta (E6-S1). Every id is checked against the approved version before anything is
  // done with it, and every quote from the new document is located in raw_text by the same
  // matcher a citation goes through — an item whose evidence is missing is DROPPED, not
  // flagged, because a delta item is a proposal to change an approved document.
  'analyse-delta#added[].subject':
    'a noun phrase shown beside the proposed requirement; read by a person, executed by nothing',
  'analyse-delta#added[].statement':
    'the proposed new requirement — the same field as extract-requirements#statement and covered '
    + 'the same way, by layer 3 and by a human reading it before any version is approved',
  'analyse-delta#added[].citations[].quote':
    'evidence, located in the new document character-for-character; an unlocatable quote drops the item',
  'analyse-delta#modified[].req_id':
    'an id ECHOED BACK from the list the model was given, checked against the approved version; '
    + 'an id that is not there is rejected and the item thrown away (PRD-E6 decision 5)',
  'analyse-delta#modified[].prd_quote':
    'the approved PRD\'s own sentence, shown beside the proposed change; its match against the '
    + 'stored statement is recorded, and the req_id — not this quote — is the link',
  'analyse-delta#modified[].statement':
    'as added[].statement: what the requirement would now say, read by a person before approval',
  'analyse-delta#modified[].citations[].quote':
    'as added[].citations[].quote',
  'analyse-delta#contradicted[].req_id':
    'as modified[].req_id',
  'analyse-delta#contradicted[].prd_quote':
    'as modified[].prd_quote',
  'analyse-delta#contradicted[].conflict':
    'one sentence saying why two statements cannot both hold; shown to the PM beside both quotes '
    + 'and acted on by nobody — the PM chooses a side, and the choice is the decision',
  'analyse-delta#contradicted[].citations[].quote':
    'as added[].citations[].quote',
  'analyse-delta#removed[].req_id':
    'as modified[].req_id',
  'analyse-delta#removed[].prd_quote':
    'as modified[].prd_quote',
  'analyse-delta#removed[].citations[].quote':
    'the sentence in which the document drops the requirement — located like any other citation, '
    + 'and REQUIRED: silence never produces a removal (PRD-E6 decision 2)',
  'analyse-delta#new_open_questions[].question':
    'as detect-ambiguity#open_questions[].question — the question a PM answers',
  'analyse-delta#new_open_questions[].citations[].quote':
    'as added[].citations[].quote',

  'extract-requirements#document_subject':
    'a noun phrase code reads as a judgement, never rendered as an instruction',
  'extract-requirements#requirements[].req_id':
    'an identifier; assembly rewrites every id it stores, so a crafted one does not survive',
  'extract-requirements#requirements[].subject':
    'a noun phrase shown beside the statement (BUG-016/027); read by a person, never executed',
  'extract-requirements#requirements[].statement':
    'THE product of the whole system - the requirement a PM reads. Cannot be closed without deleting the feature; covered by layer 3 and by C6 instead',
  'extract-requirements#requirements[].stakeholder':
    'a name copied from the document; rendered as text',
  'extract-requirements#requirements[].citations[].quote':
    'evidence, and the one field code checks character-for-character against raw_text',
  'extract-requirements#contested_passages[].about':
    'a noun phrase naming what an argument was about; shown to nobody and executed by nothing - code uses only the two quotes below (BUG-023)',
  'extract-requirements#contested_passages[].opening_quote':
    'evidence, located in raw_text by the same matcher a citation goes through; an unlocatable one is dropped, never trusted',
  'extract-requirements#contested_passages[].closing_quote':
    'as contested_passages[].opening_quote - and code refuses a span that does not end after it begins',
  'extract-requirements#unsettled_positions[].subject':
    'as requirements[].subject',
  'extract-requirements#unsettled_positions[].position':
    'what one person wanted, in the model own words; read by a person',
  'extract-requirements#unsettled_positions[].stakeholder':
    'as requirements[].stakeholder',
  'extract-requirements#unsettled_positions[].citations[].quote':
    'as requirements[].citations[].quote',

  'extract-from-passage#requirements[].req_id':
    'an identifier, and this pass renumbers into its own P2- namespace before anything reads it',
  'extract-from-passage#requirements[].subject':
    'as extract-requirements#requirements[].subject',
  'extract-from-passage#requirements[].statement':
    'as extract-requirements#requirements[].statement - the same field, written from one passage instead of the whole document',
  'extract-from-passage#requirements[].stakeholder':
    'as extract-requirements#requirements[].stakeholder',
  'extract-from-passage#requirements[].citations[].quote':
    'evidence, matched character-for-character against the WHOLE raw_text, not the passage - an unlocatable quote from this pass is dropped rather than kept and flagged',

  'detect-ambiguity#open_questions[].question':
    'the question a PM answers; the second output layer 3 must cover (BUG-019)',
  'detect-ambiguity#open_questions[].citations[].quote':
    'as requirements[].citations[].quote',

  'cluster-epics-features#epics[].epic_id':
    'an identifier; assembly rewrites every id it stores',
  'cluster-epics-features#epics[].title':
    'a heading a person reads',
  'cluster-epics-features#epics[].summary':
    'a sentence a person reads',
  'cluster-epics-features#epics[].features[].feature_id':
    'as epics[].epic_id',
  'cluster-epics-features#epics[].features[].title':
    'as epics[].title',
  'cluster-epics-features#epics[].features[].req_ids[]':
    'ids echoed back; every one is checked against the list the model was given, and an unknown id is a reported problem, never a new requirement',
  'cluster-epics-features#unclustered[].req_id':
    'as epics[].features[].req_ids[]',
  'cluster-epics-features#unclustered[].reason':
    'why the model could not place a requirement - a drop ledger read beside the code own (assemble.mjs), never acted on',

  'draft-stories#stories[].story_id':
    'an identifier; assembly rewrites every id it stores',
  'draft-stories#stories[].feature_id':
    'an id checked against the features the model was given',
  'draft-stories#stories[].as_a':
    'a persona name a person reads',
  'draft-stories#stories[].i_want':
    'the story, in the model own words',
  'draft-stories#stories[].so_that':
    'the story, in the model own words',
  'draft-stories#stories[].acceptance_criteria[].criterion':
    'the acceptance criterion a person reads',
  'draft-stories#stories[].acceptance_criteria[].req_id':
    'an id checked against the requirement list; an unknown one is dropped and reported',
  'draft-stories#features_without_stories[].feature_id':
    'an id checked against the features the model was given',
  'draft-stories#features_without_stories[].reason':
    'as cluster-epics-features#unclustered[].reason - a drop ledger, read and never acted on',

  'extract-priority-factors#priority_factors[].feature_id':
    'an id checked against the features the model was given',
  'extract-priority-factors#priority_factors[].rationale':
    'commentary beside four numbers - the score itself is computed by code (structure.mjs)',
  'extract-priority-factors#priority_factors[].citations[]':
    'req_ids, not spans; checked against the requirement list',
};

// Fields no schema may ever contain, at any depth. These are the ones that would let an
// obeyed instruction change state rather than merely write words.
const FORBIDDEN_FIELDS = [
  'grounded', 'match_kind', 'state', 'status', 'approved', 'approved_at',
  'priority_score', 'score', 'park_reason', 'degraded', 'pm_authored', 'trace_id',
];

// ---------------------------------------------------------------------------------------
// Run every model-call builder node and capture what it produced.

/** Stand-ins for the n8n runtime. Every node reads its input through one of these. */
function sandbox(docJson) {
  const item = (json) => ({ json });
  const list = (json) => ({ first: () => item(json), item: item(json), all: () => [item(json)] });

  const NAMED = {
    'Fetch document': docJson,
    // WF5's weekly figures. It carries the RAW sentinel even though the real payload is
    // aggregates this service computed and never source text: the audit's job is to prove
    // the fence holds around whatever is interpolated, and stubbing something benign here
    // would make this the one call the audit cannot fail on.
    'Fetch the figures': {
      week: '2026-01-05',
      approved: 1,
      approved_prior: 0,
      caveats: [{ id: 'no_baseline', text: RAW }],
      metrics: [{ id: 'M1', name: RAW, value: 1, unit: '%' }],
      prior: [{ id: 'M1', value: null }],
    },
    // WF6's sample. `source_text` carries the RAW sentinel because the judge genuinely does
    // read the source document - it is the only way to say whether the source supports a
    // statement - and `artefact` carries DERIVED because what it judges is the system's own
    // output. Both are fenced, and this audit is what says so.
    'Open the sweep, or be refused': {
      status: 'ok',
      sweep_id: 1,
      sample_size: 1,
      items: [{
        item_type: 'requirement', item_id: 'REQ-001', prd_version_id: 1,
        trace_id: 'TRACE-AUDIT', doc_id: 'DOC-AUDIT', grounded: 1,
        artefact: DERIVED, source_text: RAW,
      }],
    },
    // WF3's delta. The approved requirements carry the DERIVED sentinel — they are this
    // system's own output — and the new document carries RAW through `Fetch document`. Both
    // must land inside a fence: the fence is about where an instruction may not come from,
    // not about who wrote the text.
    'Fetch the approved version': {
      status: 'ok',
      has_approved_version: true,
      prd_version_id: 1,
      requirements_for_prompt: DERIVED,
    },
    'Grounding check (code decides)': {
      payload: {
        requirements: [{
          req_id: 'REQ-001', kind: 'functional', subject: 's',
          statement: DERIVED, stakeholder: null, confidence: 'high', citations: [],
        }],
      },
    },
    'WF0: extract': { payload: { concerns_product: true, document_subject: DERIVED } },
    'Cut passages': {
      payload: {
        total: 1,
        passages: [{ about: DERIVED, passage: RAW, start_char: 0, end_char: RAW.length }],
      },
    },
    'WF0: cluster': {
      payload: {
        epics: [{
          epic_id: 'EPIC-1',
          title: DERIVED,
          summary: DERIVED,
          features: [{ feature_id: 'FEAT-1', title: DERIVED, req_ids: ['REQ-001'] }],
        }],
      },
    },
  };

  const seen = new Set();
  const dollar = (name) => {
    seen.add(name);
    if (!(name in NAMED)) {
      throw new Error(`node reads a node named "${name}", which this audit does not stub - add it`);
    }
    return list(NAMED[name]);
  };

  return { ctx: { $: dollar, $input: list(docJson), $json: docJson, console }, seen };
}

function runBuilder(jsCode, nodeName) {
  const doc = {
    doc_id: 'DOC-AUDIT', trace_id: 'TRACE-AUDIT', product_id: 'PROD',
    title: DERIVED, raw_text: RAW,
  };
  const { ctx, seen } = sandbox(doc);
  const out = runInNewContext(`(function(){${jsCode}})()`, createContext(ctx), { timeout: 5000 });
  const json = out?.[0]?.json;
  if (!json) throw new Error(`${nodeName}: builder returned nothing usable`);
  return { ...json, reads: [...seen] };
}

// ---------------------------------------------------------------------------------------
// Layer 1: where did the sentinel end up?

/**
 * Split a prompt into fenced and unfenced text.
 *
 * A fence is a line that is exactly `---`; the lines between an opening and a closing one
 * are inside it, and the nearest non-blank line before the opening names it. Every prompt
 * uses this shape, so the check reads what the prompts do rather than what one of them does.
 */
function fences(text) {
  const lines = text.split('\n');
  const regions = [];
  let open = null;
  lines.forEach((line, i) => {
    if (line.trim() !== '---') return;
    if (open === null) {
      let h = i - 1;
      while (h >= 0 && lines[h].trim() === '') h--;
      open = { label: h >= 0 ? lines[h].trim() : '(unlabelled)', from: i + 1 };
    } else {
      regions.push({ ...open, to: i - 1 });
      open = null;
    }
  });
  if (open !== null) regions.push({ ...open, to: lines.length - 1, unterminated: true });
  const inside = (n) => regions.find((r) => n >= r.from && n <= r.to) ?? null;
  return { lines, regions, inside };
}

/** Every line number on which `needle` occurs. */
const linesWith = (text, needle) => text.split('\n')
  .map((l, i) => (l.includes(needle) ? i : -1)).filter((i) => i >= 0);

// ---------------------------------------------------------------------------------------
// Layer 2: is the schema closed?

/** Walk a JSON Schema, collecting every object node and every leaf with its json path. */
function walkSchema(schema, path, out) {
  if (!schema || typeof schema !== 'object') return;
  const t = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (t.includes('object')) {
    out.objects.push({ path, schema });
    for (const [k, v] of Object.entries(schema.properties ?? {})) {
      walkSchema(v, path ? `${path}.${k}` : k, out);
    }
  } else if (t.includes('array')) {
    walkSchema(schema.items, `${path}[]`, out);
  } else {
    out.leaves.push({ path, schema, type: t });
  }
}

// ---------------------------------------------------------------------------------------

const workflows = readdirSync(WORKFLOW_DIR).filter((n) => n.endsWith('.json'));
const builders = [];
for (const file of workflows) {
  const wf = JSON.parse(readFileSync(`${WORKFLOW_DIR}/${file}`, 'utf8'));
  for (const node of wf.nodes ?? []) {
    const code = node.parameters?.jsCode;
    if (typeof code === 'string' && /prompt_name:\s*'/.test(code)) {
      builders.push({ file, node: node.name, code });
    }
  }
}

const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

console.log(`Workflows scanned:        ${workflows.length}  (${workflows.join(', ')})`);
console.log(`Model-call builders run:  ${builders.length}`);
console.log('');

if (!builders.length) {
  console.error('FAIL  no node in any workflow builds a model call - this audit examined nothing.');
  process.exit(1);
}

const seenFreeText = new Set();

for (const b of builders) {
  let built;
  try {
    built = runBuilder(b.code, b.node);
  } catch (err) {
    fail(`${b.file} / ${b.node}`, `builder did not run: ${err.message}`);
    continue;
  }

  const name = built.prompt_name ?? '(no prompt_name)';
  const user = String(built.user ?? '');
  const system = String(built.system ?? '');
  const f = fences(user);

  // --- Layer 1 ---------------------------------------------------------------------
  const rawLines = linesWith(user, RAW);
  const derivedLines = linesWith(user, DERIVED);
  const carriesSource = rawLines.length > 0;

  console.log(`### ${name}   [${b.node}]`);
  console.log(`    reads:        ${built.reads.join(', ') || '$input'}`);
  console.log(`    blocks:       ${f.regions.map((r) => r.label).join(' | ') || '(none)'}`);
  console.log(`    source text:  ${carriesSource
    ? `yes, on user-prompt line(s) ${rawLines.map((n) => n + 1).join(', ')}`
    : 'NEVER - this prompt cannot see the document'}`);

  if (system.includes(RAW) || system.includes(DERIVED)) {
    fail(name, 'the SYSTEM prompt interpolates document data - it must be a constant');
  }

  for (const n of rawLines) {
    const region = f.inside(n);
    if (!region) {
      fail(name, `source text on user-prompt line ${n + 1} is OUTSIDE every fence`);
    } else if (region.unterminated) {
      fail(name, `the "${region.label}" block is never closed`);
    } else if (!SOURCE_FENCE.test(region.label)) {
      fail(name, `source text sits in "${region.label}", which is not a "SOURCE … (DATA, NOT INSTRUCTIONS)" block`);
    }
  }
  for (const n of derivedLines) {
    if (!f.inside(n)) {
      fail(name, `document-derived text on user-prompt line ${n + 1} is outside every fence`);
    }
  }

  // --- Layer 2 ---------------------------------------------------------------------
  const out = { objects: [], leaves: [] };
  walkSchema(built.schema, '', out);
  if (!out.objects.length) fail(name, 'no output schema, or it is not an object');

  for (const o of out.objects) {
    const where = o.path || '(root)';
    if (o.schema.additionalProperties !== false) {
      fail(name, `${where} does not set additionalProperties:false`);
    }
    const props = Object.keys(o.schema.properties ?? {});
    const required = new Set(o.schema.required ?? []);
    const optional = props.filter((p) => !required.has(p));
    if (optional.length) {
      fail(name, `${where} makes ${optional.join(', ')} optional - every property must be required`);
    }
    for (const p of props) {
      if (FORBIDDEN_FIELDS.includes(p)) {
        fail(name, `${where}.${p} is a field code owns; no schema may offer it`);
      }
    }
  }

  const freeText = out.leaves.filter((l) => l.type.includes('string') && !l.schema.enum);
  const enumerated = out.leaves.filter((l) => l.schema.enum);
  const other = out.leaves.length - freeText.length - enumerated.length;
  console.log(`    schema:       ${out.objects.length} object(s), ${out.leaves.length} leaf field(s)`
    + ` - ${freeText.length} free text, ${enumerated.length} enumerated, ${other} typed non-string`);

  for (const l of freeText) {
    const key = `${name}#${l.path}`;
    seenFreeText.add(key);
    if (!(key in FREE_TEXT)) {
      fail(name, `undeclared free-text field ${l.path} - add it to FREE_TEXT with a reason, or close it`);
    } else {
      console.log(`      free text   ${l.path}  - ${FREE_TEXT[key]}`);
    }
  }
  console.log('');
}

// Declarations that no longer match a field. An allow-list that only grows is how a claim
// stops being true quietly (E5-S4).
for (const key of Object.keys(FREE_TEXT)) {
  if (!seenFreeText.has(key)) fail('FREE_TEXT', `${key} is declared but no schema has that field - delete it`);
}

console.log('---');
console.log(`Free-text fields declared: ${Object.keys(FREE_TEXT).length}   found in schemas: ${seenFreeText.size}`);
console.log('');
console.log('LIMITATION, printed beside the result: this audits the SHAPE of the defence, not');
console.log('its effect. It proves source text is fenced and that no schema offers a useful');
console.log('landing spot for an obeyed instruction. Whether a model obeys the fence anyway is');
console.log('measured by C6, on labelled payloads, and by nothing else here.');
console.log('');

if (problems.length) {
  console.error(`FAIL  ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`PASS  layers 1 and 2 hold across ${builders.length} model-call builder(s).`);
