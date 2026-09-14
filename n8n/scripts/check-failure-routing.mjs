// BUG-028. Which nodes are allowed to swallow a failure, and why.
//
// n8n's `onError: continueRegularOutput` turns a node that could not run into a node that
// produced an item. That is exactly right for a *provider* call whose failure a later node
// classifies, and exactly wrong for a *service* call whose failure means the run has nothing
// to work with — and the two were the same setting until an outage was recorded as
// `status: success` and billed for a model call.
//
// The distinction, and it is the whole file:
//
//   PRODUCT call     the run needs the answer. No answer -> STOP, so WF4 sees it.
//   PROVIDER call    the failure is data, and a named node downstream turns it into a
//                    reason code (BUG-011). Continue.
//   TELEMETRY call   the product may not fail because logging did (docs/traceability.md).
//                    Continue.
//   THE HANDLER      an error workflow that throws has nowhere to go. Continue.
//
// Every exemption is declared HERE with a reason, every reason is printed on every run, and
// an undeclared one fails — the `spine-ok` pattern from E5-S4, for the same reason: an
// allow-list that grows a node at a time and is never read again is how this stops being true.
//
// Usage:  .\run.cmd n8n/scripts/check-failure-routing.mjs

import { readFileSync, readdirSync } from 'node:fs';

const DIR = 'n8n/workflows';

// Nodes that MAY continue past their own failure. Keyed by `workflow file :: node name`.
const MAY_SWALLOW = {
  'WF0-llm-call.json::OpenAI gpt-4.1-mini':
    'PROVIDER. The failure is the data: "Parse or park" reads it and maps it to a reason code '
    + 'from the closed set (llm_timeout / llm_unauthorized / llm_rate_limited / llm_error). '
    + 'Stopping here would throw away the classification BUG-011 exists for.',
  'WF0-llm-call.json::Gemini Flash (judge)':
    'PROVIDER, and the same exemption as the OpenAI node beside it for the same reason: the '
    + 'failure is the data. Both branches land on the one "Parse or park", which normalises '
    + 'the two error shapes and runs the SAME classifier over them — a second classifier '
    + 'would be a second place for BUG-011 to happen.',
  'WF0-llm-call.json::Log the call':
    'TELEMETRY. Cost accounting must never be able to stop a run (docs/traceability.md, and '
    + 'E7-S3 TC15). The service itself already logs and continues on a failed llm_calls write.',
  'WF5-weekly-insights.json::WF0: narrative':
    'THE ONLY PRODUCT CALL THAT MAY FAIL QUIETLY, and the only one whose output is not part '
    + 'of the product. The weekly report IS the figures, and they are computed by the service '
    + 'before this node runs; the paragraph is a courtesy (docs/reporting.md rule 2). A failure '
    + "here must produce a report saying \"Narrative unavailable this week\" - NOT no report. "
    + 'The next node reads the commentary if there is one and passes nothing if there is not, '
    + 'so nothing is ever invented to fill the gap.',
  'WF6-judge-sweep.json::WF0: judge':
    'MONITORING, and the exemption exists so the failure becomes a ROW. The judge gates '
    + 'nothing, so a sweep that cannot reach Gemini must not stop the workflow before the '
    + 'node that records why: "Collect the scores" closes the sweep as `skipped` with a '
    + 'reason from the closed set. THE DISTINCTION BUG-028 IS ABOUT: this is not leniency '
    + 'for a bad answer, it is a named outcome for no answer — and a skipped sweep is never '
    + 'reported as a clean one, nor re-asked of the doer, which would be the doer marking '
    + 'its own work.',
  'WF4-error-handler.json::Record it':
    'THE HANDLER. An error workflow that throws has nowhere to go. It retries five times, '
    + 'three seconds apart, because the service it needs is usually the one that just died.',
};

const files = readdirSync(DIR).filter((n) => n.endsWith('.json'));
const CALLS = ['n8n-nodes-base.httpRequest', 'n8n-nodes-base.executeWorkflow'];

const problems = [];
const rows = [];

for (const f of files) {
  const wf = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));
  for (const n of wf.nodes ?? []) {
    if (!CALLS.includes(n.type)) continue;
    const key = `${f}::${n.name}`;
    // n8n's default when the field is absent IS to stop, so absent counts as stopping.
    const swallows = n.onError === 'continueRegularOutput' || n.onError === 'continueErrorOutput';
    const declared = key in MAY_SWALLOW;
    rows.push({ f, name: n.name, onError: n.onError ?? '(default: stop)', swallows, declared });

    if (swallows && !declared) {
      problems.push(`${key}: swallows its own failure and is not declared. If the run can `
        + 'continue without this call, say why in MAY_SWALLOW; otherwise remove onError so a '
        + 'failure stops the workflow and reaches WF4.');
    }
    if (!swallows && declared) {
      problems.push(`${key}: is declared in MAY_SWALLOW but no longer swallows anything — delete the entry.`);
    }
  }
}

console.log(`Workflows scanned:   ${files.length}`);
console.log(`Calls found:         ${rows.length}  (derived from the workflows, never typed)`);
console.log('');
for (const f of files) {
  const inFile = rows.filter((r) => r.f === f);
  if (!inFile.length) continue;
  console.log(`### ${f}`);
  for (const r of inFile) {
    console.log(`  ${r.swallows ? 'continues' : 'STOPS    '}  ${r.name.padEnd(34)} onError=${r.onError}`);
    if (r.declared) {
      for (const line of MAY_SWALLOW[`${r.f}::${r.name}`].match(/.{1,88}(\s|$)/g) ?? []) {
        console.log(`              ${line.trim()}`);
      }
    }
  }
  console.log('');
}

const stops = rows.filter((r) => !r.swallows).length;
console.log('---');
console.log(`${stops} call(s) stop the run when they cannot be reached — and therefore reach WF4.`);
console.log(`${rows.length - stops} continue, all declared with a reason above.`);
console.log('');

// Declared entries that name a node that no longer exists.
for (const key of Object.keys(MAY_SWALLOW)) {
  if (!rows.some((r) => `${r.f}::${r.name}` === key)) {
    problems.push(`MAY_SWALLOW: ${key} names a node that does not exist — delete the entry.`);
  }
}

if (problems.length) {
  console.error(`FAIL  ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('PASS  every call either stops the run or is declared, with a reason, as one that may not.');
