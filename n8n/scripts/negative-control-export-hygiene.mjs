// The control for check-export-hygiene: plant a key and require the gate to shut.
//
// "An export check that has never rejected anything has not been tested" — E9-S1's own words.
// The check is currently green, which is the state in which a check proves nothing. Every case
// runs the SHIPPED checker against a copy of `n8n/` with one thing changed.
//
//   NC1  the real exports are green
//   NC2  an OpenAI-shaped key                   -> red, naming the file and the line
//   NC3  a Gemini-shaped key                    -> red. A different vendor prefix; a checker
//        that only knew `sk-` would call this clean
//   NC4  A VALUE FROM .env, of no recognisable shape -> red. THE CASE THAT MATTERS: this is
//        the secret nobody has a regex for, and the only reason the expensive half exists
//   NC5  pinData                                -> red. Real document text inside a file that
//        reads as configuration — the leak nobody looks for
//   NC6  an instance-generated credential id    -> red
//   NC7  CONTROL: the real exports are NOT called dirty, and the project's OWN fixed credential
//        id is not reported. A checker that failed everything would pass NC2-NC6 and be worthless
//   NC8  .env absent                            -> red, and said differently from a hit. A check
//        that silently drops half its coverage is this repository's oldest bug
//   NC9  an empty export directory              -> red. Zero files is a broken path, never a
//        clean bill of health (BUG-003/019)
//   NC10 and the real exports are green again afterwards
//
// Usage:  .\run.cmd n8n\scripts\negative-control-export-hygiene.mjs

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, unlinkSync,
  existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CHECK = 'n8n/scripts/check-export-hygiene.mjs';
const WF = 'n8n/workflows/WF0-llm-call.json';

/** A copy of n8n/ plus .env, with one thing changed. Nothing is written outside the copy. */
function runWith({ edit, file = WF, dropEnv = false, emptyDir = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'exphyg-'));
  mkdirSync(join(dir, 'n8n'), { recursive: true });
  cpSync('n8n/scripts', join(dir, 'n8n/scripts'), { recursive: true });
  if (emptyDir) mkdirSync(join(dir, 'n8n/workflows'), { recursive: true });
  else cpSync('n8n/workflows', join(dir, 'n8n/workflows'), { recursive: true });
  if (existsSync('.env') && !dropEnv) cpSync('.env', join(dir, '.env'));

  if (edit) {
    const p = join(dir, file);
    const before = readFileSync(p, 'utf8');
    const after = edit(before);
    if (after === before) {
      rmSync(dir, { recursive: true, force: true });
      return { code: null, out: `PLANT DID NOT APPLY to ${file} — the anchor has moved` };
    }
    writeFileSync(p, after);
  }
  const r = spawnSync(process.execPath, [join(dir, CHECK)], { encoding: 'utf8', cwd: dir });
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const rows = [];
const check = (id, what, pass, detail) => {
  rows.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${what}`);
  if (detail) console.log(`           ${String(detail).split('\n').join('\n           ')}`);
};
const named = (out, needle) => out.split('\n').filter((l) => l.includes(needle))
  .map((l) => l.trim()).slice(0, 2).join('\n           ') || '(not named)';

// The plant goes into a harmless string field, so what is being tested is the SCANNER and not
// the JSON parser. A key pasted into a note is exactly how this happens in real life.
const intoNote = (secret) => (s) => s.replace(String.raw`"active": true,`,
  `"active": true,
  "_scratch": "temporary, remove before submitting: ${secret}",`);

// --- NC1 -----------------------------------------------------------------------------------------
{
  const { code, out } = runWith();
  check('NC1', 'the real exports are green', code === 0, named(out, 'PASS'));
}

// --- NC2 / NC3: two vendors, two prefixes ---------------------------------------------------------
{
  const key = `sk-proj-${'A1b2C3d4E5f6G7h8'.repeat(2)}`;
  const { code, out } = runWith({ edit: intoNote(key) });
  check('NC2', 'an OpenAI-shaped key is caught, and the file and line are named',
    code === 1 && /OpenAI-shaped/.test(out) && /WF0-llm-call\.json:\d+/.test(out),
    named(out, 'OpenAI-shaped'));
}
{
  const key = `AIza${'Sy0123456789abcdefGHIJKLMNOPqrst'}`;
  const { code, out } = runWith({ edit: intoNote(key) });
  check('NC3', 'a Google-shaped key is caught — a different vendor, a different prefix',
    code === 1 && /Google-shaped/.test(out), named(out, 'Google-shaped'));
}

// --- NC4: THE CASE THAT MATTERS -------------------------------------------------------------------
// A value out of `.env` with no recognisable shape at all. No regex in the world catches this
// one; it is caught because the checker reads the file that holds it.
{
  const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
  const m = /^\s*INTERNAL_API_KEY\s*=\s*(.+)$/m.exec(env);
  const value = (m?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
  if (!value || value.length < 12) {
    check('NC4', 'a value from .env of no recognisable shape is caught', false,
      'could not read INTERNAL_API_KEY from .env — this case did not run, so it proved nothing');
  } else {
    const { code, out } = runWith({ edit: intoNote(value) });
    check('NC4', 'a .env value of NO recognisable shape is caught — the secret nobody has a regex for',
      code === 1 && /the value of INTERNAL_API_KEY from \.env/.test(out),
      named(out, 'from .env'));
  }
}

// --- NC5: pinned run data --------------------------------------------------------------------------
{
  const { code, out } = runWith({ edit: (s) => s.replace('"nodes": [',
    '"pinData": { "Door": [ { "json": { "raw_text": "Dana: our churn number is confidential" } } ] },\n  "nodes": [') });
  check('NC5', 'PINNED RUN DATA is caught — real document text inside a config file',
    code === 1 && /PINNED RUN DATA/.test(out), named(out, 'PINNED RUN DATA'));
}

// --- NC6: an instance-generated credential id --------------------------------------------------------
{
  const { code, out } = runWith({ edit: (s) => s.replace('"id": "BIND_ME_openAiApi"', '"id": "Xk7QpL2mNb9RtVwZ"') });
  check('NC6', 'an instance-generated credential id is caught, and named',
    code === 1 && /Xk7QpL2mNb9RtVwZ/.test(out), named(out, 'Xk7QpL2mNb9RtVwZ'));
}

// --- NC7: CONTROL -------------------------------------------------------------------------------------
// NC1 says the run is green. This says something narrower and more useful: the project's OWN
// fixed credential id is not reported as a leak. A checker that flagged every credential
// reference would pass NC6 and make the release un-importable.
{
  const { out } = runWith();
  check('NC7', "CONTROL: the project's own fixed credential id is shipped, not flagged",
    /prdgenieInternalKey/.test(out) && !/FAIL/.test(out),
    named(out, 'prdgenieInternalKey'));
}

// --- NC8: .env absent ----------------------------------------------------------------------------------
// A check that quietly runs half of itself is worse than one that fails, because it reports
// success. This must be red, and it must be red in a DIFFERENT sentence from a hit.
{
  const { code, out } = runWith({ dropEnv: true });
  check('NC8', 'an absent .env fails — half a check must never report a pass',
    code === 1 && /THE FILE IS ABSENT/.test(out) && !/hit\(s\)/.test(out),
    named(out, 'ABSENT'));
}

// --- NC9: nothing to scan --------------------------------------------------------------------------------
{
  const { code, out } = runWith({ emptyDir: true });
  check('NC9', 'an empty export directory fails — zero files is a broken path, not a clean result',
    code === 1 && /no exports found/.test(out), named(out, 'no exports found'));
}

// --- NC10 ----------------------------------------------------------------------------------------------------
{
  const { code } = runWith();
  check('NC10', 'and the real exports are green again afterwards', code === 0,
    'nothing was written outside a temp copy');
}

const failed = rows.filter((r) => !r.pass).length;
console.log('');
console.log(`${rows.length - failed}/${rows.length} controls behaved as required.`);
if (failed) {
  console.log('');
  console.log('A control that does not go red is not a control. Treat check-export-hygiene as');
  console.log('unproven until this passes — and it is the gate on the one irreversible mistake');
  console.log('in this release.');
}
process.exitCode = failed ? 1 : 0;
