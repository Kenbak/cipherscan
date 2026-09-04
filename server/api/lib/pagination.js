/**
 * Shared, safe parsing for offset-based list pagination query params.
 *
 * Problem: `LIMIT n OFFSET m` forces PostgreSQL to scan and discard `m` rows
 * before it can return anything. A well-behaved client only ever asks for
 * small offsets (page through a handful of screens), but nothing stops a
 * scraper — or a client bug that never gives up incrementing `offset` — from
 * requesting an enormous offset against a multi-million-row table (blocks,
 * transactions, addresses). That turns a cheap indexed query into a full
 * sequential scan, and does it on every request.
 *
 * `parseSafeOffset`/`parseSafeListPagination`/`parseSafePagePagination` clamp
 * `offset` (or the page-derived offset) to a per-route ceiling. Requests
 * within the ceiling — i.e. every normal request real users and the frontend
 * ever make — are completely unaffected: same limit/offset math, same
 * response shape. Requests past the ceiling are flagged via `offsetExceeded`
 * so the calling route can decide how to respond: most routes should return
 * a 400 pointing the client at a cheaper access pattern (a cursor param, a
 * different sort, or a narrower window) rather than silently running the
 * expensive query anyway or silently returning different data than asked
 * for.
 *
 * This module only parses/validates. It never touches `req`/`res` or issues
 * queries, so it's easy to unit test in isolation and safe to reuse across
 * every route file.
 */

'use strict';

// Default ceiling for routes that don't pass an explicit `maxOffset`. Chosen
// so that even the largest tables (blocks, transactions — multi-million
// rows) bound the OFFSET scan to a few hundred thousand rows worst case,
// while remaining far above any real pagination depth a UI would reach.
const DEFAULT_MAX_OFFSET = 100_000;

const DEFAULT_MAX_LIMIT = 100;
const DEFAULT_DEFAULT_LIMIT = 20;

/**
 * Parses a `limit` query value into a safe integer.
 * Non-numeric, missing, zero, or negative values fall back to `defaultLimit`.
 * Anything above `maxLimit` is clamped down to `maxLimit`.
 */
function parseSafeLimit(rawLimit, { defaultLimit = DEFAULT_DEFAULT_LIMIT, maxLimit = DEFAULT_MAX_LIMIT } = {}) {
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return defaultLimit;
  return Math.min(parsed, maxLimit);
}

/**
 * Parses an `offset` query value and clamps it to `maxOffset`.
 *
 * Returns:
 *   - offset: the value safe to use in the SQL query (never exceeds maxOffset)
 *   - requestedOffset: what the client actually asked for (for logging/errors)
 *   - offsetExceeded: true when the request asked for more than maxOffset
 *   - maxOffset: the ceiling that was applied
 */
function parseSafeOffset(rawOffset, { maxOffset = DEFAULT_MAX_OFFSET } = {}) {
  const parsed = Number.parseInt(rawOffset, 10);
  const requestedOffset = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const offsetExceeded = requestedOffset > maxOffset;
  return {
    offset: offsetExceeded ? maxOffset : requestedOffset,
    requestedOffset,
    offsetExceeded,
    maxOffset,
  };
}

/**
 * Combined limit + offset parsing for `?limit=&offset=` style routes.
 * Preserves each route's own default/max limit so existing normal requests
 * (and their response shapes) are unaffected; only the offset ceiling is new
 * behavior, and only kicks in for abnormally deep requests.
 */
function parseSafeListPagination(query = {}, opts = {}) {
  const { defaultLimit, maxLimit, maxOffset } = opts;
  const limit = parseSafeLimit(query.limit, { defaultLimit, maxLimit });
  const { offset, requestedOffset, offsetExceeded } = parseSafeOffset(query.offset, { maxOffset });
  return {
    limit,
    offset,
    requestedOffset,
    offsetExceeded,
    maxOffset: maxOffset ?? DEFAULT_MAX_OFFSET,
  };
}

/**
 * Page-based variant (`?page=1&limit=`) used by a few routes. Converts the
 * 1-based page number to the same safe, capped offset so the underlying
 * query bound is identical to the offset-based routes.
 */
function parseSafePagePagination(query = {}, opts = {}) {
  const { defaultLimit, maxLimit, maxOffset } = opts;
  const limit = parseSafeLimit(query.limit, { defaultLimit, maxLimit });

  const parsedPage = Number.parseInt(query.page, 10);
  const requestedPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const requestedOffset = (requestedPage - 1) * limit;

  const { offset, offsetExceeded, maxOffset: appliedMaxOffset } = parseSafeOffset(requestedOffset, { maxOffset });
  const page = Math.floor(offset / limit) + 1;

  return {
    limit,
    page,
    requestedPage,
    offset,
    requestedOffset,
    offsetExceeded,
    maxOffset: appliedMaxOffset,
  };
}

/**
 * Builds a standard "go away, use a cursor" error payload for routes that
 * choose to reject (rather than silently clamp) requests past the offset
 * ceiling. Callers still control the HTTP status and any route-specific
 * wrapper fields (e.g. `success: false`) — this only builds the shared
 * `error`/details fields so the message is consistent across routes.
 *
 * `cursorHint` is optional free text pointing at the cheaper alternative
 * (a cursor param, a different endpoint, or a narrower filter) for routes
 * that have one.
 */
function offsetExceededError({ requestedOffset, maxOffset, cursorHint }) {
  const base = `offset ${requestedOffset} exceeds the maximum supported offset of ${maxOffset}`;
  return {
    error: cursorHint ? `${base}. ${cursorHint}` : base,
    maxOffset,
    requestedOffset,
  };
}

module.exports = {
  DEFAULT_MAX_OFFSET,
  DEFAULT_MAX_LIMIT,
  DEFAULT_DEFAULT_LIMIT,
  parseSafeLimit,
  parseSafeOffset,
  parseSafeListPagination,
  parseSafePagePagination,
  offsetExceededError,
};
