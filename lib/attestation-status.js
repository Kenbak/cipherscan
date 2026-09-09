// Shared by the observer API and browser: retained successes expire even when
// the worker, API or browser refresh fails.
const FRESH_FOR_MS = 15 * 60_000;
function attestationStatus(check, now = Date.now()) {
  if (!check) return 'not_checked';
  const checkedAt = Date.parse(check.checkedAt);
  if (!Number.isFinite(checkedAt) || checkedAt > now + 30_000) return 'unavailable';
  if (now - checkedAt >= FRESH_FOR_MS) return 'stale';
  if (!check.reachable) return 'unreachable';
  if (check.evidence !== 'verified' || check.tlsBinding !== 'matched' || check.release === 'mismatch') return 'failed';
  return 'verified';
}
function matchesReproducedBuild(endpoint, now = Date.now()) {
  return endpoint?.baseline?.authority === 'reproduced'
    && endpoint.latest?.release === 'reproduced_match'
    && attestationStatus(endpoint.latest, now) === 'verified';
}
module.exports = { FRESH_FOR_MS, attestationStatus, matchesReproducedBuild };
