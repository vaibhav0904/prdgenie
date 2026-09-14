// The control for check-doors-registered: declare a door n8n has never heard of.
//
// The check is green, which is the state in which a check proves nothing. Every case runs the
// SHIPPED checker against a copy of `n8n/workflows` with one thing changed.
//
//   NC1  the real exports are green: every declared door registered
//   NC2  a WEBHOOK door n8n does not have         -> red, named with its workflow and node
//   NC3  a FORM door n8n does not have            -> red. A different probe (200 vs 404), and
//        the door a PERSON uses — the one BUG-043 found shut for two days
//   NC4  CONTROL: the real doors are NOT called missing. A check that reported everything dead
//        would pass NC2 and NC3 and be worthless
//   NC5  no doors at all                          -> red. Zero doors is a broken extractor, and
//        an empty list must never read as a clean bill of health (BUG-003/019)
//   NC6  n8n unreachable                          -> red, and DISTINGUISHED from "not
//        registered". Those two have different fixes and must not share a message
//   NC7  the exports are unchanged afterwards
//
// Usage:  .\run.cmd n8n\scripts\negative-control-doors-registered.mjs

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CHECK = 'n8n/scripts/check-doors-registered.mjs';

/** A copy of the workflow exports with one file rewritten, run against the real n8n. */
function runWith(file, edit, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'doors-'));
  mkdirSync(join(dir, 'n8n/scripts'), { recursive: true });
  cpSync('n8n/workflows', join(dir, 'n8n/workflows'), { recursive: true });
  cpSync(CHECK, join(dir, CHECK));
  if (edit) {
    const p = join(dir, file);
    writeFileSync(p, edit(readFileSync(p, 'utf8')));
  }
  const r = spawnSync(process.execPath, [join(dir, CHECK)], {
    encoding: 'utf8', cwd: dir, env: { ...process.env, ...env },
  });
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const rows = [];
const check = (id, what, pass, detail) => {
  rows.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${what}${detail ? `\n           ${detail}` : ''}`);
};
const named = (out, needle) => out.split('\n').filter((l) => l.includes(needle)).join('\n           ').trim();

// --- NC1 ------------------------------------------------------------------------------------
{
  const { code, out } = runWith(null, null);
  check('NC1', 'the real exports are green: every declared door is registered', code === 0,
    named(out, 'PASS'));
}

// --- NC2: a webhook door that does not exist ---------------------------------------------------
// The path is renamed rather than a node added: renaming exercises the same derivation the real
// thing uses, and a node bolted on could differ from a shipped one in some way that mattered.
{
  const { code, out } = runWith('n8n/workflows/WF3-delta.json', (s) => s.replace(
    '"path": "delta"', '"path": "delta-that-was-never-deployed"'));
  check('NC2', 'a declared WEBHOOK door n8n does not have is caught, and named',
    code === 1 && out.includes('delta-that-was-never-deployed') && out.includes('NOT registered'),
    named(out, 'delta-that-was-never-deployed'));
}

// --- NC3: a form door that does not exist -------------------------------------------------------
// A form is probed differently — a registered one renders and answers 200, an absent one 404 —
// so a checker that only knew the webhook shape would call this one fine.
{
  const { code, out } = runWith('n8n/workflows/WF1-ingest.json', (s) => s.replace(
    '"webhookId": "prdgenie-ingest-form"', '"webhookId": "form-that-was-never-deployed"'));
  check('NC3', 'a declared FORM door n8n does not have is caught — a different probe entirely',
    code === 1 && out.includes('form-that-was-never-deployed'),
    named(out, 'form-that-was-never-deployed'));
}

// --- NC4: CONTROL — the real doors are not called missing ------------------------------------------
// NC1 says the run is green. This says something narrower and more useful: no door was reported
// GONE. A check that printed GONE for everything and still exited 0 would pass NC1.
{
  const { out } = runWith(null, null);
  check('NC4', 'CONTROL: no real door is reported GONE — the check can tell them apart',
    !out.includes('GONE'), `${(out.match(/ ok  /g) ?? []).length} door(s) reported ok, 0 GONE`);
}

// --- NC5: no doors at all ---------------------------------------------------------------------------
{
  const { code, out } = runWith('n8n/workflows/WF1-ingest.json', (s) => s
    .replace(/"n8n-nodes-base\.webhook"/g, '"n8n-nodes-base.noOp"')
    .replace(/"n8n-nodes-base\.formTrigger"/g, '"n8n-nodes-base.noOp"'));
  // The other workflows still declare doors, so this plant removes WF1's two rather than all
  // five: what it proves is that the count comes from the exports and moves when they move.
  check('NC5', 'the door count is derived from the exports and drops when they do',
    !out.includes('WF1-ingest:Door'), `exit=${code}, WF1's two doors are gone from the listing`);
}

// --- NC5b: the empty case, which must not read as clean ----------------------------------------------
{
  const dir = mkdtempSync(join(tmpdir(), 'doors-empty-'));
  mkdirSync(join(dir, 'n8n/workflows'), { recursive: true });
  mkdirSync(join(dir, 'n8n/scripts'), { recursive: true });
  cpSync(CHECK, join(dir, CHECK));
  const r = spawnSync(process.execPath, [join(dir, CHECK)], { encoding: 'utf8', cwd: dir });
  rmSync(dir, { recursive: true, force: true });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  check('NC5b', 'ZERO doors fails — an empty list is a broken extractor, not a clean result',
    r.status === 1 && /no doors found/i.test(out), named(out, 'no doors found'));
}

// --- NC6: n8n unreachable, and said differently -------------------------------------------------------
{
  const { code, out } = runWith(null, null,
    { N8N_INGEST_WEBHOOK_URL: 'http://localhost:5699/webhook/ingest' });
  check('NC6', 'n8n not answering is reported as DOWN, not as a missing door',
    code === 1 && /did not answer/i.test(out) && !/NOT registered/i.test(out),
    named(out, 'did not answer'));
}

// --- NC7: unchanged ------------------------------------------------------------------------------------
{
  const { code } = runWith(null, null);
  check('NC7', 'and the real exports are green again afterwards', code === 0,
    'nothing was written outside a temp copy');
}

const failed = rows.filter((r) => !r.pass).length;
console.log('');
console.log(`${rows.length - failed}/${rows.length} controls behaved as required.`);
if (failed) {
  console.log('');
  console.log('A control that does not go red is not a control. Treat check-doors-registered as');
  console.log('unproven until this passes.');
}
process.exitCode = failed ? 1 : 0;
