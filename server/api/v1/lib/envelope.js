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
 *   freshness     - explicit fresh/stale/unknown/unavailable state
 *   units         - authoritative monetary unit and JSON encoding
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
  const generatedAt = new Date().toISOString();
  const cacheMeta = cache || { status: 'unknown', ageSeconds: null };
  const freshnessStatus = indexedHeight === null
    ? 'unavailable'
    : cacheMeta.status === 'stale'
      ? 'stale'
      : dataAgeSeconds === null
        ? 'unknown'
        : dataAgeSeconds <= 120 ? 'fresh' : 'stale';
  const meta = {
    requestId,
    network,
    generatedAt,
    indexedHeight,
    source: { indexedHeight, observedAt: generatedAt },
    cache: cacheMeta,
    freshness: { status: freshnessStatus, ageSeconds: dataAgeSeconds },
    units: {
      authoritativeMonetary: 'zatoshi',
      authoritativeEncoding: 'decimal-string',
      zatoshiPerZec: '100000000',
      legacyFormattedFields: 'field-defined',
    },
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
