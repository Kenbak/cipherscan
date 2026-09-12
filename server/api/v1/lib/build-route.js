/**
 * Manifest-driven adapter. The existing handlers remain the data authority.
 * Query names are allowlisted in routes/index.js; source handlers validate values.
 * Lists use route/filter-bound opaque cursors and one-row lookahead. Writes retain
 * source semantics. Only explicitly declared authorization headers are forwarded.
 * Successful data is wrapped once; HTTP failures become non-cacheable problems.
 */

const { createHash } = require('node:crypto');
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
  status = status >= 400 ? status : 502;
  const typeSlug = status === 402 ? 'payment-required' : status === 401 ? 'authentication-required' : status === 403 ? 'access-denied' : status === 404 ? 'not-found' : status === 429 ? 'rate-limited' : status >= 400 && status < 500 ? 'validation-error' : 'upstream-error';
  sendProblem(res, typeSlug, { status, detail, instance: req.originalUrl, extra: status === 402 ? { paymentRequired: body } : body?.status === 'building' ? { code: 'building' } : undefined });
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

    const paymentAuth = entry.v1.forwardPaymentAuth ? {} : undefined;
    if (paymentAuth) {
      for (const name of ['authorization', 'payment-signature', 'x-payment', 'x-service-key']) {
        const value = req.headers[name];
        if (value !== undefined && (typeof value !== 'string' || value.length > 16_384)) return sendProblem(res, 'validation-error', { detail: 'Invalid authorization header.' });
        if (value) paymentAuth[name] = value;
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

    if (Object.values(req.query || {}).some(value => typeof value !== 'string')) {
      sendProblem(res, 'validation-error', { detail: 'Query parameters must occur once and contain scalar values.' });
      return;
    }
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query || {})) {
      if (typeof v === 'string') query.set(k, v);
    }

    const filters = new URLSearchParams(query);
    for (const key of ['limit', 'cursor', 'direction', 'cursor_idx', 'cursor_id', 'cursor_txid']) filters.delete(key);
    filters.sort();
    const filterId = createHash('sha256').update(filters.toString()).digest('hex').slice(0, 16);
    const position = (item, direction) => {
      if (!item) return null;
      const base = { route: entry.v1.path, filters: filterId, direction };
      if (entry.v1.listKey === 'blocks') return { ...base, cursor: Number(item.height) };
      if (entry.v1.listKey === 'transactions') return { ...base, cursor: Number(item.block_height), cursor_idx: Number(item.tx_index ?? 0) };
      return { ...base, cursor: Number(item.blockTime), cursor_id: req.query.flow_type === 'fully_shielded' ? item.txid : item.id, cursor_txid: item.txid };
    };
    let pageLimit = null;
    let pageDirection = 'next';
    if (shape === 'list') {
      pageLimit = req.query.limit === undefined ? 25 : Number(req.query.limit);
      if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 100) {
        sendProblem(res, 'validation-error', { detail: '`limit` must be an integer from 1 to 100.' });
        return;
      }
      if (req.query.cursor) {
        const decoded = decodeCursor(req.query.cursor);
        const validPosition = decoded && Number.isSafeInteger(Number(decoded.cursor)) && Number(decoded.cursor) >= 0;
        const allowed = ['v', 'route', 'filters', 'cursor', 'cursor_idx', 'cursor_id', 'cursor_txid', 'direction'];
        if (!validPosition || decoded.route !== entry.v1.path || decoded.filters !== filterId || !['next', 'prev'].includes(decoded.direction)
            || Object.keys(decoded).some(k => !allowed.includes(k))
            || (decoded.cursor_idx !== undefined && (!Number.isSafeInteger(Number(decoded.cursor_idx)) || Number(decoded.cursor_idx) < 0))
            || (decoded.cursor_txid !== undefined && !/^[a-f0-9]{64}$/.test(String(decoded.cursor_txid)))
            || (decoded.cursor_id !== undefined && !/^(?:[0-9]+|[a-f0-9]{64})$/.test(String(decoded.cursor_id)))) {
          sendProblem(res, 'validation-error', { detail: 'The cursor is invalid for this collection.', errors: [{ field: 'cursor', issue: 'invalid collection cursor' }] });
          return;
        }
        query.delete('cursor');
        for (const k of ['cursor', 'cursor_idx', 'cursor_id', 'cursor_txid', 'direction']) {
          if (decoded[k] !== undefined) query.set(k, String(decoded[k]));
        }
        pageDirection = decoded.direction;
      } else {
        for (const k of ['direction', 'cursor_idx', 'cursor_id', 'cursor_txid']) query.delete(k);
      }
      // Lookahead belongs to the API, not to each page component.
      query.set('limit', String(pageLimit + 1));
    }

    // v1 always returns JSON; legacy's default plain-text supply endpoint is for aggregators.
    if (entry.legacyPath === '/api/circulating-supply') query.set('format', 'json');

    let dispatchResult;
    try {
      dispatchResult = await internalClient.dispatch(entry.method, legacyPath, {
        query,
        body: entry.method === 'GET' ? undefined : req.body,
        parentSignal: req.v1?.abortSignal,
        useServiceKey: !entry.v1.forwardNodeToken && !entry.v1.forwardPaymentAuth,
        paymentAuth,
        nodeToken: entry.v1.forwardNodeToken && typeof req.headers['x-node-token'] === 'string' && req.headers['x-node-token'].length <= 200 ? req.headers['x-node-token'] : undefined,
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

    const headerHeight = dispatchResult.headers?.['x-cipherscan-indexed-height'];
    if (req.v1 && typeof headerHeight === 'string' && /^\d+$/.test(headerHeight) && Number.isSafeInteger(Number(headerHeight))) req.v1.indexedHeight = Number(headerHeight);
    const indexedHeight = typeof req.v1?.resolveIndexedHeight === 'function'
      ? await req.v1.resolveIndexedHeight()
      : req.v1?.indexedHeight ?? null;

    const warnings = [];
    if (entry.v1.knownPrecisionCaveat) warnings.push({ issue: entry.v1.knownPrecisionCaveat });

    if (shape === 'list') {
      const listKey = entry.v1.listKey;
      if (!Array.isArray(body?.[listKey]) || !body?.[entry.v1.paginationKey || 'pagination']) {
        sendProblem(res, 'upstream-contract-mismatch', { detail: 'The collection source returned an invalid shape.' });
        return;
      }
      const all = body[listKey];
      const pagination = body[entry.v1.paginationKey || 'pagination'];
      let hasMore = all.length > pageLimit;
      // The deployed source caps reads at 100. At that boundary, probe one
      // additional row instead of treating a full page as the end of history.
      if (!hasMore && all.length === pageLimit && pageLimit === 100) {
        const edge = position(pageDirection === 'prev' ? all[0] : all.at(-1), pageDirection);
        const probeQuery = new URLSearchParams(query);
        probeQuery.set('limit', '1');
        for (const key of ['cursor', 'cursor_idx', 'cursor_id', 'cursor_txid', 'direction']) {
          if (edge[key] !== undefined) probeQuery.set(key, String(edge[key]));
        }
        try {
          const probe = await internalClient.dispatch(entry.method, legacyPath, { query: probeQuery, parentSignal: req.v1?.abortSignal });
          if (!probe.ok || !Array.isArray(probe.body?.[listKey])) throw new UpstreamError('Invalid pagination probe.');
          hasMore = probe.body[listKey].length > 0;
        } catch (error) { handleDispatchError(res, req, error); return; }
      }
      const items = pageDirection === 'prev' && all.length > pageLimit ? all.slice(1) : all.slice(0, pageLimit);
      const { value: convertedItems, warnings: zWarnings } = applyZatoshiToData(items, entry.v1.zatoshiFields);
      if (zWarnings.length) {
        sendProblem(res, 'upstream-contract-mismatch', { detail: 'The collection source returned an invalid monetary value.' });
        return;
      }
      if (listKey === 'blocks') {
        for (let i = 0; i < convertedItems.length; i++) {
          const next = items[i + 1] || (pageDirection === 'next' ? all[pageLimit] : null);
          convertedItems[i] = { ...convertedItems[i], intervalSeconds: Object.hasOwn(items[i], 'intervalSeconds') ? items[i].intervalSeconds : next && Number(next.height) === Number(items[i].height) - 1 && Number.isFinite(Number(items[i].timestamp)) && Number.isFinite(Number(next.timestamp)) ? Number(items[i].timestamp) - Number(next.timestamp) : null };
        }
      }
      const page = buildPageMeta({
        limit: pageLimit,
        hasNext: pageDirection === 'prev' ? items.length > 0 && !!req.query.cursor : hasMore,
        hasPrev: pageDirection === 'prev' ? hasMore : !!req.query.cursor && items.length > 0,
        nextLegacyCursor: position(items.at(-1), 'next'),
        prevLegacyCursor: position(items[0], 'prev'),
        mapLegacyCursor: value => value,
        total: pagination.total ?? null,
      });
      sendSuccess(res, convertedItems, { indexedHeight, page, warnings });
      return;
    }

    if (entry.v1.forwardPaymentAuth) res.set('Cache-Control', 'private, no-store');
    // passthrough
    let data = body;
    if (data && typeof data === 'object' && !Array.isArray(data) && 'success' in data) {
      const { success, ...rest } = data;
      data = rest;
    }
    if (entry.v1.path === '/v1/addresses/:address' && data && !Array.isArray(data)) {
      data = { ...data };
      for (const field of ['balance', 'totalReceived', 'totalSent']) {
        if (data[`${field}Zat`] !== undefined) data[field] = data[`${field}Zat`];
      }
    }
    const { value: convertedData, warnings: zWarnings } = applyZatoshiFields(data, entry.v1.zatoshiFields || []);
    if (zWarnings.length) {
      sendProblem(res, 'upstream-contract-mismatch', { detail: 'The source returned an invalid monetary value.' });
      return;
    }

    sendSuccess(res, convertedData, { indexedHeight, warnings, status });
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
