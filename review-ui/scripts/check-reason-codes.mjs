// Every reason code the shipped code emits is a member of a set somebody declared.
//
// BUG-050 found two: `checkDelta` answered a bad call with `unknown_version` and
// `unknown_document`, neither of them in the closed set, neither of them in the contract.
// It found two because `verify-routing`'s TC17 asked the delta path, and **a check that
// covers one module is a claim about one module**. Asked of every module, the same question
// came back with fifteen.
//
// WHAT IT ASSERTS
//
//   1. EMITTED -> DECLARED. Every string literal in the VALUE of a `<something>reason` key — in
//      a shipped module, in `server.js`, or in a workflow export — is a member of some declared
//      set, or is prose. The value, not the token after the colon: a ternary contributes both
//      arms, and reading only the first token is how two codes hid for a whole epic (BUG-063).
//      A value with no literal in it is a pass-through, listed rather than skipped.
//   2. DECLARED -> EMITTED. Every member of every declared set appears as a string literal
//      somewhere outside its own declaration. A closed set that only grows is a glossary,
//      and `low_confidence` sat in it from the first day and was produced by nothing.
//   3. DISJOINT. `REASONS` and `DOOR_REASONS` share no member. A code that is both
//      envelope-carried and a door refusal is the confusion this card is about: everything
//      in `REASONS` is park-able, and a park mints a version row.
//   4. PROSE STAYS OUT OF THE CODE SLOT. A `reason` whose value contains a space is a
//      sentence, and a sentence in an object that also carries `status:` is prose occupying
//      the field something else has to branch on. It belongs in `detail`.
//   5. WRITTEN DOWN WHERE A READER WOULD LOOK. Every member of `REASONS` and `DOOR_REASONS`
//      is named in `docs/contracts.md`. Those two are what a CALLER receives, and a code a
//      caller can receive and cannot look up is a code that gets guessed at. The inward
//      vocabularies are exempt on purpose — a contract that indexed the source would be a
//      document nobody reads twice.
//
// WHAT IS DERIVED, and it is nearly all of it (BUG-003/019):
//
//   - the files scanned: every `.mjs` beside `server.js` in `review-ui/`, plus every workflow
//     export. Not a list — a module written tomorrow is in scope tomorrow.
//   - the declared sets: every export whose name ends in `REASONS` and whose value is a Set
//     or an array of strings. Adding a fifth vocabulary declares itself.
//   - the coverage figure printed at the bottom, which is a count of what was classified,
//     not an assertion that classification happened.
//
// The one thing that is typed is the pair in rule 3, because "these two are disjoint" is a
// claim about two specific sets and cannot be derived from their contents.
//
// Usage:  .\run.cmd review-ui\scripts\check-reason-codes.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const MODULE_DIR = 'review-ui';
const WORKFLOW_DIR = 'n8n/workflows';

// --- what gets read ---------------------------------------------------------------------------

/** Shipped source: the modules and the server, never `scripts/` — a check is not the product. */
const moduleFiles = readdirSync(MODULE_DIR)
  .filter((f) => f.endsWith('.mjs') || f === 'server.js')
  .sort()
  .map((f) => `${MODULE_DIR}/${f}`);

const workflowFiles = readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.json')).sort()
  .map((f) => `${WORKFLOW_DIR}/${f}`);

const files = [...moduleFiles, ...workflowFiles];
const source = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

// --- the declared vocabularies, collected by importing ------------------------------------------
//
// Imported rather than parsed. A regex over `export const X = new Set([...])` would read the
// text of a declaration; importing reads the value, which is what the running code has — and
// `SKIP_REASONS` is spread from another list, so its text does not contain its own members.

const vocab = [];   // { name, file, members:Set }
for (const f of moduleFiles) {
  if (f.endsWith('server.js')) continue;   // starts a listener on import
  let mod;
  try {
    mod = await import(pathToFileURL(resolve(f)).href);
  } catch (e) {
    console.error(`FAIL  could not import ${f} to read its declarations: ${e.message}`);
    process.exitCode = 1;
    continue;
  }
  for (const [name, value] of Object.entries(mod)) {
    if (!/REASONS$/.test(name)) continue;
    const members = value instanceof Set ? [...value] : Array.isArray(value) ? value : null;
    if (!members || !members.every((m) => typeof m === 'string')) continue;
    vocab.push({ name, file: f, members: new Set(members) });
  }
}

const declared = new Map();   // code -> [list names]
for (const v of vocab) {
  for (const m of v.members) {
    if (!declared.has(m)) declared.set(m, []);
    declared.get(m).push(v.name);
  }
}

// --- what the code emits ------------------------------------------------------------------------
//
// Any field whose name ENDS in `reason`, so `skipped_reason` and `park_reason` are in scope
// without being named: a second field holding codes is exactly how a vocabulary escapes.
//
// THE KEY IS MATCHED, THEN ITS WHOLE VALUE IS READ (BUG-063). The first version of this file
// matched `reason:` followed immediately by a quoted literal, which meant it could not see:
//
//     reason: gate.empty ? 'nothing_to_review' : 'items_undecided',
//
// — the two codes the human gate refuses a sign-off with, declared nowhere, asserted by name in
// two verifiers, and absent from a check whose headline was "every one accounted for". **A check
// with a false negative is worse than no check, because it reads as an audit** (BUG-051's own
// sentence, in a file three commits old).
//
// So the value expression is walked to its end and EVERY string literal in it is a code. A
// ternary contributes both arms; `x ?? 'llm_error'` contributes the fallback and is marked as
// also dynamic; `err.reason` contributes nothing and is reported as a pass-through rather than
// skipped, because "I could not read this" is information a coverage claim depends on.
//
// THE KEY MUST BE IN PROPERTY POSITION. `[A-Za-z_]*reason` on its own matched the tail of the
// n8n node named **"Refused — log the reason"**, whose connections object is `{"main": [...]}`
// — so the checker reported `main` as an undeclared reason code. A key is preceded by `{`, `,`
// or the start of a line, never by a letter or a space inside a longer phrase.
//
// `(?:\s|\\n)*` and not `\s*`: inside a workflow export a Code node's script is a JSON string,
// so its newlines arrive as the two characters `\` and `n`. Requiring real whitespace made the
// schema field `\"reason\": { \"type\": \"string\" }` invisible — a blind spot introduced by the
// fix for a blind spot, which is the failure mode this whole card is about.
const KEY = /(?:^|[{,])(?:\s|\\n)*\\?["']?([A-Za-z_]*reason)\\?["']?\s*:/gm;

/**
 * The value expression of a property, from just after its colon to the end of the property.
 *
 * Strings are SKIPPED rather than scanned, so a literal containing a comma or a brace cannot
 * truncate the expression — `reason: 'no such version, really'` used to be a hazard the old
 * regex never met because it never looked this far.
 */
function valueExpression(text, colonIdx) {
  let depth = 0;
  let i = colonIdx + 1;
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { i++; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      for (i++; i < text.length; i++) {
        if (text[i] === '\\') { i++; continue; }
        if (text[i] === quote) break;
      }
      continue;
    }
    if (c === '(' || c === '[' || c === '{') { depth++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) break;
      depth--;
      continue;
    }
    if ((c === ',' || c === ';') && depth === 0) break;
  }
  return text.slice(colonIdx + 1, i);
}

/** Every string literal in an expression, including the `\"...\"` form a JSON-embedded script has. */
function literalsIn(expr) {
  const out = [];
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '\\' && (expr[i + 1] === '"' || expr[i + 1] === "'")) {
      const quote = expr[i + 1];
      const start = i + 2;
      for (i += 2; i < expr.length; i++) {
        if (expr[i] === '\\' && expr[i + 1] === quote) break;
      }
      out.push(expr.slice(start, i));
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      const start = i + 1;
      for (i++; i < expr.length; i++) {
        if (expr[i] === '\\') { i++; continue; }
        if (expr[i] === c) break;
      }
      out.push(expr.slice(start, i));
      continue;
    }
  }
  return out;
}

/**
 * The literals that are CANDIDATE CODES, which is not the same as every literal in the
 * expression. A ternary's condition is not a code:
 *
 *     reason: kind === 'conflict' ? 'conflict_needs_both_sides' : 'no_citation'
 *
 * `'conflict'` there is the thing being compared, and the first version of this reported it as
 * an undeclared reason. Comparison operands are stripped — general, and it catches the same
 * shape wherever it appears rather than only in the first ternary condition.
 *
 * The limit, stated because a reader should not have to find it: a literal compared with
 * something other than `==`/`===`/`!=`/`!==` — inside `includes()`, say — is still read as a
 * code. That would be a false positive, and a false positive fails loudly; the direction this
 * check must never fail in is the quiet one.
 */
function codeLiterals(expr) {
  const withoutComparisons = expr
    .replace(/[!=]==?\s*(['"])(?:[^'"\\]|\\.)*?\1/g, ' ')
    .replace(/(['"])(?:[^'"\\]|\\.)*?\1\s*[!=]==?/g, ' ');
  return literalsIn(withoutComparisons);
}

/** What is left of an expression once its string literals and pure glue are removed. */
const GLUE = /^[\s?:|&()!,]*$/;
function isDynamic(expr) {
  let stripped = expr;
  for (const lit of literalsIn(expr)) {
    stripped = stripped.replace(`'${lit}'`, '').replace(`"${lit}"`, '').replace(`\\"${lit}\\"`, '');
  }
  return !GLUE.test(stripped.replace(/\?\?/g, ''));
}

const occurrences = [];   // { file, line, field, code, object }
const passThrough = [];   // { file, line, field, expr }
const structural = [];    // { file, line, field } — a `reason` that is a shape, not a code
for (const [file, text] of source) {
  for (const m of text.matchAll(KEY)) {
    const colon = m.index + m[0].length - 1;
    const expr = valueExpression(text, colon);
    const line = text.slice(0, m.index).split('\n').length;

    // A `reason` whose value is an OBJECT is a schema, not a code slot: WF2's prompts declare
    // `reason: { type: 'string' }` for the model's output, and reading its innards as codes
    // reported `type` and `string` as undeclared reasons. Listed, because a schema field named
    // `reason` is worth a reader knowing about.
    if (/^\s*\\?[{[]/.test(expr)) {
      structural.push({ file, line, field: m[1] });
      continue;
    }

    const literals = codeLiterals(expr);
    if (!literals.length) {
      // Not a failure and not invisible. A value the checker cannot read statically is listed
      // with its expression, so the coverage figure below says what it does NOT cover.
      passThrough.push({ file, line, field: m[1], expr: expr.trim().slice(0, 70) });
      continue;
    }
    for (const code of literals) {
      occurrences.push({
        file,
        line,
        field: m[1],
        code,
        dynamic: isDynamic(expr),
        // The enclosing object literal, for rule 4. Walked, not guessed.
        object: enclosingObject(text, m.index),
      });
    }
  }
}

/** The `{ ... }` an occurrence sits directly inside, or `''` if it is not in one. */
function enclosingObject(text, at) {
  let depth = 0;
  let open = -1;
  for (let i = at; i >= 0; i--) {
    const c = text[i];
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) { open = i; break; }
      depth--;
    }
  }
  if (open < 0) return '';
  depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return text.slice(open);
}

// --- rule 1: emitted -> declared ----------------------------------------------------------------

const isProse = (code) => /\s/.test(code) || code === '';

const undeclared = [];
const prose = [];
const classified = new Map();   // list name -> count
for (const o of occurrences) {
  if (declared.has(o.code)) {
    for (const list of declared.get(o.code)) classified.set(list, (classified.get(list) ?? 0) + 1);
    o.vocab = declared.get(o.code).join('/');
  } else if (isProse(o.code)) {
    prose.push(o);
    o.vocab = 'prose';
  } else {
    undeclared.push(o);
    o.vocab = null;
  }
}

// --- rule 2: declared -> emitted ----------------------------------------------------------------
//
// A member counts as used when it appears as a quoted string ANYWHERE in the scanned files
// other than inside a `*REASONS` declaration — a ternary and a SQL literal are uses too, and
// only `reason:` occurrences would have missed both.

const DECLARATION = /export const [A-Za-z_]*REASONS[\s\S]*?\n\);|export const [A-Za-z_]*REASONS[\s\S]*?\]\);/g;
const bodies = [...source.values()].map((t) => t.replace(DECLARATION, ''));
const used = (code) => bodies.some((b) => b.includes(`'${code}'`) || b.includes(`"${code}"`)
  || b.includes(`\\"${code}\\"`));

const unused = [...declared.keys()].filter((c) => !used(c)).sort();

// --- rule 3: the two closed sets are disjoint ----------------------------------------------------

const setNamed = (n) => vocab.find((v) => v.name === n);
const envelopeSet = setNamed('REASONS');
const doorSet = setNamed('DOOR_REASONS');
const overlap = (envelopeSet && doorSet)
  ? [...envelopeSet.members].filter((m) => doorSet.members.has(m))
  : [];

// --- rule 4: prose out of the code slot ----------------------------------------------------------

const proseInCodeSlot = prose.filter((o) => /(^|[\s{,])status\s*:/.test(o.object));

// --- rule 5: the two wire sets are written down where a reader would look ------------------------
//
// Only these two, and the limit is deliberate. `REASONS` and `DOOR_REASONS` are what a CALLER
// receives — the first on an envelope, the second as the answer to a call that could not be
// answered — and a code a caller can receive and cannot look up is a code that gets guessed at.
//
// The other vocabularies stay inside the process: a drop reason explains to the next function
// why an item was set aside, and a vetting reason is `buildReport` talking to itself. Requiring
// the contract to carry those would make it an index of the source, which is a document nobody
// reads twice.
//
// Read defensively and say so. An unreadable contract must be a red row with a sentence, not a
// stack trace: this file is run by a sweep and by a control that hands it a partial copy of the
// tree, and "ENOENT" in the middle of sixty checks reads as the harness breaking rather than as
// the rule failing.
let contracts = null;
try {
  contracts = readFileSync('docs/contracts.md', 'utf8');
} catch (e) {
  console.error(`FAIL  docs/contracts.md could not be read: ${e.code ?? e.message}`);
  console.error('      Rule 5 cannot be answered, so it is failed rather than skipped.');

}
const undocumented = contracts === null ? [] : [envelopeSet, doorSet].filter(Boolean).flatMap((v) =>
  [...v.members].filter((m) => !contracts.includes(`\`${m}\``)).map((m) => ({ code: m, set: v.name })));

// --- the report ----------------------------------------------------------------------------------

console.log('Declared vocabularies:');
for (const v of vocab.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`  ${v.name.padEnd(18)} ${String(v.members.size).padStart(3)} codes   ${v.file}`
    + `   ${classified.get(v.name) ?? 0} literal(s) in scope`);
}
console.log('');

let failed = contracts === null;

// Coverage, asserted rather than assumed. Zero occurrences means the regex stopped matching,
// not that the code stopped emitting reasons.
if (occurrences.length === 0) {
  console.error('FAIL  no reason literals found at all — the extractor is broken, not the code.');
  failed = true;
}
if (vocab.length === 0) {
  console.error('FAIL  no declared vocabularies found — the importer is broken.');
  failed = true;
}

if (undeclared.length) {
  failed = true;
  console.error(`FAIL  ${undeclared.length} reason literal(s) belong to no declared set:`);
  for (const o of undeclared) console.error(`  ${o.code.padEnd(28)} ${o.file}:${o.line}  (${o.field})`);
  console.error('');
  console.error('Each one is a contract amendment or a bug card, in this diff, in three places');
  console.error('at once. Adding it to a set here and nowhere else is the non-fix BUG-050 named.');
}

if (unused.length) {
  failed = true;
  console.error(`FAIL  ${unused.length} declared code(s) that nothing emits:`);
  for (const c of unused) console.error(`  ${c.padEnd(28)} declared in ${declared.get(c).join(', ')}`);
  console.error('');
  console.error('A closed set that only ever grows is a glossary. Either something should be');
  console.error('producing it, or it should not be in the set.');
}

if (overlap.length) {
  failed = true;
  console.error(`FAIL  REASONS and DOOR_REASONS share ${overlap.length} member(s): ${overlap.join(', ')}`);
  console.error('      Everything in REASONS is park-able, and a park mints a prd_versions row.');
}

if (proseInCodeSlot.length) {
  failed = true;
  console.error(`FAIL  ${proseInCodeSlot.length} sentence(s) sitting in the code slot of a status object:`);
  for (const o of proseInCodeSlot) console.error(`  "${o.code}"  ${o.file}:${o.line}`);
  console.error('');
  console.error('A caller branches on `reason` and shows `detail`. Prose there is a field');
  console.error('nothing can filter, wearing the name of one that can.');
}

if (undocumented.length) {
  failed = true;
  console.error(`FAIL  ${undocumented.length} code(s) a caller can receive and cannot look up:`);
  for (const u of undocumented) console.error(`  ${u.code.padEnd(28)} in ${u.set}, absent from docs/contracts.md`);
  console.error('');
  console.error('Three places at once: the set, the contract, and something that emits it.');
  console.error('Two of the three is a code somebody will guess the meaning of.');
}

// WHAT THIS CHECK CANNOT READ, said out loud (BUG-063). A `reason` whose value is a variable or
// a call has no literal to check, and a `reason` that is a schema field is not a code slot at
// all. Neither is a failure — a rule that reddened on `reason: err.reason` would be switched off
// within a day — but both are subtracted from the coverage figure below rather than quietly
// dropped out of it, because a denominator that excludes what it could not see is the shape of
// every hand-counted denominator this project has been bitten by (BUG-003/019/032).
if (passThrough.length || structural.length) {
  console.log(`Not statically readable, and therefore NOT covered by the figure below:`);
  for (const p of passThrough) {
    console.log(`  pass-through  ${p.file}:${p.line}  ${p.field}: ${p.expr}`);
  }
  for (const s of structural) {
    console.log(`  schema field  ${s.file}:${s.line}  ${s.field} is a shape, not a code`);
  }
  console.log('');
}

if (!failed) {
  const lists = vocab.length;
  console.log(`PASS  ${occurrences.length} reason literals, every one accounted for:`);
  console.log(`      ${occurrences.length - prose.length} codes across ${lists} declared vocabularies`
    + ` (${declared.size} codes declared, all emitted),`);
  console.log(`      ${prose.length} prose, none of them in a status object's code slot.`);
  console.log('');
  console.log('      Files read (derived, not listed): '
    + `${moduleFiles.length} modules + ${workflowFiles.length} workflow exports.`);
  console.log('      What this does NOT assert: that a code is emitted by the right module.');
  console.log('      The vocabularies overlap by design — a provider code is a park reason and');
  console.log('      a skip reason both — so "which set was meant" is a reading, not a check.');
}

process.exitCode = failed ? 1 : 0;
