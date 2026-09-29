'use strict';

const { isIP } = require('node:net');
const { parsePeerAddress } = require('./peer-client');
const VERIFIED_WINDOW_MS = 60 * 60 * 1000;
const SNAPSHOT_MAX_AGE_MS = 3 * 60 * 1000;
const CENSUS_VERSION = 2;
const PEER_WINDOW_SECONDS = 900;

// A recent poll of an old snapshot is not a new network observation.
function validateCrawlSnapshot(metrics, now = Date.now()) {
  const generated = metrics?.generated_at_ms;
  if (!Number.isSafeInteger(generated) || generated > now + 30_000 || now - generated > SNAPSHOT_MAX_AGE_MS) {
    throw new Error('Crawler snapshot is missing a valid recent generation timestamp');
  }
  if (!Array.isArray(metrics.node_info)) throw new Error('Crawler snapshot is missing node_info');
  return metrics;
}

function verifiedNodes(metrics, now = Date.now()) {
  validateCrawlSnapshot(metrics, now);
  return metrics.node_info.filter(node => Number.isSafeInteger(node.last_verified_at_ms)
    && node.last_verified_at_ms <= metrics.generated_at_ms
    && node.last_verified_at_ms > now - VERIFIED_WINDOW_MS
    && typeof node.addr === 'string' && node.addr.length > 0);
}

// The database identity is an IP, not an IP:port. Prefer its latest verification.
function mergeVerifiedNodes(snapshots, now = Date.now()) {
  const byHost = new Map();
  for (const snapshot of snapshots) {
    for (const node of verifiedNodes(snapshot, now)) {
      const { host } = parsePeerAddress(node.addr);
      const previous = byHost.get(host);
      if (host && (!previous || node.last_verified_at_ms > previous.last_verified_at_ms)) byHost.set(host, node);
    }
  }
  return [...byHost.values()];
}

// A successful local getpeerinfo response observes existing, protocol-established
// connections. This is not a new crawler handshake and must retain its own clock.
function livePeerNodes(peers, observedAt = Date.now()) {
  if (!Array.isArray(peers)) throw new Error('Invalid live peer response');
  const byHost = new Map();
  for (const peer of peers) {
    if (!peer || typeof peer !== 'object') continue;
    const { host, port } = parsePeerAddress(peer.addr);
    if (!isIP(host || '') || host === '0.0.0.0' || host === '::'
      || !Number.isInteger(peer.version) || peer.version <= 0) continue;
    const addr = isIP(host) === 6 ? `[${host}]:${port}` : `${host}:${port}`;
    const services = typeof peer.services === 'number' ? peer.services :
      /^[0-9a-f]{1,16}$/i.test(peer.services || '') ? Number(BigInt(`0x${peer.services}`)) : null;
    // Multiple simultaneous connections from one IP are one census identity.
    if (!byHost.has(host)) byHost.set(host, { addr, user_agent: peer.subver || null,
      protocol_version: peer.version, start_height: peer.startingheight ?? null,
      services: Number.isSafeInteger(services) && services >= 0 ? services : null,
      last_peer_seen_at_ms: observedAt, inbound: peer.inbound === true,
      handshake_time_ms: null });
  }
  return [...byHost.values()];
}

const CRAWL_ELIGIBILITY = "last_verified_at > NOW() - INTERVAL '1 hour' AND last_verified_at <= NOW()";
const PEER_ELIGIBILITY = `last_peer_seen_at > NOW() - INTERVAL '${PEER_WINDOW_SECONDS} seconds' AND last_peer_seen_at <= NOW()`;
const COMBINED_ELIGIBILITY = `(${CRAWL_ELIGIBILITY}) OR (${PEER_ELIGIBILITY})`;

// Compute eligibility at read time as well, so a stopped ingester cannot leave
// an active flag valid forever. Historical/discovered rows remain in totalSeen.
function censusTable(source) {
  const eligibility = source === 'crawl'
    ? `(${COMBINED_ELIGIBILITY})`
    : 'is_active';
  return `(SELECT nodes.*, (${eligibility}) AS census_active FROM nodes)`;
}

module.exports = { CENSUS_VERSION, VERIFIED_WINDOW_MS, SNAPSHOT_MAX_AGE_MS, validateCrawlSnapshot, verifiedNodes, mergeVerifiedNodes, livePeerNodes, censusTable, PEER_WINDOW_SECONDS, CRAWL_ELIGIBILITY, PEER_ELIGIBILITY, COMBINED_ELIGIBILITY };
