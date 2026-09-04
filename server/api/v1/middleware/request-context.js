/**
 * server/api/v1/middleware/request-context.js
 *
 * Attaches `req.v1 = { requestId, network, startedAt, indexedHeight }` to
 * every /v1 request and echoes X-Request-Id on the response, so every
 * downstream adapter/envelope call has consistent metadata without
 * re-deriving it. indexedHeight is resolved lazily (see resolveIndexedHeight)
 * because not every route needs it and it costs one internal dispatch.
 */

const { newRequestId } = require('../lib/envelope');

function createRequestContext(config, internalClient) {
  let cachedIndexedHeight = null;
  let cachedAt = 0;
  const CACHE_MS = 5_000;

  return function requestContext(req, res, next) {
    const requestId = req.headers['x-request-id']?.toString().slice(0, 100) || newRequestId();
    req.v1 = {
      requestId,
      network: config.network,
      startedAt: Date.now(),
      indexedHeight: null,
      warnings: [],
    };
    res.set('X-Request-Id', requestId);

    // Lazily resolves and memoizes the current indexer tip height for this
    // request by asking the legacy /api/info endpoint. Cheap (cached
    // upstream) and best-effort: on failure we leave indexedHeight null
    // rather than fabricating a value or failing the whole request, since
    // most /v1 endpoints remain useful without it.
    req.v1.resolveIndexedHeight = async () => {
      if (req.v1.indexedHeight !== null) return req.v1.indexedHeight;
      if (cachedIndexedHeight !== null && Date.now() - cachedAt < CACHE_MS) {
        req.v1.indexedHeight = cachedIndexedHeight;
        return req.v1.indexedHeight;
      }
      try {
        const { ok, body } = await internalClient.dispatch('GET', '/api/info', { parentSignal: req.v1.abortSignal });
        if (ok && body && Number.isFinite(body.height)) {
          req.v1.indexedHeight = body.height;
          cachedIndexedHeight = body.height;
          cachedAt = Date.now();
        }
      } catch {
        // best-effort only
      }
      return req.v1.indexedHeight;
    };

    next();
  };
}

module.exports = { createRequestContext };
