/**
 * server/api/v1/lib/problem.js
 *
 * RFC 9457 ("Problem Details for HTTP APIs") error envelope.
 *
 * We intentionally keep `type` URIs stable and documented in the OpenAPI
 * spec (server/api/openapi/v1.yaml, #/components/schemas/Problem) rather
 * than pointing at a live docs host that may not exist yet.
 */

const PROBLEM_BASE = 'https://docs.cipherscan.app/errors';

/** Registry of known problem "type" slugs -> default title/status. */
const PROBLEM_TYPES = {
  'validation-error': { title: 'Validation Error', status: 400 },
  'not-found': { title: 'Resource Not Found', status: 404 },
  'not-migrated': { title: 'Endpoint Not Yet Available in v1', status: 501 },
  'feature-disabled': { title: 'API Version Not Enabled', status: 404 },
  'preview-auth-required': { title: 'Preview Access Required', status: 401 },
  'rate-limited': { title: 'Too Many Requests', status: 429 },
  'upstream-error': { title: 'Upstream Service Error', status: 502 },
  'upstream-timeout': { title: 'Upstream Service Timeout', status: 504 },
  'upstream-contract-mismatch': { title: 'Upstream Response Contract Mismatch', status: 502 },
  'internal-error': { title: 'Internal Server Error', status: 500 },
  'method-not-allowed': { title: 'Method Not Allowed', status: 405 },
  'excluded': { title: 'Endpoint Not Exposed in v1', status: 404 },
};

/**
 * Build an RFC 9457 problem document.
 *
 * @param {string} typeSlug - key into PROBLEM_TYPES
 * @param {object} [opts]
 * @param {string} [opts.detail] - human-readable explanation, safe to show externally
 * @param {string} [opts.instance] - request-scoped URI (we use the request path)
 * @param {number} [opts.status] - override default status
 * @param {string} [opts.title] - override default title
 * @param {Array<{field?:string, issue:string}>} [opts.errors] - field-level validation errors
 * @param {object} [opts.extra] - additional non-conflicting members (RFC 9457 allows extensions)
 */
function buildProblem(typeSlug, opts = {}) {
  const known = PROBLEM_TYPES[typeSlug] || PROBLEM_TYPES['internal-error'];
  const status = opts.status || known.status;
  const doc = {
    type: `${PROBLEM_BASE}/${typeSlug}`,
    title: opts.title || known.title,
    status,
  };
  if (opts.detail) doc.detail = opts.detail;
  if (opts.instance) doc.instance = opts.instance;
  if (opts.errors && opts.errors.length) doc.errors = opts.errors;
  if (opts.extra) Object.assign(doc, opts.extra);
  return doc;
}

/**
 * Send a problem+json response. Never leaks stack traces or raw upstream
 * bodies — callers must pass an already-sanitized `detail`.
 */
function sendProblem(res, typeSlug, opts = {}) {
  const doc = buildProblem(typeSlug, opts);
  res.status(doc.status);
  res.set('Content-Type', 'application/problem+json');
  res.json(doc);
  return doc;
}

module.exports = { PROBLEM_TYPES, PROBLEM_BASE, buildProblem, sendProblem };
