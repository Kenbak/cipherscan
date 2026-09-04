'use strict';

const crypto = require('crypto');

/**
 * Constant-time string comparison via fixed-length SHA-256 digests, so
 * mismatched lengths or values never leak timing information. Used for
 * service-key checks (HTTP + WebSocket) instead of === / Array.includes.
 */
function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Checks `key` against every entry in `knownKeys` without early-returning,
 * so the number of valid keys configured does not create a timing signal.
 */
function isKnownServiceKey(key, knownKeys) {
  if (!key) return false;
  let matched = false;
  for (const known of knownKeys) {
    if (constantTimeEqual(key, known)) matched = true;
  }
  return matched;
}

/**
 * express-rate-limit `skip` predicate: bypass the global rate limit ONLY
 * for requests presenting a valid X-Service-Key.
 *
 * Origin/Referer headers must never be used as a rate-limit bypass signal:
 * they are client-supplied and trivially spoofable by any non-browser HTTP
 * client (curl, a script, an abusive scraper) that simply sets the header
 * to match one of our own domains — there is no CORS/browser enforcement
 * on the server side of a plain HTTP request. Only a shared secret that an
 * outside caller cannot forge is safe to use for this purpose.
 */
function createServiceKeyOnlySkip(serviceKeys) {
  return (req) => isKnownServiceKey(req.headers['x-service-key'], serviceKeys);
}

module.exports = { constantTimeEqual, isKnownServiceKey, createServiceKeyOnlySkip };
