// The control for check-reason-codes: plant each of its five rules broken, one at a time.
//
// The check is green on the real tree, which is the state in which a check proves nothing.
// Each case here runs the SHIPPED checker against a copy of the tree with exactly one thing
// changed — inject the fault, vary one thing (BUG-011/012).
//
//   NC1  the real tree is green
//   NC2  a code emitted and declared nowhere            -> red, named with file and line
//   NC2b/c BOTH ARMS of a ternary, planted one at a time  -> red, named. The case BUG-063 was
//        filed for, and the one this control had never asked
//   NC2d CONTROL: a value with no literal at all         -> GREEN, and listed as a pass-through
//   NC2e CONTROL: a literal being COMPARED                -> GREEN, it is not one of the answers
//   NC3  a code declared and emitted nowhere            -> red, named  (this is `low_confidence`,
//                                                          which lived in the closed set unused
//                                                          from the day it was written)
//   NC4  a member in both REASONS and DOOR_REASONS      -> red, named
//   NC5  prose sitting in the code slot of a status obj -> red, named
//   NC6  CONTROL: prose OUTSIDE a status object is fine -> green. A rule that reddens on every
//        sentence would pass NC5 and forbid `{ available: false, reason: 'no prior version' }`,
//        which is a UI explanation and not a code at all.
//   NC6b the contract does not name a code the sets do    -> red, named
//   NC6c the contract cannot be read at all             -> red in words, never a stack trace
//   NC7  the tree is unchanged afterwards
//
// Usage:  .\run.cmd review-ui\scripts\negative-control-reason-codes.mjs

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CHECK = 'review-ui/scripts/check-reason-codes.mjs';

/**
 * A copy of everything the check reads, with one file rewritten.
 *
 * The whole of `review-ui/` goes across because the check IMPORTS the modules to read their
 * declarations, and an import pulls in `db.mjs` and the harness beside it. `evals/` travels
 * for the same reason.
 */
function runWith(file, edit, { withDocs = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'reasons-'));
  mkdirSync(join(dir, 'data'), { recursive: true });
  cpSync('review-ui', join(dir, 'review-ui'), { recursive: true });
  cpSync('n8n/workflows', join(dir, 'n8n/workflows'), { recursive: true });
  cpSync('evals', join(dir, 'evals'), { recursive: true });
  // Rule 5 reads the contract. The first version of this control did not copy `docs/` and the
  // check died with an ENOENT stack trace across all seven cases — which the control caught,
  // and which is why the check now fails that rule with a sentence instead of throwing.
  if (withDocs) cpSync('docs', join(dir, 'docs'), { recursive: true });
  if (edit) {
    const p = join(dir, file);
    writeFileSync(p, edit(readFileSync(p, 'utf8')));
  }
  const r = spawnSync(process.execPath, [join(dir, CHECK)], {
    encoding: 'utf8',
    cwd: dir,
    // The modules open the database on import. A copy of the tree with an empty `data/` would
    // create one; pointing at the real path would let a control write to the product's db.
    env: { ...process.env, DB_PATH: join(dir, 'data', 'control.db') },
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

// --- NC1 -----------------------------------------------------------------------------------
{
  const { code, out } = runWith(null, null);
  check('NC1', 'the real tree is green: every literal accounted for', code === 0, named(out, 'PASS'));
}

// --- NC2: emitted, declared nowhere ---------------------------------------------------------
// Planted in `delta.mjs`, where BUG-050's two actually were.
{
  const { code, out } = runWith('review-ui/delta.mjs', (s) => s.replace(
    "reason: 'unknown_version'", "reason: 'invented_and_undeclared'"));
  check('NC2', 'a code emitted and declared nowhere is caught, with file and line',
    code === 1 && out.includes('invented_and_undeclared') && out.includes('delta.mjs:'),
    named(out, 'invented_and_undeclared'));
}

// --- NC2b: BOTH ARMS OF A TERNARY, which is the case that had never been asked ----------------
//
// BUG-063. The checker matched `reason:` followed immediately by a quoted literal, so
// `reason: gate.empty ? 'nothing_to_review' : 'items_undecided'` was invisible — two codes the
// human gate refuses a sign-off with, declared nowhere, and a check saying "every one accounted
// for". Nothing in this control had ever asked whether the extractor's SHAPE was complete: NC2
// plants a literal and the check finds it, which is the case the checker was written for.
//
// Each arm is planted separately, because a checker that read only the first would pass a test
// that planted only the first.
for (const [id, arm] of [['NC2b', 'first'], ['NC2c', 'second']]) {
  const ternary = arm === 'first'
    ? "reason: true ? 'invented_first_arm' : 'unknown_version'"
    : "reason: true ? 'unknown_version' : 'invented_second_arm'";
  const { code, out } = runWith('review-ui/delta.mjs', (s) => s.replace(
    "reason: 'unknown_version'", ternary));
  const wanted = arm === 'first' ? 'invented_first_arm' : 'invented_second_arm';
  check(id, `an undeclared code in a ternary's ${arm} arm is caught`,
    code === 1 && out.includes(wanted), named(out, wanted));
}

// --- NC2d: CONTROL — a pass-through is not a failure --------------------------------------------
// A rule that reddened on `reason: err.reason` would be switched off within a day, and a check
// nobody runs is worse than one that under-reports. It must be LISTED and green.
{
  const { code, out } = runWith('review-ui/delta.mjs', (s) => s.replace(
    "reason: 'unknown_version'", 'reason: someRuntimeValue'));
  check('NC2d', 'CONTROL: a value with no literal is listed as a pass-through, not failed',
    code === 0 && out.includes('pass-through') && out.includes('someRuntimeValue'),
    named(out, 'someRuntimeValue'));
}

// --- NC2e: CONTROL — a comparison operand is not a code -------------------------------------------
// `reason: kind === 'conflict' ? 'conflict_needs_both_sides' : 'no_citation'` is real, in
// `gaps.mjs`. The first widened extractor reported `conflict` — the thing being compared — as an
// undeclared reason code. A checker that fails on the condition of its own ternaries is a
// checker whose red rows nobody believes.
{
  const { code, out } = runWith('review-ui/delta.mjs', (s) => s.replace(
    "reason: 'unknown_version'",
    "reason: kind === 'a_comparison_operand' ? 'unknown_version' : 'unknown_document'"));
  check('NC2e', 'CONTROL: a literal being COMPARED is not read as a code',
    code === 0 && !out.includes('a_comparison_operand'),
    'the condition of a ternary is not one of its answers');
}

// --- NC3: declared, emitted nowhere -----------------------------------------------------------
// `low_confidence` verbatim: this was real, it was in the closed set from the first day, and
// nothing in any module or any workflow ever produced it.
{
  const { code, out } = runWith('review-ui/assemble.mjs', (s) => s.replace(
    "  'no_approved_version',", "  'low_confidence', 'no_approved_version',"));
  check('NC3', 'a code declared and emitted nowhere is caught — the real `low_confidence`',
    code === 1 && out.includes('low_confidence') && out.includes('nothing emits'),
    named(out, 'low_confidence'));
}

// --- NC4: the two closed sets overlap ----------------------------------------------------------
{
  const { code, out } = runWith('review-ui/assemble.mjs', (s) => s.replace(
    "  'unauthorized',", "  'unauthorized', 'schema_invalid',"));
  check('NC4', 'a member of both REASONS and DOOR_REASONS is caught',
    code === 1 && out.includes('share 1 member') && out.includes('schema_invalid'),
    named(out, 'share'));
}

// --- NC5: prose in the code slot ----------------------------------------------------------------
{
  const { code, out } = runWith('review-ui/server.js', (s) => s.replace(
    "reason: 'unknown_route', detail: 'no such route'", "reason: 'no such route'"));
  check('NC5', 'a sentence in the code slot of a status object is caught',
    code === 1 && out.includes('no such route') && out.includes('code slot'),
    named(out, 'no such route'));
}

// --- NC6: CONTROL — prose outside a status object is not a fault ---------------------------------
// If this went red, rule 4 would be "no sentence anywhere", which forbids the perfectly
// correct `{ available: false, reason: 'no prior version' }` the review page reads.
{
  const { code, out } = runWith('review-ui/review.mjs', (s) => s.replace(
    "reason: 'no such version'", "reason: 'no such version at all'"));
  check('NC6', 'CONTROL: prose in a NON-status object stays green — the rule is the slot, not the sentence',
    code === 0, named(out, 'prose'));
}

// --- NC6b: a code in the sets and not in the contract --------------------------------------------
{
  const { code, out } = runWith('docs/contracts.md', (s) => s.replace('`unknown_sweep`', 'unknown sweep'));
  check('NC6b', 'a code a caller can receive and cannot look up is caught',
    code === 1 && out.includes('unknown_sweep') && out.includes('cannot look up'),
    named(out, 'unknown_sweep'));
}

// --- NC6c: the contract missing entirely is a red row, not a stack trace --------------------------
// How the first version of this control failed. A check that throws in the middle of a sweep of
// sixty reads as the harness breaking; the rule has to fail in words.
{
  const { code, out } = runWith(null, null, { withDocs: false });
  check('NC6c', 'an unreadable contract fails rule 5 in a sentence, and does not throw',
    code === 1 && out.includes('could not be read') && !out.includes('at readFileSync'),
    named(out, 'could not be read'));
}

// --- NC7: nothing changed ------------------------------------------------------------------------
{
  const { code } = runWith(null, null);
  check('NC7', 'and the tree is unchanged afterwards', code === 0, 'the check is green again');
}

const failed = rows.filter((r) => !r.pass).length;
console.log('');
console.log(`${rows.length - failed}/${rows.length} controls behaved as required.`);
if (failed) {
  console.log('');
  console.log('A control that does not go red is not a control. Treat check-reason-codes as');
  console.log('unproven until this passes.');
}
process.exitCode = failed ? 1 : 0;
