// A stand-in for the provider, so failures can be forced AT THE PROVIDER BOUNDARY.
//
// E7-S4 asks for a real timeout and a real malformed response, and asks for them without
// "editing the workflow into an unrealistic shape". So nothing about WF0 changes except the
// address it dials: `Build request`, the retry, `Parse or park`, the classifier, the park and
// the version row all run exactly as they do in production. The only difference is which
// process answers.
//
// It answers the OpenAI chat-completions shape and nothing else. It has no credentials, makes
// no outbound request of any kind, and never logs a header — the real Authorization header
// arrives here during a drill and must leave no trace.
//
// Modes, switched live so the drill does not have to restart n8n between them:
//
//   ok         a minimal valid response (the control: prove the stub itself is not the fault)
//   timeout    accept the connection and never answer — n8n's 60s timeout, twice
//   malformed  HTTP 200, OpenAI-shaped, whose `content` is not JSON
//   malformed_then_ok  the first ask is unparseable and every later one parses — the case
//              WF0 retry exists for, and the only way to see attempt 2 SUCCEED (E2-S4)
//   error      HTTP 500 with an error body
//
//   POST /__mode {"mode":"timeout"}   switch
//   GET  /__mode                      what it is now, and what it has served
//
// Usage:  .\run.cmd review-ui/scripts/fake-provider.mjs [port]
//         Started and stopped by drill-provider-failures.mjs; runnable by hand for a demo.

import { createServer } from 'node:http';

const PORT = Number(process.argv[2] ?? process.env.FAKE_PROVIDER_PORT ?? 3999);
const MODES = ['ok', 'timeout', 'malformed', 'error', 'no_credit', 'malformed_then_ok'];

let mode = 'ok';
// Requests served SINCE THE MODE WAS SET. `malformed_then_ok` means the first ask of this
// mode, not the first ask of the process — a drill that runs the same round twice must get
// the same answer both times (BUG-021).
let sinceMode = 0;
const served = [];
const held = new Set();

const readBody = async (req) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
};

const json = (res, status, body) => {
  const s = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(s);
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/__mode') {
    if (req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}');
      if (!MODES.includes(body.mode)) return json(res, 400, { error: `mode must be one of ${MODES}` });
      mode = body.mode;
      sinceMode = 0;
      // Anything being held open when the mode changes is released, so a switch cannot leave
      // the previous drill's socket hanging into the next one.
      for (const r of held) { try { r.destroy(); } catch { /* already gone */ } }
      held.clear();
      return json(res, 200, { mode });
    }
    return json(res, 200, { mode, served });
  }

  if (url.pathname === '/__health') return json(res, 200, { ok: true, mode });

  // Everything else is treated as the completions endpoint.
  await readBody(req);
  served.push({ at: new Date().toISOString(), mode, path: url.pathname });
  sinceMode++;

  if (mode === 'timeout') {
    // Accepted, and never answered. This is a real client-side timeout, which is what the
    // classifier has to recognise — not an HTTP 408, which would be the easy version.
    held.add(res);
    return undefined;
  }

  if (mode === 'error') {
    return json(res, 500, { error: { message: 'the model is overloaded', type: 'server_error' } });
  }

  if (mode === 'no_credit') {
    // OpenAI's REAL body for an exhausted balance, verbatim from the outage of 2026-09-03
    // (BUG-036): a 429 whose message never says "rate limit" or "quota" in the words the
    // classifier used to look for. Filed here so the drill injects the condition that actually
    // happened, not a tidier version of it.
    return json(res, 429, { error: {
      message: 'You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.',
      type: 'insufficient_quota',
      param: null,
      code: 'insufficient_quota',
    } });
  }

  // The first ask of this mode is unparseable and the rest are fine, so a drill can watch a
  // retry recover instead of merely happening. `served` already counts every request.
  const badFirst = mode === 'malformed_then_ok' && sinceMode === 1;

  const content = (mode === 'malformed' || badFirst)
    // OpenAI-shaped, 200, and the content is prose where JSON was required. This is the
    // failure `Parse or park` exists for, and it is NOT an HTTP failure — so the NODE's retry
    // never fires. Since E2-S4 the WORKFLOW retries it once, and both attempts write a row.
    ? 'Certainly! Here are the requirements I found in the document: first, the dashboard...'
    : JSON.stringify({ document_subject: 'a stand-in', concerns_product: false, requirements: [], unsettled_positions: [] });

  return json(res, 200, {
    id: 'chatcmpl-fake',
    object: 'chat.completion',
    model: 'gpt-4.1-mini',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
});

// Never let a held request be closed by a server-side idle timeout: the point is that the
// client gives up first.
server.requestTimeout = 0;
server.headersTimeout = 0;
server.timeout = 0;

server.listen(PORT, () => {
  console.log(`fake provider on http://localhost:${PORT}  mode=${mode}`);
  console.log('It has no credentials, makes no outbound request, and logs no headers.');
});
