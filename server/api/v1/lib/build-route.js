/**
 * server/api/v1/lib/build-route.js
 *
 * Generic Express handler factory that turns one manifest entry into a
 * mounted /v1 route. This is the "adapter" — it never contains business
 * SQL; it only knows how to (a) optionally run v1-layer request validation,
 * (b) forward a request to the legacy endpoint via lib/internal-client.js
 * (a TRANSITIONAL loopback-proxy bridge — see that file's docblock and
 * README.md "Architecture status"; it is not the intended permanent
 * architecture), and (c) reshape whatever comes back into the standard
 * {data, meta} / RFC 9457 envelope, relaying only an allowlisted set of
 * transport/cache/quota headers (lib/headers.js) and adding a
 * Server-Timing entry for the internal hop.
 *
 * Response reshaping rules (documented here because they apply uniformly
 * across ~90 endpoints rather than being repeated per-route):
 *
 *   - shape: 'passthrough' (default)
 *       The legacy JSON body, minus a top-level `success` key, becomes
 *       `data` verbatim (object or array, whatever the legacy handler
 *       returned). If the legacy body signals an error (`success === false`,
 *       a top-level `error` string, or a non-2xx status), the SAME status
 *       code and the legacy `error` message are relayed as an RFC 9457
 *       problem — legacy error strings in this codebase are already
 *       written to be client-safe (no stack traces / no raw DB errors),
 *       so no additional sanitization is layered on top here.
 *
 *   - shape: 'list'
 *       `data` becomes the legacy `body[listKey]` array; `body[paginationKey]`
 *       is translated into `meta.page` using lib/cursor.js and the entry's
 *       `cursorMap`. The v1 request's own `cursor` query param (if any) is
 *       decoded and its fields are merged directly into the legacy request
 *       query string — see decodeCursor() below for why this requires no
 *       per-entry field mapping on the way in.
 *
 * Query-forwarding: every client query parameter is forwarded to the legacy
 * endpoint as-is (legacy handlers already parse/clamp/validate their own
 * query params defensively — see e.g. blocks.js `Math.min(Math.max(...))`
 * patterns). This keeps the vast majority of manifest entries free of
 * bespoke allowlists. Endpoints that need STRICTER-than-legacy validation
 * (currently: the two scan endpoints — see lib/scan-validation.js) opt in
 * via `entry.v1.validateKey`, run BEFORE any legacy dispatch happens.
 * KNOWN CAVEAT (documented in README.md): a future hardening pass should
 * add explicit per-route query schemas at the v1 layer itself instead of
 * relying entirely on legacy-side validation for the rest of the surface.
 */

const { sendProblem } = require('./problem');
const { sendSuccess } = require('./envelope');
const { applyZatoshiFields } = require('./zatoshi');
const { decodeCursor, buildPageMeta } = require('./cursor');
const { UpstreamTimeoutError, UpstreamError } = require('./internal-client');
const { applyRelayedHeaders, addServerTiming } = require('./headers');
const { VALIDATORS } = require('./scan-validation');
const { logSafeError } = require('../../lib/safe-log');

function fillLegacyPath(template, params) {
  return template.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`build-route: missing path param "${name}" for template "${template}"`);
    }
    return encodeURIComponent(value);
  });
}

/** Applies entry.zatoshiFields (item-relative) to a single object or to every item of an array. */
function applyZatoshiToData(data, fieldPaths) {
  if (!fieldPaths || !fieldPaths.length) return { value: data, warnings: [] };
  if (Array.isArray(data)) {
    const warnings = [];
    const value = data.map((item) => {
      const result = applyZatoshiFields(item, fieldPaths);
      warnings.push(...result.warnings);
      return result.value;
    });
    return { value, warnings };
  }
  return applyZatoshiFields(data, fieldPaths);
}

function isErrorBody(status, body) {
  if (status >= 400) return true;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    if (body.success === false) return true;
    if (typeof body.error === 'string') return true;
  }
  return false;
}

function relayLegacyError(res, req, status, body, dispatchResult) {
  applyRelayedHeaders(res, dispatchResult?.headers);
  addServerTiming(res, dispatchResult?.timingMs);
  const detail = (body && typeof body === 'object' && typeof body.error === 'string')
    ? body.error
    : 'The upstream endpoint reported an error.';
  const typeSlug = status === 404 ? 'not-found' : status === 429 ? 'rate-limited' : status >= 400 && status < 500 ? 'validation-error' : 'upstream-error';
  sendProblem(res, typeSlug, { status, detail, instance: req.originalUrl });
}

function handleDispatchError(res, req, err) {
  addServerTiming(res, err?.timingMs);
  if (err instanceof UpstreamTimeoutError) {
    sendProblem(res, 'upstream-timeout', { detail: 'The upstream endpoint took too long to respond.', instance: req.originalUrl });
    return;
  }
  if (err instanceof UpstreamError) {
    sendProblem(res, 'upstream-error', { detail: 'The upstream endpoint could not be reached.', instance: req.originalUrl });
    return;
  }
  // Unexpected — never leak err.message (could contain internal paths/URLs).
  logSafeError('[v1] adapter error:', err);
  sendProblem(res, 'internal-error', { detail: 'Unexpected error building this response.', instance: req.originalUrl });
}

/**
 * Builds an Express handler for a manifest entry with v1.status === 'adapter'.
 * @param {object} entry - manifest entry
 * @param {ReturnType<typeof import('./internal-client').createInternalClient>} internalClient
 * @param {object} config - loadV1Config() result, needed by entry.v1.validateKey validators
 */
function buildAdapterHandler(entry, internalClient, config) {
  const shape = entry.v1.shape || 'passthrough';

  return async function adapterHandler(req, res) {
    if (entry.v1.validateKey) {
      const validate = VALIDATORS[entry.v1.validateKey];
      if (!validate) {
        console.error(`[v1] adapter error: unknown validateKey "${entry.v1.validateKey}" for ${entry.v1.path}`);
        sendProblem(res, 'internal-error', { detail: 'Route configuration error.', instance: req.originalUrl });
        return;
      }
      const result = validate(req.body, config);
      if (!result.ok) {
        sendProblem(res, 'validation-error', {
          instance: req.originalUrl,
          detail: 'Request failed v1 cost/range validation.',
          errors: result.errors,
        });
        return;
      }
    }

    let legacyPath;
    try {
      legacyPath = fillLegacyPath(entry.legacyPath, req.params);
    } catch (err) {
      sendProblem(res, 'internal-error', { detail: 'Route configuration error.', instance: req.originalUrl });
      logSafeError('[v1] path template error:', err);
      return;
    }

    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query || {})) {
      if (typeof v === 'string') query.set(k, v);
    }

    if (shape === 'list') {
      const rawCursor = req.query.cursor;
      if (rawCursor) {
        const decoded = decodeCursor(rawCursor);
        if (!decoded) {
          sendProblem(res, 'validation-error', {
            instance: req.originalUrl,
            detail: 'The `cursor` query parameter is invalid or expired.',
            errors: [{ field: 'cursor', issue: 'malformed or unrecognized cursor' }],
          });
          return;
        }
        query.delete('cursor');
        for (const [k, v] of Object.entries(decoded)) {
          if (k === 'v') continue;
          query.set(k, String(v));
        }
      }
    }

    let dispatchResult;
    try {
      dispatchResult = await internalClient.dispatch(entry.method, legacyPath, {
        query,
        body: entry.method === 'GET' ? undefined : req.body,
      });
    } catch (err) {
      handleDispatchError(res, req, err);
      return;
    }

    const { status, body } = dispatchResult;

    applyRelayedHeaders(res, dispatchResult.headers);
    addServerTiming(res, dispatchResult.timingMs);

    if (isErrorBody(status, body)) {
      relayLegacyError(res, req, status, body, dispatchResult);
      return;
    }

    const indexedHeight = typeof req.v1?.resolveIndexedHeight === 'function'
      ? await req.v1.resolveIndexedHeight()
      : req.v1?.indexedHeight ?? null;

    const warnings = [];
    if (entry.v1.knownPrecisionCaveat) warnings.push({ issue: entry.v1.knownPrecisionCaveat });

    if (shape === 'list') {
      const listKey = entry.v1.listKey;
      const paginationKey = entry.v1.paginationKey || 'pagination';
      const items = Array.isArray(body?.[listKey]) ? body[listKey] : [];
      const pagination = body?.[paginationKey] || {};

      const { value: convertedItems, warnings: zWarnings } = applyZatoshiToData(items, entry.v1.zatoshiFields);
      warnings.push(...zWarnings);

      const page = buildPageMeta({
        limit: pagination.limit,
        hasNext: pagination.hasNext,
        hasPrev: pagination.hasPrev,
        nextLegacyCursor: entry.v1.cursorMap?.next ? entry.v1.cursorMap.next(pagination) : null,
        prevLegacyCursor: entry.v1.cursorMap?.prev ? entry.v1.cursorMap.prev(pagination) : null,
        mapLegacyCursor: (payload) => payload,
        total: pagination.total ?? null,
      });

      sendSuccess(res, convertedItems, { indexedHeight, page, warnings });
      return;
    }

    // passthrough
    let data = body;
    if (data && typeof data === 'object' && !Array.isArray(data) && 'success' in data) {
      const { success, ...rest } = data;
      data = rest;
    }
    const { value: convertedData, warnings: zWarnings } = applyZatoshiFields(data, entry.v1.zatoshiFields || []);
    warnings.push(...zWarnings);

    sendSuccess(res, convertedData, { indexedHeight, warnings });
  };
}

/** Builds an Express handler for a manifest entry with v1.status === 'stub'. Fails closed. */
function buildStubHandler(entry) {
  return function stubHandler(req, res) {
    sendProblem(res, 'not-migrated', {
      instance: req.originalUrl,
      detail: entry.v1.notes || 'This endpoint is inventoried but not yet available under /v1.',
      extra: { legacyPath: entry.legacyPath, legacyMethod: entry.method },
    });
  };
}

module.exports = { buildAdapterHandler, buildStubHandler, fillLegacyPath, isErrorBody };
