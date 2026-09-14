// The review service: the single writer, the deterministic endpoints, and the UI host.
// node:http only — zero npm dependencies (ADR 0009).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { initSchema, schemaVersion, DB_PATH, all, run, get, signOff, logEvent } from './db.mjs';
import { allMetrics } from './metrics.mjs';
import { buildReport, writeReport, weekFigures, caveatsFor, NARRATIVE_UNAVAILABLE } from './weekly.mjs';
import { ingest, getDocument, envelope } from './ingest.mjs';
import { groundRequirements, assertModelDidNotSetOwnedFields } from './grounding.mjs';
import { assemble, validatePrd, getVersion, parkRun, REASONS } from './assemble.mjs';
import {
  groundOpenQuestions,
  assertModelDidNotSetOwnedFields as assertOpenQuestionsUnowned,
} from './gaps.mjs';
import {
  groundUnsettled,
  reconcile,
  assertModelDidNotSetOwnedFields as assertUnsettledUnowned,
} from './unsettled.mjs';
import {
  validateClusters, validateStories, validateFactors, assertModelDidNotScore,
} from './structure.mjs';
import { decidableItems, decisions, readiness, figures, caveats, trend, versionHistory } from './review.mjs';
import { scanForInjection, describeHits } from './tripwire.mjs';
import { cutPassages, mergePasses } from './passages.mjs';
import {
  approvedVersionFor, requirementsForPrompt, checkDelta, applyDelta,
  assertModelDidNotSetOwnedFields as assertDeltaUnowned,
} from './delta.mjs';
import {
  openSweep, recordScores, closeSweep, sweeps, sweepSummary, unjudgedRemaining, coverageByStratum,
  rubricVersion, JUDGE_MODEL,
} from './judge.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(here, 'public');
const PORT = Number(process.env.SERVICE_PORT ?? 3000);

initSchema();

// --- tiny router -------------------------------------------------------------
// Sixty lines instead of Express, so that `npm install` cannot fail (ADR 0009).

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

function match(pattern, pathname) {
  const p = pattern.split('/').filter(Boolean);
  const u = pathname.split('/').filter(Boolean);
  if (p.length !== u.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(u[i]);
    else if (p[i] !== u[i]) return null;
  }
  return params;
}

const json = (res, status, body) => {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(payload);
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  // Contain path traversal: resolve, then confirm the result is inside PUBLIC_DIR.
  const filePath = resolve(join(PUBLIC_DIR, normalize(rel)));
  if (!filePath.startsWith(PUBLIC_DIR)) { json(res, 403, { error: 'forbidden' }); return; }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    json(res, 404, { error: 'not found', path: pathname });
  }
}

// --- routes ------------------------------------------------------------------

route('GET', '/api/health', (req, res) => json(res, 200, {
  status: 'ok',
  schema_version: schemaVersion(),
  db_path: DB_PATH,
  node: process.version,
}));

// --- /internal/* : the deterministic surface n8n calls (ADR 0004) -------------
// Everything here is code the eval harness can call too, so a case tests the same
// implementation the workflow runs rather than a parallel copy of it.

const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? '';

function internalAuthorized(req) {
  // Adequate for localhost and nothing else — stated plainly in docs/assumptions.md
  // rather than dressed up. Note it still cannot approve a PRD: that is the trigger's job.
  if (!INTERNAL_KEY) return true;
  return req.headers['x-internal-key'] === INTERNAL_KEY;
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (err) {
    const e = new Error('body is not valid JSON');
    e.reason = 'envelope_invalid';
    throw e;
  }
}

route('POST', '/internal/ingest', async (req, res) => {
  if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });
  const body = await readJson(req);
  const env = ingest(body);
  return json(res, env.status === 'ok' ? 200 : 400, env);
});

// Cost accounting for every model call. WF0 is the only caller, because WF0 is the only
// workflow holding a provider credential — which is what makes this unbypassable.
//
// Unit prices are a LOCAL table, so rows are labelled `estimated`: a corrected price can
// sit beside them later rather than overwriting them (docs/traceability.md). The token
// counts themselves are provider-reported.
// The judge's model is priced here too, so a sweep's cost is attributable like every other
// call — and so "the judge is cheap" is a figure rather than a belief. Cross-vendor by
// design (ADR 0001): the grader is never the doer.
const PRICE_PER_1M = {
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  // Google's published paid-tier price for the judge, valid through 2026-12-31 and DOUBLING
  // on 2027-01-01. The doubling is not encoded: a table that silently changed price on a date
  // would make two identical sweeps cost differently for no reason a reader could see. When it
  // changes, the new price is added and the old rows keep theirs (docs/traceability.md).
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
};

route('POST', '/internal/llm-call', async (req, res) => {
  if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });
  const c = await readJson(req);
  const price = PRICE_PER_1M[c.model] ?? { input: 0, output: 0 };
  const cost = ((c.prompt_tokens ?? 0) * price.input + (c.completion_tokens ?? 0) * price.output) / 1e6;
  try {
    run(`INSERT INTO llm_calls (trace_id, component, prompt_name, prompt_version, model,
           prompt_tokens, completion_tokens, latency_ms, cost_usd, usage_source, attempt, outcome)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [c.trace_id ?? null, c.component ?? 'unknown', c.prompt_name ?? 'unknown',
       c.prompt_version ?? null, c.model ?? 'unknown', c.prompt_tokens ?? null,
       c.completion_tokens ?? null, c.latency_ms ?? null, cost, 'estimated',
       c.attempt ?? 1, c.outcome ?? null]);
  } catch (err) {
    // Telemetry may fail; the product may not.
    console.warn(`[telemetry] llm_call write failed, continuing: ${err.message}`);
  }
  return json(res, 200, { status: 'ok', cost_usd: cost });
});

// Cut the contested passages out of the document, so each can be read on its own (BUG-023).
//
// The model said WHERE the arguments were — a noticing task. Code says WHAT: both quotes are
// located with the same matcher a citation goes through, and a passage that cannot be located,
// runs backwards, or turns out to be most of the document is DROPPED WITH A REASON. A passage
// that is most of the document would recreate the very condition that loses the requirement,
// and charge a model call to do it.
route('POST', '/internal/passages', async (req, res) => {
  if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });
  const body = await readJson(req);
  const { doc_id, trace_id = null } = body;

  const doc = getDocument(doc_id);
  if (!doc) {
    return json(res, 400, envelope({
      doc_id, trace_id, component: 'passage_cutter', status: 'error',
      payload: { reason: 'envelope_invalid', missing: [`doc_id=${doc_id}`] },
    }));
  }

  const cut = cutPassages(doc.raw_text, body.contested_passages ?? []);
  return json(res, 200, envelope({
    product_id: doc.product_id, doc_id, trace_id: trace_id ?? doc.trace_id,
    component: 'passage_cutter', status: 'ok',
    payload: {
      passages: cut.passages,
      // Never a bare count: each refusal names the passage and why, in the same envelope the
      // next stage reads.
      dropped: cut.dropped,
      total: cut.passages.length,
    },
  }));
});

// The grounding check. Code decides `grounded`; the model never does (ADR 0003).
route('POST', '/internal/grounding-check', async (req, res) => {
  if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });
  const body = await readJson(req);
  const { doc_id, trace_id = null, requirements = [] } = body;

  const doc = getDocument(doc_id);
  if (!doc) {
    return json(res, 400, envelope({
      doc_id, trace_id, component: 'grounding_check', status: 'error',
      payload: { reason: 'envelope_invalid', missing: [`doc_id=${doc_id}`] },
    }));
  }

  // Rejected, not cleaned up: ignoring a model-supplied `grounded` invites a later
  // refactor to start trusting it, and that failure would be silent.
  const offenders = assertModelDidNotSetOwnedFields(requirements);
  if (offenders.length) {
    return json(res, 400, envelope({
      doc_id, trace_id, component: 'grounding_check', status: 'error',
      payload: { reason: 'schema_invalid', missing: offenders },
    }));
  }

  const result = groundRequirements(doc.raw_text, requirements);

  // The second pass over the contested passages (BUG-023), merged HERE — after grounding and
  // before anything downstream reads the list.
  //
  // After grounding, because grounding is what rewrites a citation's offsets to the span the
  // document actually contains. Two passes describing the same sentence agree on that span
  // only once code has located both; comparing the model's own hints would miss the duplicate
  // and ship it twice.
  //
  // Before everything else, for BUG-025's reason: the gap detector, the clusterer, the story
  // drafter and assembly must all see the list the PRD will actually ship, not an earlier one.
  const secondPass = groundRequirements(doc.raw_text, body.passage_requirements ?? []);
  const passes = mergePasses(result.requirements, secondPass.requirements);

  // RECONCILE HERE, not at assembly (BUG-025).
  //
  // The extractor emits both sides of an argument as unsettled positions AND, about a third
  // of the time, as requirements. Code withdraws the duplicates — but until now it did that
  // at ASSEMBLY, which is after the gap detector has already been shown the list and told
  // "do not repeat these as questions". **The detector was being told the argument was
  // already handled**, and it complied: it found T4's announced deferral in 1 run of 3 while
  // the extractor found it in 3 of 3.
  //
  // So the reconciliation moves to the earliest point where both halves exist, and every
  // stage after it — detector, clusterer, story drafter, assembly — sees the same list: the
  // one that will actually ship. Assembly still reconciles, and now finds nothing, which is
  // how it stays a safety net rather than the only net.
  const positions = groundUnsettled(doc.raw_text, body.unsettled_positions ?? [], {
    concernsProduct: body.concerns_product,
  });
  const settled = reconcile(passes.requirements, positions.unsettled_positions);

  return json(res, 200, envelope({
    product_id: doc.product_id, doc_id, trace_id,
    component: 'grounding_check',
    status: 'ok',
    payload: {
      ...result,
      requirements: settled.requirements,
      unsettled_positions: positions.unsettled_positions,
      // Never a bare count: each withdrawal names the requirement and the position it
      // duplicated, in the same envelope the next stage reads.
      requirements_withdrawn: settled.withdrawn,
      unsettled_dropped: positions.dropped,
      // The second pass's ledger, named rather than counted. "2 merged" is a number; these
      // say which sentences the first pass walked past and which it had already found.
      second_pass_merged: passes.merged,
      second_pass_duplicates: passes.duplicates,
      second_pass_seen: (body.passage_requirements ?? []).length,
    },
  }));
});

// Assembly: grounded requirements become a PRDVersion in `in_review`, or the run parks
// with a machine-readable reason and creates no draft at all.
route('POST', '/internal/assemble', async (req, res) => {
  if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });
  const body = await readJson(req);
  const { doc_id, trace_id = null, requirements = [] } = body;
  const doc = getDocument(doc_id);
  if (!doc) {
    return json(res, 400, envelope({
      doc_id, trace_id, component: 'assembler', status: 'error',
      payload: { reason: 'envelope_invalid', missing: [`doc_id=${doc_id}`] },
    }));
  }

  // --- Layer 3, the tripwire (E7-S1, ADR 0007) -------------------------------------------
  //
  // FIRST, before every other check, and in exactly one place.
  //
  // WHY HERE. Assembly is the single point where every model output converges - the
  // requirements and unsettled positions from the extractor, the open questions from the
  // detector, and the epics, features, stories and factors from the three structure calls -
  // and it is also the only endpoint on this path that WRITES ANYTHING. Detection therefore
  // happens after the model returns and before anything is stored, which is the whole
  // requirement: a payload cleaned up after storage has already been in the database.
  //
  // A second copy earlier, at the grounding check, would be a second control to keep in step
  // with this one, and it could not see two of the three outputs because they do not exist
  // yet. One control, once (CLAUDE.md). The accepted cost is that a contaminated run still
  // pays for the four model calls after extraction; a park is cheap next to a wrong PRD.
  //
  // WHAT IS SCANNED. The request body, which on this path is model output and two ids and
  // nothing else - `raw_text` is read from the database inside `assemble()` and never
  // travels here. The document's own text is deliberately NOT scanned: H1 contains the
  // payloads by construction, and a tripwire that fired on the source would park every
  // hostile fixture for existing and measure nothing.
  //
  // BEFORE the schema assertions below, on purpose. A contaminated run that also happens to
  // be malformed should park as `injection_detected`, not be turned away as `schema_invalid`
  // - the second reason would send someone looking at the wrong thing.
  const hits = scanForInjection(body, { skipKeys: ['doc_id', 'trace_id'] });
  if (hits.length) {
    // NOTHING of the model's output is stored: `parkRun` writes an empty requirement list,
    // and `detail` names marker ids and JSON paths only. The payload does not enter the
    // database on the way to being refused by it.
    const env = parkRun({
      doc,
      trace_id: trace_id ?? doc.trace_id,
      reason: 'injection_detected',
      component: 'assembler',
      detail: describeHits(hits),
    });
    env.payload.injection_hits = hits;
    return json(res, 200, env);
  }

  // BUG-004. The extractor's own judgement of what the document is about travels with the
  // requirements, and code decides what to do with it.
  //
  // ABSENT IS NOT FALSE, and it is not true either — it is a schema violation, refused at
  // the boundary. Defaulting a missing judgement to `true` would restore the old behaviour
  // silently the first time the model omitted the field, which is precisely the kind of
  // quiet regression this project keeps finding (BUG-015's shape).
  const hasJudgement = typeof body.concerns_product === 'boolean'
    && typeof body.document_subject === 'string' && body.document_subject.trim() !== '';
  if (!hasJudgement) {
    const missing = [];
    if (typeof body.concerns_product !== 'boolean') missing.push('concerns_product');
    if (typeof body.document_subject !== 'string' || !body.document_subject.trim()) {
      missing.push('document_subject');
    }
    return json(res, 400, envelope({
      product_id: doc.product_id, doc_id, trace_id: trace_id ?? doc.trace_id,
      component: 'assembler', status: 'error',
      payload: { reason: 'schema_invalid', missing },
    }));
  }

  // Open questions arrive raw from the detector and are grounded HERE, by the same
  // `locate()` the requirements went through. Two callers, one matcher: the alternative
  // was a second round trip to /internal/grounding-check between the gap call and this
  // one, which buys nothing and adds a hop that can fail.
  //
  // Rejected, not cleaned up — the same rule requirements get. A model-supplied
  // `grounded` is a schema violation, because ignoring one invites a later refactor to
  // start trusting it and that failure would be silent.
  const oqOffenders = assertOpenQuestionsUnowned(body.open_questions);
  if (oqOffenders.length) {
    return json(res, 400, envelope({
      product_id: doc.product_id, doc_id, trace_id: trace_id ?? doc.trace_id,
      component: 'assembler', status: 'error',
      payload: { reason: 'schema_invalid', missing: oqOffenders },
    }));
  }
  // The extractor's subject judgement reaches the open questions too (BUG-019). It is read
  // from the SAME field assembly reads, so the two outputs of one run can never disagree
  // about what the document was about.
  const gaps = groundOpenQuestions(doc.raw_text, body.open_questions ?? [], {
    concernsProduct: body.concerns_product,
  });

  // The second box the extractor was missing (BUG-007). Same treatment as everything else
  // the model emits: it may judge and it may write prose; code decides whether the quote is
  // in the document, and code refuses a model-supplied verdict rather than ignoring one.
  // ALREADY GROUNDED, OR RAW — and the difference decides which rule applies.
  //
  // Since BUG-025 the grounding stage grounds and reconciles these, so on the real path they
  // arrive with `match_kind` already stamped by code. Asserting "the model may not set these
  // fields" against them **rejected the system's own work**: T3 and T4, the two fixtures with
  // unsettled positions, came back `schema_invalid` and produced nothing.
  //
  // `verify-gaps.mjs` TC8 wrote this trap down for open questions — *"this assert belongs on
  // the way IN, and running it on the way out would reject the system's own work"* — and it
  // was walked into one layer up two days later. So the shape decides: a position carrying
  // `match_kind` came from the grounding stage and is passed through; one without it is raw,
  // and gets both the assertion and the grounding.
  const rawPositions = (body.unsettled_positions ?? [])
    .some((p) => (p.citations ?? []).some((c) => 'match_kind' in c)) === false;

  if (rawPositions) {
    const upOffenders = assertUnsettledUnowned(body.unsettled_positions);
    if (upOffenders.length) {
      return json(res, 400, envelope({
        product_id: doc.product_id, doc_id, trace_id: trace_id ?? doc.trace_id,
        component: 'assembler', status: 'error',
        payload: { reason: 'schema_invalid', missing: upOffenders },
      }));
    }
  }

  const unsettled = rawPositions
    ? groundUnsettled(doc.raw_text, body.unsettled_positions ?? [], {
      concernsProduct: body.concerns_product,
    })
    : {
      unsettled_positions: body.unsettled_positions ?? [],
      dropped: [],
      ungrounded: (body.unsettled_positions ?? []).filter((p) => p.grounded === false).length,
    };

  // The extractor's two outputs are reconciled against EACH OTHER before anything is
  // stored: a sentence it filed as an unsettled position does not also ship as an agreed
  // requirement. Same call, same response, one of the two has to give way — and the
  // explicit judgement wins, exactly as it does for `concerns_product`.
  const settled = reconcile(requirements, unsettled.unsettled_positions);

  // --- structure (E3-S1, S2, S3) ---------------------------------------------------------
  //
  // Validated AFTER reconciliation, because reconciliation is what decides which requirements
  // still exist. Every id the model referred to is checked against the list it was given, and
  // a score it tried to supply is refused the way a self-certified `grounded` is.
  const scoreOffenders = assertModelDidNotScore(
    (body.epics ?? []).flatMap((e) => e.features ?? []));
  if (scoreOffenders.length) {
    return json(res, 400, envelope({
      product_id: doc.product_id, doc_id, trace_id: trace_id ?? doc.trace_id,
      component: 'assembler', status: 'error',
      payload: { reason: 'schema_invalid', missing: scoreOffenders },
    }));
  }

  const clustered = validateClusters(settled.requirements, { epics: body.epics ?? [] });
  const drafted = validateStories(clustered.features, settled.requirements, { stories: body.stories ?? [] });
  const scored = validateFactors(clustered.features, { priority_factors: body.priority_factors ?? [] });

  const structure = {
    epics: clustered.epics,
    features: clustered.features,
    stories: drafted.stories,
    factors: scored.factors,
    // The model's own list of what it could not place, kept beside the code's. They should
    // agree; when they do not, that is worth seeing rather than reconciling away.
    unclustered: body.unclustered ?? [],
  };

  const extraction = {
    document_subject: body.document_subject,
    concerns_product: body.concerns_product,
  };
  const env = assemble(doc, settled.requirements, trace_id ?? doc.trace_id, extraction,
    gaps.open_questions, unsettled.unsettled_positions, structure);
  // The drop ledger travels with the result. A detector emitting garbage and one emitting
  // nothing both produce "0 open questions"; only this tells them apart.
  if (env.payload) {
    env.payload.open_question_counts = gaps.counts;
    env.payload.open_questions_dropped = gaps.dropped;
    env.payload.open_questions_ungrounded = gaps.ungrounded;
    env.payload.unsettled_dropped = unsettled.dropped;
    env.payload.unsettled_ungrounded = unsettled.ungrounded;
    // Never a bare count: each withdrawal names the requirement and the position it
    // duplicated, so "2 withdrawn" can always be read rather than trusted.
    env.payload.requirements_withdrawn = settled.withdrawn;
    // The structure's own ledger. Every one of these is a thing that did not fit, and a
    // count of what worked without them would be the flattering half of the story.
    env.payload.structure_problems = [...clustered.problems, ...drafted.problems, ...scored.problems];
    env.payload.unclustered_by_code = clustered.unclustered;
    env.payload.duplicated_requirements = clustered.duplicated;
    env.payload.features_without_stories = drafted.features_without_stories;
    env.payload.features_without_factors = scored.features_without_factors;
    env.payload.requirements_per_epic = clustered.ratio;
  }
  return json(res, env.status === 'error' ? 400 : 200, env);
});

// A park that never reached assembly still has to leave a trace (BUG-012).
//
// This is the endpoint WF2's model-failure branch calls. It exists because that branch used
// to write NOTHING — no version, no event, no dead letter — while returning an envelope
// that looked exactly like the assembly park's. Two paths producing the same envelope are
// not the same path, and nothing was looking at what they persisted.
//
// The reason code is checked against the closed set here rather than trusted from the
// caller: a park is a permanent record, and a record naming a code the contract does not
// have is a record nobody can query.
route('POST', '/internal/park', async (req, res) => {
  if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });
  const body = await readJson(req);
  const { doc_id, trace_id = null, reason, component = 'assembler', detail = null } = body;

  const doc = getDocument(doc_id);
  if (!doc) {
    return json(res, 400, envelope({
      doc_id, trace_id, component, status: 'error',
      payload: { reason: 'envelope_invalid', missing: [`doc_id=${doc_id}`] },
    }));
  }
  if (!REASONS.has(reason)) {
    return json(res, 400, envelope({
      product_id: doc.product_id, doc_id, trace_id: trace_id ?? doc.trace_id,
      component, status: 'error',
      payload: { reason: 'schema_invalid', missing: [`reason=${reason ?? '(none)'}`] },
    }));
  }

  const env = parkRun({
    doc,
    trace_id: trace_id ?? doc.trace_id,
    reason,
    component,
    detail: detail ? String(detail).slice(0, 300) : null,
  });
  return json(res, 200, env);
});

// The needs-attention queue (E7-S3). WF4 is the only caller.
//
// A dead letter is what a PARK is not: a park is a run that stopped honestly and left its
// work behind, addressable by version id. A dead letter is a run that DIED — there is no
// version to attach anything to, and the only thing left is the question "what needs a human
// right now".
//
// Three rules, and each one is a decision:
//
//   1. **The reason comes from the closed set.** A queue nobody can filter is a log.
//   2. **`trace_id` may be missing and the row is still stored.** A workflow can fail before
//      it knows which document it was for. Refusing the row to protect a column would lose
//      the failure to keep a field tidy — exactly backwards.
//   3. **The detail must make the row actionable without a log.** WF4 sends the workflow, the
//      node, the message and the execution id, and they are stored verbatim.
route('POST', '/internal/dead-letter', async (req, res) => {
  if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });
  const body = await readJson(req);
  const reason = body.reason ?? 'workflow_error';

  if (!REASONS.has(reason)) {
    return json(res, 400, envelope({
      trace_id: body.trace_id ?? null, component: body.component ?? 'error_handler',
      status: 'error',
      payload: { reason: 'schema_invalid', missing: [`reason=${reason}`] },
    }));
  }

  // A run that died at its first node has no `trace_id` in flight yet — but it usually knows
  // which document it was for, and the service already knows that document's trace. Looking
  // it up here turns an unjoinable row into a joinable one using nothing but our own data.
  //
  // Only ever FILLED IN, never overridden: if WF4 found a trace_id, that is the run that
  // actually died, and a document can have been ingested more than once.
  let trace_id = body.trace_id ?? null;
  let trace_recovered = false;
  if (!trace_id && body.doc_id) {
    const d = getDocument(body.doc_id);
    if (d?.trace_id) { trace_id = d.trace_id; trace_recovered = true; }
  }

  // Everything except the fields above. Stored as given, so the row says what n8n said.
  const detail = {
    ...(trace_recovered ? { trace_recovered_from: `doc ${body.doc_id}` } : {}),
    workflow: body.workflow ?? null,
    node: body.node ?? null,
    message: body.message ?? null,
    execution_id: body.execution_id ?? null,
    execution_url: body.execution_url ?? null,
    ...(body.detail ? { detail: body.detail } : {}),
  };

  const info = run(`INSERT INTO dead_letters (trace_id, doc_id, component, reason, envelope)
                    VALUES (?,?,?,?,?)`,
    [trace_id, body.doc_id ?? null, body.component ?? 'error_handler', reason,
     JSON.stringify(detail)]);

  // The event log answers "what became of this trace_id" (docs/contracts.md). A run that
  // died has to answer it too, or the one guarantee the spine makes has a hole in exactly
  // the case it was written for.
  if (trace_id) {
    logEvent(trace_id, 'dead_lettered', body.component ?? 'error_handler',
      [reason, detail.node, detail.message].filter(Boolean).join(' — ').slice(0, 300));
  }

  return json(res, 200, envelope({
    doc_id: body.doc_id ?? null, trace_id,
    component: body.component ?? 'error_handler', status: 'needs_review',
    payload: { reason, missing: [], dead_letter_id: Number(info.lastInsertRowid) },
  }));
});

const deadLetterRow = (r) => ({
  ...r,
  envelope: (() => { try { return JSON.parse(r.envelope ?? 'null'); } catch { return r.envelope; } })(),
  // Said out loud rather than left for the reader to infer from two nulls.
  joinable: Boolean(r.trace_id),
});

route('GET', '/api/dead-letters', (req, res) => {
  const { searchParams } = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const all_ = searchParams.get('all') === '1';
  const rows = all(`SELECT dead_letter_id, trace_id, doc_id, component, reason, envelope,
                           created_at, resolved_at, resolution_note
                    FROM dead_letters
                    ${all_ ? '' : 'WHERE resolved_at IS NULL'}
                    ORDER BY dead_letter_id DESC`);
  return json(res, 200, {
    dead_letters: rows.map(deadLetterRow),
    unresolved: get('SELECT COUNT(*) n FROM dead_letters WHERE resolved_at IS NULL').n,
    total: get('SELECT COUNT(*) n FROM dead_letters').n,
  });
});

// Resolving ADDS to the record. The reason and the detail are never rewritten, and the note
// is required for the same reason a review decision's is: "resolved" with no note is a row
// nobody can learn anything from six weeks later.
route('POST', '/api/dead-letters/:id/resolve', async (req, res, { id }) => {
  const body = await readJson(req);
  const note = String(body.note ?? '').trim();
  if (!note) {
    return json(res, 400, { status: 'error', reason: 'reason_required', missing: ['note'] });
  }
  const row = get('SELECT resolved_at FROM dead_letters WHERE dead_letter_id=?', [id]);
  if (!row) {
    return json(res, 404, { status: 'error', reason: 'unknown_dead_letter', detail: 'no such dead letter' });
  }
  if (row.resolved_at) {
    return json(res, 409, { status: 'error', reason: 'already_resolved', resolved_at: row.resolved_at });
  }
  run("UPDATE dead_letters SET resolved_at=datetime('now'), resolution_note=? WHERE dead_letter_id=?",
    [note, id]);
  return json(res, 200, {
    status: 'ok',
    dead_letter: deadLetterRow(get(`SELECT dead_letter_id, trace_id, doc_id, component, reason,
      envelope, created_at, resolved_at, resolution_note FROM dead_letters WHERE dead_letter_id=?`, [id])),
  });
});

// RICE, and the only place it is computed. E3-S3: the model supplies four judgements and its
// reasoning; the arithmetic is code, because no citation can check a number.
//
// Assembly calls the same `computeScore` from structure.mjs rather than calling this endpoint
// over HTTP — one function, two callers, and the model is not one of them.
route('POST', '/internal/score', async (req, res) => {
  if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });
  const body = await readJson(req);
  const checked = validateFactors(
    (body.features ?? []).map((f) => ({ feature_id: f.feature_id })),
    { priority_factors: body.priority_factors ?? [] });

  if (checked.problems.length) {
    return json(res, 400, envelope({
      component: 'scorer', status: 'error',
      payload: { reason: 'schema_invalid', missing: checked.problems },
    }));
  }
  return json(res, 200, envelope({
    component: 'scorer', status: 'ok',
    payload: {
      scores: checked.factors.map((f) => ({ feature_id: f.feature_id, priority_score: f.priority_score })),
      formula: 'round(reach * impact * confidence / effort, 1)',
    },
  }));
});

route('POST', '/internal/validate', async (req, res) => {
  if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });
  const { content } = await readJson(req);
  const check = validatePrd(content);
  return json(res, check.valid ? 200 : 400, envelope({
    component: 'validator',
    status: check.valid ? 'ok' : 'error',
    payload: check.valid ? { valid: true } : { reason: 'schema_invalid', missing: check.missing },
  }));
});

// Every figure on the Metrics page, computed by metrics.mjs and by nothing else. This
// handler holds no SQL: a second implementation of a definition is the failure E8-S1 exists
// to prevent, and the cheapest way to get one is to let the page have its own query.
route('GET', '/api/metrics', (req, res) => json(res, 200, allMetrics()));

// --- WF3, the delta: what a new document changes about an approved PRD (E6-S1) ------------------
//
// Two calls. The first answers "is there an approved version for this product, and what does it
// say" — the question WF1's routing turns on, computed here rather than asked of a PM. The
// second checks what the model proposed: every `req_id` against the approved version, every
// quote against the new document, and it returns the ledger of what it refused.

route('GET', '/internal/approved-version', (req, res) => {
  if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });
  const productId = new URL(req.url, 'http://localhost').searchParams.get('product_id');
  if (!productId) return json(res, 400, { status: 'error', reason: 'envelope_invalid', missing: ['product_id'] });
  const version = approvedVersionFor(productId);
  // NOT an error: "no approved version" is the normal answer for a product's first document,
  // and WF1 routes on it. An error here would make the ordinary case look like a failure.
  return json(res, 200, {
    status: 'ok',
    product_id: productId,
    has_approved_version: Boolean(version),
    ...(version ? { ...version, requirements_for_prompt: requirementsForPrompt(version) } : {}),
  });
});

route('POST', '/internal/delta-check', async (req, res) => {
  if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });
  const body = await readJson(req);

  const owned = assertDeltaUnowned(body?.payload ?? {});
  if (owned.length) {
    return json(res, 400, {
      status: 'error',
      reason: 'schema_invalid',
      missing: owned,
      detail: 'the model set a field code owns; the delta is refused rather than cleaned up',
    });
  }

  const out = checkDelta({
    prd_version_id: Number(body?.prd_version_id),
    doc_id: body?.doc_id,
    payload: body?.payload ?? {},
  });
  return json(res, out.status === 'ok' ? 200 : 400, out);
});

// APPLYING it (E6-S2). Separate from checking it on purpose: WF3 reads before it writes, and a
// caller that wanted only the analysis never mints a version.
//
// The route is re-decided HERE from product state, not taken from the caller. WF1 records the
// decision, but a workflow could still post a first document at this endpoint — and a delta
// against a PRD nobody approved is a delta against nothing. `applyDelta` refuses a
// non-approved baseline for the same reason.
route('POST', '/internal/apply-delta', async (req, res) => {
  if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });
  const body = await readJson(req);

  const owned = assertDeltaUnowned(body?.payload ?? {});
  if (owned.length) {
    return json(res, 400, {
      status: 'error',
      reason: 'schema_invalid',
      missing: owned,
      detail: 'the model set a field code owns; the delta is refused rather than cleaned up',
    });
  }

  const out = applyDelta({
    prd_version_id: Number(body?.prd_version_id),
    doc_id: body?.doc_id,
    payload: body?.payload ?? {},
  });
  // A park is not an error: `delta_empty` means the document said nothing about this PRD,
  // which is a legitimate outcome with a reason, not a failure to process (contracts §3).
  const code = out.status === 'ok' ? 200 : out.status === 'needs_review' ? 200 : 400;

  // THE ENVELOPE, because WF1 now hands this answer straight back to whoever knocked on the
  // door. Until E6-S2 wired the fork, WF3's reply was read only by a human watching an
  // execution; now a follow-up document and a first document come back through the SAME door,
  // and a caller that has to tell WF2's envelope from WF3's bare object is a caller who will
  // eventually read the wrong field.
  const { status, ...payload } = out;
  const src = get('SELECT product_id, trace_id FROM source_documents WHERE doc_id = ?', [body?.doc_id]);
  return json(res, code, envelope({
    product_id: src?.product_id ?? null,
    doc_id: body?.doc_id ?? null,
    trace_id: src?.trace_id ?? null,
    component: 'delta',
    status,
    payload,
  }));
});

// --- WF6, the judge sweep: a second opinion that gates nothing (E7-S5) --------------------------
//
// Three calls, and the order is the guarantee. OPENING draws the sample and takes the lock in
// one operation, so two sweeps cannot sample the same rows; SCORES may only be written into a
// sweep that is still in flight; CLOSING says whether an opinion arrived at all, and a sweep
// that got none closes `skipped` with a reason rather than looking like a quiet week.
//
// Nothing in this section is read by a gate. `verify-judge-isolation.mjs` proves that from a
// derived file list rather than from this comment.

route('POST', '/internal/judge-sweep/open', async (req, res) => {
  if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });
  const body = await readJson(req);
  const out = openSweep({ trigger_source: body?.trigger_source });
  // 409, not 200-with-an-error: a refused manual trigger is a REFUSAL, and a caller that
  // ignores the status code still gets `status: 'error'` and a reason from the closed set.
  const code = out.status === 'ok' ? 200 : (out.reason === 'sweep_in_flight' ? 409 : 400);
  return json(res, code, out);
});

route('POST', '/internal/judge-scores', async (req, res) => {
  if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });
  const body = await readJson(req);
  const out = recordScores(Number(body?.sweep_id), body?.scores ?? []);
  return json(res, out.status === 'ok' ? 200 : 400, out);
});

route('POST', '/internal/judge-sweep/close', async (req, res) => {
  if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });
  const body = await readJson(req);
  const out = closeSweep({
    sweep_id: Number(body?.sweep_id),
    status: body?.sweep_status ?? body?.status ?? 'complete',
    skipped_reason: body?.skipped_reason ?? null,
    skipped_detail: body?.skipped_detail ?? null,
    rubric_version: body?.rubric_version ?? null,
    judge_model: body?.judge_model ?? null,
  });
  return json(res, out.status === 'ok' ? 200 : 400, out);
});

// The read side. It says out loud what it is, because a judge figure read without its sample
// size and its independence is the figure this whole story exists to avoid printing.
route('GET', '/api/judge', (req, res) => json(res, 200, {
  gates: 'none — no case, threshold, metric or report figure reads any of this (E7-S5)',
  judge_model: JUDGE_MODEL,
  rubric_version: rubricVersion(),
  unjudged_remaining: unjudgedRemaining(),
  // PER STRATUM (E7-S6), because one corpus-wide percentage stopped describing anything once
  // 1.5% of the corpus became 20% of the sample. "6,758 never judged" is true and says
  // nothing about whether the defensive clause has ever been exercised on a real row.
  coverage_by_stratum: coverageByStratum(),
  sweeps: sweeps(20).map((s) => sweepSummary(s.sweep_id)),
}));

// --- WF5, the owner's weekly report ------------------------------------------------------------
//
// Two calls, and the split is the point. The FIGURES are computed here and are the report; the
// narrative is fetched separately by WF5 through WF0 and is a courtesy. If the second call
// never happens, or returns something carrying a number, the first one still produced a
// complete report (docs/reporting.md rule 2).

route('GET', '/internal/weekly-figures', (req, res) => {
  // Guarded like the other thirteen (BUG-051). It was not, for as long as it has existed, and
  // nothing noticed until a check derived the guard from server.js and refused to knock on the
  // two routes that lacked it.
  if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });
  const week = new URL(req.url, 'http://localhost').searchParams.get('week') ?? undefined;
  const figures = weekFigures(week);
  // What the narrative call is allowed to see: labels and shapes, never the source documents,
  // and the numbers only so it can be told NOT to repeat them.
  json(res, 200, {
    week: figures.bounds.start,
    approved: figures.approved,
    approved_prior: figures.approvedPrior,
    caveats: caveatsFor(figures).map((c) => ({ id: c.id, text: c.text })),
    metrics: Object.values(figures.now).map((m) => ({
      id: m.id, name: m.name, value: m.value, unit: m.unit,
    })),
    prior: Object.values(figures.prior).map((m) => ({ id: m.id, value: m.value })),
  });
});

route('POST', '/internal/weekly-report', async (req, res) => {
  // BEFORE readJson, and before anything is written (BUG-051). This endpoint WRITES A FILE, and
  // it did so for an unauthenticated caller — the first version of check-internal-endpoints
  // POSTed to every path it found and produced a weekly report while auditing.
  if (!internalAuthorized(req)) return json(res, 401, { status: 'error', reason: 'unauthorized' });
  const body = await readJson(req);
  const week = body?.week;
  // The commentary is OPTIONAL and untrusted. Absent, malformed, or carrying a figure, the
  // report is written either way and says which happened.
  const { figures, caveats, vet, body: markdown } = buildReport({
    week, commentary: body?.commentary,
  });
  const path = writeReport(week, markdown);
  json(res, 200, {
    status: 'ok',
    payload: {
      week: figures.bounds.start,
      path: path.replace(/\\/g, '/').split('/').slice(-2).join('/'),
      caveats: caveats.map((c) => c.id),
      narrative: vet.ok ? 'included' : NARRATIVE_UNAVAILABLE,
      narrative_refused_because: vet.ok ? null : (vet.reason ?? null),
      figures_refused: vet.violations.map((v) => v.kind),
      bytes: markdown.length,
    },
  });
});

route('GET', '/api/prd-versions', (req, res) => json(res, 200, {
  versions: all(`SELECT v.prd_version_id, v.prd_id, v.version_no, v.state, v.trace_id,
                        v.park_reason, v.degraded, v.created_at, v.approved_at,
                        (SELECT COUNT(*) FROM requirements r WHERE r.prd_version_id=v.prd_version_id) AS requirements,
                        (SELECT COUNT(*) FROM requirements r WHERE r.prd_version_id=v.prd_version_id AND r.grounded=1) AS grounded
                 FROM prd_versions v ORDER BY v.prd_version_id DESC`),
}));

route('GET', '/api/prd-versions/:id', (req, res, { id }) => {
  const v = getVersion(Number(id));
  return v ? json(res, 200, v)
    : json(res, 404, { status: 'error', reason: 'unknown_version', missing: [id], detail: 'no such version' });
});

// The PRDs themselves, for a picker. Ordered by how much chain there is to look at, because a
// history page opened on a PRD with one version teaches nothing.
route('GET', '/api/prds', (req, res) => json(res, 200, {
  prds: all(`SELECT p.prd_id, p.product_id,
                    COUNT(v.prd_version_id) AS versions,
                    SUM(v.state='approved')   AS approved,
                    SUM(v.state='superseded') AS superseded,
                    MAX(v.approved_at)        AS last_approved_at,
                    (SELECT COUNT(*) FROM prd_changes c
                      JOIN prd_versions vv ON vv.prd_version_id=c.prd_version_id
                     WHERE vv.prd_id=p.prd_id) AS changes
               FROM prds p LEFT JOIN prd_versions v ON v.prd_id=p.prd_id
              GROUP BY p.prd_id
              ORDER BY changes DESC, versions DESC, p.prd_id`),
}));

// THE VERSION CHAIN (E6-S3). What a sponsor asks for when they say "the PRD changed": every
// version of one PRD, its state, when it was approved, and what changed since the version it
// was derived from — read from `prd_changes`, never diffed out of the text.
route('GET', '/api/prds/:prd_id/history', (req, res, { prd_id }) => {
  const h = versionHistory(prd_id);
  return h ? json(res, 200, h)
    : json(res, 404, { status: 'error', reason: 'unknown_prd', missing: [prd_id], detail: 'no such PRD' });
});


// --- the review gate (E4) -----------------------------------------------------
//
// Everything below computes from rows at the moment it is asked. No readiness flag is stored
// and no summary is cached: derived state goes stale, and the stale one here would be the
// flag that lets a half-reviewed document through (docs/contracts.md §4).

/** One open session per version, reused. A second session would split the action history. */
function openSession(versionId) {
  const existing = get(
    'SELECT session_id FROM review_sessions WHERE prd_version_id=? AND signed_off_at IS NULL ORDER BY session_id DESC LIMIT 1',
    [versionId]);
  if (existing) return existing.session_id;
  return Number(run('INSERT INTO review_sessions (prd_version_id, reviewer) VALUES (?,?)',
    [versionId, 'local-operator']).lastInsertRowid);
}

// Everything one screen needs, in one call, all of it derived.
route('GET', '/api/prd-versions/:id/review', (req, res, { id }) => {
  const versionId = Number(id);
  const v = getVersion(versionId);
  if (!v) return json(res, 404, { status: 'error', reason: 'unknown_version', missing: [id], detail: 'no such version' });

  const items = decidableItems(versionId);
  const { latest } = decisions(versionId);
  const decided = Object.fromEntries([...latest.entries()].map(([k, d]) => [k, d]));

  const features = all(
    `SELECT f.feature_id, f.epic_id, f.title, f.req_ids, f.priority_score,
            p.reach, p.impact, p.confidence, p.effort, p.rationale
     FROM features f LEFT JOIN priority_factors p ON p.feature_id = f.feature_id
     WHERE f.prd_version_id=? ORDER BY f.priority_score DESC NULLS LAST, f.feature_id`,
    [versionId]).map((f) => ({ ...f, req_ids: JSON.parse(f.req_ids ?? '[]') }));

  return json(res, 200, {
    version: {
      prd_version_id: versionId, prd_id: v.prd_id, version_no: v.version_no,
      state: v.state, park_reason: v.park_reason, degraded: Boolean(v.degraded),
      trace_id: v.trace_id, created_at: v.created_at,
    },
    // Requirements carry their citations AND the offsets the grounding check rewrote — never
    // the model's originals (ADR 0003).
    requirements: all(
      `SELECT req_id, doc_id, kind, statement, subject, stakeholder, confidence, grounded, pm_authored
       FROM requirements WHERE prd_version_id=? ORDER BY req_id`, [versionId])
      .map((r) => ({
        ...r,
        grounded: Boolean(r.grounded),
        pm_authored: Boolean(r.pm_authored),
        citations: all(
          'SELECT quote, start_char, end_char, match_kind FROM citations WHERE req_id=? ORDER BY citation_id',
          [r.req_id]),
      })),
    epics: all('SELECT epic_id, title, summary FROM epics WHERE prd_version_id=? ORDER BY epic_id', [versionId]),
    features,
    stories: all(
      'SELECT story_id, feature_id, as_a, i_want, so_that, acceptance_criteria FROM stories WHERE prd_version_id=? ORDER BY story_id',
      [versionId]).map((st) => ({ ...st, acceptance_criteria: JSON.parse(st.acceptance_criteria ?? '[]') })),
    open_questions: all(
      'SELECT question_id, kind, question, citations FROM open_questions WHERE prd_version_id=? ORDER BY question_id',
      [versionId]).map((q) => ({ ...q, citations: JSON.parse(q.citations ?? '[]') })),
    unsettled_positions: (v.content?.unsettled_positions ?? []),
    documents: all(
      // spine-ok: read back for the review screen, which shows a human what they are reading
      `SELECT DISTINCT d.doc_id, d.title, d.doc_type, d.authorship
       FROM source_documents d JOIN requirements r ON r.doc_id = d.doc_id
       WHERE r.prd_version_id=?`, [versionId]),
    decidable: items,
    decisions: decided,
    readiness: readiness(versionId),
    figures: figures(versionId),
    caveats: caveats(versionId),
    trend: trend(versionId),
  });
});

// One decision, one row, append-only.
route('POST', '/api/prd-versions/:id/decisions', async (req, res, { id }) => {
  const versionId = Number(id);
  const v = get('SELECT state FROM prd_versions WHERE prd_version_id=?', [versionId]);
  if (!v) return json(res, 404, { status: 'error', reason: 'unknown_version', missing: [id], detail: 'no such version' });
  if (v.state !== 'in_review') {
    return json(res, 409, { status: 'error', reason: 'not_in_review', detail: `version is '${v.state}'` });
  }

  const body = await readJson(req);
  const { item_type, item_id, decision, reason = null, after_text = null } = body;

  if (!['requirement', 'story', 'feature', 'open_question'].includes(item_type)) {
    return json(res, 400, { status: 'error', reason: 'schema_invalid', missing: [`item_type=${item_type}`] });
  }
  if (!['approve', 'reject', 'edit', 'approve_ungrounded'].includes(decision)) {
    return json(res, 400, { status: 'error', reason: 'schema_invalid', missing: [`decision=${decision}`] });
  }

  // The item must belong to THIS version. Without this, a decision on another version's item
  // would count toward this one's readiness and nobody would ever see it.
  const table = { requirement: 'requirements', story: 'stories', feature: 'features', open_question: 'open_questions' }[item_type];
  const key = { requirement: 'req_id', story: 'story_id', feature: 'feature_id', open_question: 'question_id' }[item_type];
  const item = get(`SELECT * FROM ${table} WHERE ${key}=? AND prd_version_id=?`, [item_id, versionId]);
  if (!item) {
    return json(res, 400, { status: 'error', reason: 'schema_invalid', missing: [`${item_type}=${item_id} is not on version ${versionId}`] });
  }

  // E4-S4. An UNGROUNDED requirement cannot be approved through the plain path. The distinct
  // decision is what makes the override countable, and a count that could be reached two ways
  // is not a count.
  if (item_type === 'requirement' && decision === 'approve' && !item.grounded) {
    return json(res, 409, {
      status: 'error', reason: 'ungrounded_requires_override',
      detail: `${item_id} could not be verified against its source. Approving it uses `
        + "'approve_ungrounded' and requires a reason, so the record says a person decided to trust it.",
    });
  }

  const before_text = item_type === 'requirement' ? item.statement
    : item_type === 'story' ? item.i_want
      : item_type === 'feature' ? item.title : item.question;

  const sessionId = openSession(versionId);
  try {
    run(`INSERT INTO review_actions (session_id, item_type, item_id, decision, reason, before_text, after_text)
         VALUES (?,?,?,?,?,?,?)`,
      [sessionId, item_type, item_id, decision, reason, before_text, after_text]);
  } catch (err) {
    // The reason requirement is a TRIGGER, not a form rule: it holds on every channel that
    // accepts a decision (docs/reporting.md rule 4).
    return json(res, 409, { status: 'error', reason: 'reason_required', detail: err.message });
  }

  // An edit rewrites the statement, marks it pm_authored, and takes it out of M1 entirely —
  // the grounding rate can never be improved by editing (decided 2026-09-01). The citations
  // stay, marked as coming from the original extraction.
  if (decision === 'edit' && item_type === 'requirement' && after_text) {
    run('UPDATE requirements SET statement=?, pm_authored=1 WHERE req_id=?', [after_text, item_id]);
  }

  return json(res, 200, {
    status: 'ok',
    session_id: sessionId,
    readiness: readiness(versionId),
    figures: figures(versionId),
  });
});

// THE HUMAN GATE. The only code path that may set state='approved' (ADR 0006).
//
// Readiness is recomputed here, server-side. A disabled button in the browser is a
// courtesy; this recomputation and the database trigger are the gate.
route('POST', '/api/prd-versions/:id/sign-off', async (req, res, { id }) => {
  const versionId = Number(id);
  const v = get('SELECT prd_version_id, state, trace_id FROM prd_versions WHERE prd_version_id=?', [versionId]);
  if (!v) return json(res, 404, { status: 'error', reason: 'unknown_version', missing: [id], detail: 'no such version' });

  if (v.state !== 'in_review') {
    return json(res, 409, {
      status: 'error', reason: 'not_in_review',
      detail: `version ${versionId} is '${v.state}'; only 'in_review' can be signed off`,
    });
  }

  const reqs = all('SELECT grounded FROM requirements WHERE prd_version_id=?', [versionId]);
  if (!reqs.length) {
    return json(res, 409, { status: 'error', reason: 'grounding_below_floor', missing: ['requirements'] });
  }

  // E4-S3. Readiness is RECOMPUTED HERE, from the rows, at the moment of sign-off — for a
  // caller who never loaded the page. The disabled button in the browser is a courtesy and
  // is documented as one; this is the check, and the trigger behind it is the guarantee.
  const gate = readiness(versionId);
  if (!gate.ready) {
    return json(res, 409, {
      status: 'error',
      reason: gate.empty ? 'nothing_to_review' : 'items_undecided',
      detail: gate.empty
        ? `version ${versionId} has no requirements or stories to decide`
        : `${gate.undecided.length} of ${gate.total} items have no decision`,
      missing: gate.undecided.map((u) => `${u.item_type}:${u.item_id}`).slice(0, 20),
    });
  }

  let outcome;
  try {
    outcome = signOff(versionId);
  } catch (err) {
    return json(res, 409, { status: 'error', reason: 'signoff_refused', detail: err.message });
  }

  // What the approval did to the versions BEFORE it, recorded where a reader looks for what
  // happened rather than inferred later from two states (E6-S3). Telemetry, so it never
  // decides anything — but a supersede that leaves no trace is a state change nobody can date.
  if (outcome.superseded) {
    logEvent(v.trace_id, 'superseded', 'review',
      `${outcome.superseded} version(s) of ${outcome.prd_id} superseded by ${versionId}`);
  }

  // No authentication exists: the reviewer is hardcoded, and that is recorded honestly
  // rather than simulated (docs/assumptions.md, biggest gap).
  //
  // THE SIGNATURE GOES ON THE SESSION THAT DID THE WORK. This used to INSERT a fresh session
  // row, which left every decision in one session and the signature in another — so "who
  // approved this, having decided what?" could not be answered from the rows, and the
  // action history was split from the moment it mattered. Found by verify-review-gate.mjs
  // asserting there was exactly one session.
  const openId = get(
    'SELECT session_id FROM review_sessions WHERE prd_version_id=? AND signed_off_at IS NULL ORDER BY session_id DESC LIMIT 1',
    [versionId])?.session_id;
  const sessionId = openId ?? Number(run(
    'INSERT INTO review_sessions (prd_version_id, reviewer) VALUES (?,?)',
    [versionId, 'local-operator']).lastInsertRowid);
  run('UPDATE review_sessions SET signed_off_at=? WHERE session_id=?',
    [new Date().toISOString(), sessionId]);

  logEvent(v.trace_id, 'approved', 'review_ui', `prd_version_id=${versionId}`);

  return json(res, 200, {
    status: 'ok',
    prd_version_id: versionId,
    state: 'approved',
    session_id: Number(sessionId),
    // Counted separately, never blended into approvals (docs/reporting.md).
    ungrounded_in_version: reqs.filter((r) => !r.grounded).length,
    overrides_used: figures(versionId).approved_ungrounded,
  });
});

route('GET', '/api/documents', (req, res) => json(res, 200, {
  // spine-ok: the inbox listing — the operator is exactly who these were recorded for
  documents: all(`SELECT doc_id, product_id, trace_id, doc_type, title, received_at,
                         source_channel, length(raw_text) AS chars, created_at  -- spine-ok: same listing, same reason
                  FROM source_documents ORDER BY created_at DESC, doc_id DESC`),
}));

route('GET', '/api/documents/:docId', (req, res, { docId }) => {
  const doc = getDocument(docId);
  return doc
    ? json(res, 200, doc)
    : json(res, 404, { status: 'error', reason: 'unknown_document', missing: [docId], detail: 'no such document' });
});

// --- server ------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const params = match(r.pattern, pathname);
    if (params) {
      try {
        return await r.handler(req, res, params);
      } catch (err) {
        // Bad input is a 400 with a contract-shaped reason, not a 500. A 500 says "we
        // broke"; a malformed body means the caller did, and the caller needs a
        // machine-readable reason to act on (docs/contracts.md §1).
        if (err.reason) {
          console.warn(`[400] ${req.method} ${pathname}: ${err.reason}`);
          return json(res, 400, { status: 'error', reason: err.reason, missing: err.missing ?? [] });
        }
        console.error(`[500] ${req.method} ${pathname}: ${err.message}`);
        return json(res, 500, { status: 'error', reason: 'internal_error', detail: err.message });
      }
    }
  }
  if (req.method === 'GET') return serveStatic(req, res, pathname);
  json(res, 404, { status: 'error', reason: 'unknown_route', detail: 'no such route' });
});

// ALREADY RUNNING IS NOT AN ERROR, AND MUST NOT LOOK LIKE ONE (BUG-074).
//
// The most likely reason this port is taken is that the service is ALREADY UP — most often
// because the operator started it earlier and left it running, which is exactly what the run
// sheet tells them to do. Node's default response to that is an unhandled 'error' event: a
// fifteen-line stack trace, a hex errno and the words "Unhandled 'error' event", at step 2 of
// the setup for a recording.
//
// So this asks the port what is there before it says anything. If it is this service, that is a
// success and it says so; if it is something else, that is a real conflict and it says which.
// Neither answer is a stack trace.
server.on('error', async (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  let mine = null;
  try {
    const res = await fetch(`http://localhost:${PORT}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    const body = await res.json();
    if (body?.status === 'ok') mine = body;
  } catch { /* not ours, or not answering: handled below */ }

  console.log('');
  if (mine) {
    console.log(`The review service is ALREADY RUNNING on http://localhost:${PORT}. Nothing to do.`);
    console.log(`  schema version ${mine.schema_version} | ${mine.db_path}`);
    console.log('');
    console.log('  This is not an error. You started it earlier and left it running, which is');
    console.log('  what you are supposed to do. Leave that window alone and go to the next step.');
    console.log('');
    // Zero, deliberately. "The service is up" is the state the caller wanted, and a non-zero
    // exit here would make demo-readiness and every wrapper report a failure that is not one.
    process.exit(0);
  }
  console.error(`Port ${PORT} is taken by something that is NOT this service.`);
  console.error('');
  console.error('  It did not answer /api/health, so starting here would fight it for the port.');
  console.error('  Find out what it is, in PowerShell:');
  console.error(`      netstat -ano | findstr ":${PORT}"`);
  console.error('      tasklist /FI "PID eq <the number at the end of that line>"');
  console.error('');
  console.error('  Then either stop it, or run this service on another port:');
  console.error(`      $env:SERVICE_PORT=3001; .\\run.cmd review-ui/server.js`);
  console.error('  If you change the port, SERVICE_BASE_URL in .env has to change with it or');
  console.error('  n8n will call back to the wrong place.');
  console.error('');
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`PRD Genie review service on http://localhost:${PORT}`);
  // ASCII only in console output: the Windows console mangles non-ASCII (seen in E1-S1).
  console.log(`  schema version ${schemaVersion()} | ${DB_PATH}`);
  console.log(`  n8n in Docker reaches this at http://host.docker.internal:${PORT}`);
});
