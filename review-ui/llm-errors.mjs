// What actually went wrong at the provider (BUG-011).
//
// WF0 mapped every provider failure that was not a context-length error to `llm_timeout`.
// A 401, a missing credential, a revoked key, a rate limit and an actual timeout were all
// recorded identically — and on 2026-09-02, when the OpenAI credential really was missing
// after the Docker reset, the record said `llm_timeout` and sent the reader to look at
// latency, network and n8n's timeout setting. None of those was the problem.
//
// `docs/contracts.md` §1 keeps reason codes as a CLOSED SET precisely so a reason is
// diagnostic rather than decorative. The fix is therefore not "add two codes" — it is
// **removing the default that lies**. Anything unrecognised is now `llm_error`, which says
// "the provider failed and this system does not know how", and that is a true sentence.
//
// THE COPY IN WF0. This function also exists, character for character, inside WF0's
// "Parse or park" node, because a Code node cannot import. `verify-degradation.mjs` runs
// BOTH copies over the same table of cases and fails when they disagree — the same
// arrangement that keeps the NFR checklist in the prompt and in `gaps.mjs` in step. Two
// copies kept in step by memory is a drift waiting to happen; two copies with a test
// between them is a fact.

/**
 * The provider-failure codes this module can return. All are in the closed set in
 * `docs/contracts.md` §1 and in `assemble.mjs`'s REASONS.
 */
export const PROVIDER_REASONS = Object.freeze([
  'llm_malformed_json',
  'llm_unauthorized',
  'llm_rate_limited',
  'llm_timeout',
  'llm_no_credit',
  'llm_error',
]);

// >>> BEGIN SHARED WITH WF0 — keep byte-identical, verify-degradation.mjs checks behaviour
function classifyProviderError(err) {
  const status = Number(err?.status ?? err?.httpCode ?? err?.response?.status ?? 0);
  const code = String(err?.code ?? '');
  const message = String(err?.message ?? '');
  const text = `${code} ${message}`.toLowerCase();

  // Ordered, and the order is load-bearing: a 401 whose message happens to contain the
  // word "timeout" is an auth failure, not a timeout.
  if (code === 'context_length_exceeded') return 'llm_malformed_json';
  if (status === 401 || status === 403
    || /unauthor|forbidden|invalid[_ ]api[_ ]key|api key|credential|authenticat/.test(text)) {
    return 'llm_unauthorized';
  }
  // An exhausted BALANCE is not rate limiting. It arrives as a 429 with an
  // `insufficient_quota` code, so it must be matched before the rate-limit clause or it
  // borrows a code that means "wait, it will pass" — and this one never passes on its own.
  // Found by a real outage rather than a drill (BUG-036).
  if (/insufficient[_ ]quota|no credits|credit balance|billing|exceeded your current quota|add credits/.test(text)) {
    return 'llm_no_credit';
  }
  if (status === 429 || /rate[_ ]limit|too many requests|quota/.test(text)) return 'llm_rate_limited';
  if (status === 408
    || /timeout|timed out|etimedout|esockettimedout|econnaborted/.test(text)
    || /connection was aborted/.test(text)) {
    return 'llm_timeout';
  }
  return 'llm_error';
}
// <<< END SHARED WITH WF0

export { classifyProviderError };
