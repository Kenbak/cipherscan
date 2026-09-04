/**
 * server/api/v1/lib/headers.js
 *
 * Applies the internal-client's allowlisted response headers (see
 * lib/internal-client.js ALLOWED_RESPONSE_HEADERS) onto the outgoing v1
 * response, and adds v1's OWN Server-Timing entry for the internal proxy
 * hop — kept separate from any relayed legacy timing so it's unambiguous
 * which number measures which hop.
 */

/**
 * @param {import('express').Response} res
 * @param {object} relayedHeaders - lowercased header-name -> value, as
 *   returned by internal-client's dispatch() `headers` field.
 */
function applyRelayedHeaders(res, relayedHeaders) {
  if (!relayedHeaders) return;
  for (const [name, value] of Object.entries(relayedHeaders)) {
    if (value === undefined || value === null) continue;
    res.set(name, value);
  }
}

/**
 * Adds a `internal;dur=<ms>` Server-Timing entry measuring the internal
 * dispatch hop, appending to any Server-Timing this response already has
 * (e.g. set earlier in the same handler) rather than clobbering it.
 *
 * @param {import('express').Response} res
 * @param {number} timingMs
 * @param {string} [entryName] - defaults to 'internal'
 */
function addServerTiming(res, timingMs, entryName = 'internal') {
  if (typeof timingMs !== 'number' || !Number.isFinite(timingMs)) return;
  const entry = `${entryName};dur=${timingMs}`;
  const existing = res.get('Server-Timing');
  res.set('Server-Timing', existing ? `${existing}, ${entry}` : entry);
}

module.exports = { applyRelayedHeaders, addServerTiming };
