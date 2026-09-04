/**
 * server/api/v1/lib/envelope.js
 *
 * Standard success envelope for every /v1 response:
 *
 *   { "data": <payload>, "meta": { ... } }
 *
 * `meta` always includes:
 *   requestId     - uuid v4, also echoed as X-Request-Id
 *   network       - mainnet | testnet | crosslink-testnet
 *   generatedAt   - ISO 8601 timestamp of when *this* response was built
 *   indexedHeight - best-known indexer tip height at generation time, or
 *                   null if unavailable (never fabricated)
 *   cache         - { status: 'hit'|'miss'|'stale'|'unknown', ageSeconds }
 *
 * Optional, added by adapters when relevant:
 *   page          - cursor pagination block (see lib/cursor.js)
 *   warnings      - non-fatal data-quality notes (e.g. unverified zatoshi field)
 */

const crypto = require('crypto');

function newRequestId() {
  return crypto.randomUUID();
}

/**
 * Build the base meta block. `overrides` merges in last so adapters can
 * supply cache/indexedHeight/etc without repeating boilerplate.
 */
function buildMeta({ requestId, network, indexedHeight = null, cache = null, dataAgeSeconds = null, warnings = undefined, page = undefined } = {}) {
  const meta = {
    requestId,
    network,
    generatedAt: new Date().toISOString(),
    indexedHeight,
    cache: cache || { status: 'unknown', ageSeconds: null },
  };
  if (dataAgeSeconds !== null) meta.dataAgeSeconds = dataAgeSeconds;
  if (warnings && warnings.length) meta.warnings = warnings;
  if (page) meta.page = page;
  return meta;
}

function sendSuccess(res, data, metaOverrides = {}) {
  const meta = buildMeta({
    requestId: res.req?.v1?.requestId,
    network: res.req?.v1?.network,
    indexedHeight: res.req?.v1?.indexedHeight ?? null,
    ...metaOverrides,
  });
  res.status(metaOverrides.status || 200);
  res.set('Content-Type', 'application/json');
  res.json({ data, meta });
  return { data, meta };
}

module.exports = { newRequestId, buildMeta, sendSuccess };
