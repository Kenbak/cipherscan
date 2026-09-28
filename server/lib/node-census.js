'use strict';

const { parsePeerAddress } = require('./peer-client');
const VERIFIED_WINDOW_MS = 60 * 60 * 1000;
const SNAPSHOT_MAX_AGE_MS = 3 * 60 * 1000;
const CENSUS_VERSION = 1;

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

// Compute eligibility at read time as well, so a stopped ingester cannot leave
// an active flag valid forever. Historical/discovered rows remain in totalSeen.
function censusTable(source) {
  const eligibility = source === 'crawl'
    ? "is_active AND observed_via = 'crawl' AND last_verified_at > NOW() - INTERVAL '1 hour' AND last_verified_at <= NOW()"
    : 'is_active';
  return `(SELECT nodes.*, (${eligibility}) AS census_active FROM nodes)`;
}

module.exports = { CENSUS_VERSION, VERIFIED_WINDOW_MS, SNAPSHOT_MAX_AGE_MS, validateCrawlSnapshot, verifiedNodes, mergeVerifiedNodes, censusTable };
