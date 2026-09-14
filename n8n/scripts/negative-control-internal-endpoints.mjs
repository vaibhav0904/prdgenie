// The control for check-internal-endpoints: plant an open door and require it to be named.
//
// The check reads `server.js`, works out which `/internal/` routes consult `internalAuthorized`,
// and refuses to knock on any that do not. Two ways for that to be quietly wrong, and both are
// planted here:
//
//   TC1  an unguarded route that a workflow DOES call
//   TC2  an unguarded route that NOTHING calls — the case the check only covers since BUG-051,
//        and the one that matters, because an endpoint nobody looks at is the one that gets
//        wired next month without being re-read
//   TC3  a route whose span runs into its neighbour's guard — the false negative that reads as
//        an audit, and the reason TC2 failed the first time it was run
//
// Every case runs the SHIPPED checker against a copy of the tree with `server.js` rewritten.
//
// Usage:  .\run.cmd n8n/scripts/negative-control-internal-endpoints.mjs

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CHECK = 'n8n/scripts/check-internal-endpoints.mjs';

/** A copy of what the check reads, with `server.js` rewritten by `edit`. */
function runWith(edit) {
  const dir = mkdtempSync(join(tmpdir(), 'endpoints-'));
  mkdirSync(join(dir, 'review-ui'), { recursive: true });
  mkdirSync(join(dir, 'n8n/scripts'), { recursive: true });
  cpSync('n8n/workflows', join(dir, 'n8n/workflows'), { recursive: true });
  cpSync(CHECK, join(dir, CHECK));
  writeFileSync(join(dir, 'review-ui/server.js'), edit(readFileSync('review-ui/server.js', 'utf8')));

  const r = spawnSync(process.execPath, [join(dir, CHECK)], { encoding: 'utf8', cwd: dir });
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const rows = [];
const check = (id, what, pass, detail) => {
  rows.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${what}${detail ? `\n           ${detail}` : ''}`);
};
const named = (out, needle) => out.split('\n').filter((l) => l.includes(needle)).join('\n           ').trim();

// --- TC0: the real tree is clean --------------------------------------------------------------
{
  const { code, out } = runWith((s) => s);
  check('TC0', 'the real server.js passes: every internal route consults the key', code === 0,
    named(out, 'PASS'));
}

// --- TC1: an unguarded route that a workflow calls ---------------------------------------------
// The guard is deleted from an endpoint WF2 dials, so the check has a caller to name.
{
  const { code, out } = runWith((s) => {
    const i = s.indexOf("route('POST', '/internal/grounding-check'");
    if (i < 0) throw new Error('grounding-check route not found');
    const guard = "if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });";
    const after = s.indexOf(guard, i);
    return s.slice(0, after) + s.slice(after + guard.length);
  });
  check('TC1', 'a guard removed from a CALLED route is caught, and the caller named',
    code === 1 && out.includes('grounding-check') && out.includes('without checking the key'),
    named(out, 'grounding-check'));
}

// --- TC2: an unguarded route nothing calls -----------------------------------------------------
{
  const { code, out } = runWith((s) => s.replace(
    "route('GET', '/api/health'",
    "route('POST', '/internal/invented-and-open', (req, res) => json(res, 200, { ok: true }));\n\nroute('GET', '/api/health'"));
  check('TC2', 'an unguarded route with NO caller is caught — the case BUG-051 widened to',
    code === 1 && out.includes('invented-and-open') && out.includes('without checking the key'),
    named(out, 'invented-and-open'));
}

// --- TC3: the span, which is how TC2 first passed wrongly --------------------------------------
//
// The check works out a handler's extent as "from this route to the next route". When "next
// route" meant the next INTERNAL one, an unguarded endpoint sitting beside `/api/` handlers had
// its span run on until it met somebody else's `internalAuthorized`. TC2's plant is precisely
// that shape — declared immediately before `/api/health` — so TC2 passing IS this assertion.
// Stated separately because a reader should not have to infer it.
{
  const shipped = readFileSync(CHECK, 'utf8');
  check('TC3', 'a handler\'s span ends at the next route OF ANY KIND, not the next internal one',
    /ANY_ROUTE\s*=\s*\/route\\\('\(\?:GET/.test(shipped) || shipped.includes('everyRoute.find'),
    'the extent is computed from every route declaration, so a neighbour\'s guard cannot be borrowed');
}

const failed = rows.filter((r) => !r.pass).length;
console.log('');
console.log(`${rows.length - failed}/${rows.length} controls behaved as required.`);
if (failed) {
  console.log('');
  console.log('A control that does not go red is not a control. Treat check-internal-endpoints');
  console.log('as unproven until this passes.');
}
process.exitCode = failed ? 1 : 0;
