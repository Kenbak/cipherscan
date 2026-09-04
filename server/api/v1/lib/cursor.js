/**
 * server/api/v1/lib/cursor.js
 *
 * Opaque cursor conventions for /v1 list endpoints.
 *
 * Cursors are base64url-encoded JSON envelopes: { v: 1, ...payload }.
 * Clients must treat them as opaque strings; the envelope version lets us
 * change the internal shape later without breaking `type` checks client
 * side (they never introspect it).
 *
 * These helpers are transport-only. They do NOT talk to the database —
 * adapters translate an incoming v1 cursor into whatever the legacy
 * endpoint's own pagination params are (e.g. legacy `cursor`/`direction`
 * query params), and translate the legacy pagination result back into a
 * v1 cursor on the way out.
 */

const CURSOR_VERSION = 1;

function encodeCursor(payload) {
  const envelope = { v: CURSOR_VERSION, ...payload };
  return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url');
}

/**
 * Decode a v1 cursor. Returns null (not a throw) on any malformed input so
 * callers can fail closed with a 400 validation-error problem rather than
 * a 500 — cursors are client-supplied and must never crash the process.
 */
function decodeCursor(cursor) {
  if (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 4096) return null;
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || parsed.v !== CURSOR_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Build the standard v1 pagination meta block from a legacy pagination
 * object. `mapLegacyCursor(rawLegacyCursorValue) => payload` lets each
 * adapter decide what to embed (e.g. { height: 123 } or { offset: 50 }).
 */
function buildPageMeta({ limit, hasNext, hasPrev, nextLegacyCursor, prevLegacyCursor, mapLegacyCursor, total = null }) {
  const wrap = (legacyCursor) => {
    if (legacyCursor === null || legacyCursor === undefined) return null;
    const payload = mapLegacyCursor ? mapLegacyCursor(legacyCursor) : { cursor: legacyCursor };
    return encodeCursor(payload);
  };

  return {
    limit,
    hasNext: Boolean(hasNext),
    hasPrev: Boolean(hasPrev),
    nextCursor: hasNext ? wrap(nextLegacyCursor) : null,
    prevCursor: hasPrev ? wrap(prevLegacyCursor) : null,
    ...(total !== null ? { total } : {}),
  };
}

module.exports = { CURSOR_VERSION, encodeCursor, decodeCursor, buildPageMeta };
