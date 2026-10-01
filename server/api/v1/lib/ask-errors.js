'use strict';

// Fixed public categories only. Never forward an upstream message or body.
const failures = {
  verification: { code: 'ask-verification', status: 403, type: 'access-denied', detail: 'Verification expired or failed. Retry verification, then send your question again.' },
  source: { code: 'ask-source', status: 503, type: 'upstream-error', detail: 'The source data could not be read. Your analysis is still available; try again shortly.' },
  provider: { code: 'ask-provider', status: 503, type: 'upstream-error', detail: 'The AI provider is temporarily unavailable. Starter charts remain available.' },
  answer: { code: 'ask-answer', status: 503, type: 'upstream-error', detail: 'Ask could not validate the answer. Try a more specific question or open the source chart.' },
  timeout: { code: 'ask-timeout', status: 504, type: 'upstream-timeout', detail: 'The request took too long. Try a shorter period or a more specific question.' },
  quota: { code: 'ask-quota', status: 429, type: 'rate-limited', detail: 'Ask has reached its allowance. Please try later; starter charts remain available.' },
  unavailable: { code: 'ask-unavailable', status: 503, type: 'upstream-error', detail: 'Ask is temporarily unavailable. Starter charts remain available.' },
};
function askError(kind) { const error = new Error('Ask operation failed'); error.askKind = kind; return error; }
function classifyFailure(error) {
  const kind = error?.quota ? 'quota' : ['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : Object.hasOwn(failures, error?.askKind) ? error.askKind : 'unavailable';
  return failures[kind];
}
async function askStage(kind, operation) {
  try { return await operation(); } catch (error) {
    if (error?.quota || error?.askKind || ['TimeoutError', 'AbortError'].includes(error?.name)) throw error;
    throw askError(kind);
  }
}
module.exports = { askError, askStage, classifyFailure };
