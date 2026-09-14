// Canary's signed lifetime is independent of the existing collector's 15 minutes.
function canaryStatus(check, now = Date.now()) {
  if (!check) return 'not_configured';
  if (!Number.isFinite(Date.parse(check.checkedAt)) || Date.parse(check.checkedAt) > now + 30_000) return 'unavailable';
  if (now - Date.parse(check.checkedAt) >= 120_000) return 'stale';
  if (check.verified !== true) return 'unavailable';
  const expires = Date.parse(check.expiresAt);
  if (!Number.isFinite(expires) || expires <= now) return 'stale';
  if (check.status !== 'VERIFIED') return check.status === 'FAILED' ? 'failed' : check.status === 'UNREACHABLE' ? 'unreachable' : 'stale';
  const observed = Date.parse(check.observedAt);
  if (!Number.isFinite(observed) || observed > now + 30_000 || now - observed >= 180_000) return 'stale';
  if (check.transportWarning) return 'warning';
  return 'verified';
}
module.exports = { canaryStatus };
