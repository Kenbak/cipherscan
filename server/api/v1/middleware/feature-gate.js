/**
 * server/api/v1/middleware/feature-gate.js
 *
 * Gates the entire /v1 surface until launch:
 *
 *   1. API_V1_ENABLED !== true  -> the whole router behaves as if it were
 *      never mounted: 404 "feature-disabled", identical in shape to the
 *      404 an unrelated unknown path would get. This deliberately does
 *      NOT distinguish "disabled" from "route doesn't exist" so an
 *      unauthenticated scan of the host can't fingerprint an unreleased
 *      API surface.
 *
 *   2. API_V1_ENABLED === true but API_V1_LAUNCHED !== true -> a valid
 *      X-API-Preview-Key header (compared with constant-time equality)
 *      is required. Missing/invalid key -> 401 "preview-auth-required".
 *      This DOES reveal that /v1 exists, which is the intended behavior
 *      for invited preview testers; it's why this stage is opt-in via
 *      API_V1_ENABLED and should only be flipped on internal/staging
 *      hosts (or dedicated preview hosts) before general availability.
 *
 *   3. API_V1_LAUNCHED === true -> gate is a no-op (GA, no preview key
 *      needed). Flip this only once the contract is stable.
 */

const crypto = require('crypto');
const { sendProblem } = require('../lib/problem');

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function createFeatureGate(config) {
  return function featureGate(req, res, next) {
    if (!config.enabled) {
      // Deliberately generic 404 — see module docblock. Falls through to
      // Express's own 404 shape territory but as problem+json for
      // consistency with the rest of /v1.
      sendProblem(res, 'feature-disabled', {
        instance: req.originalUrl,
        detail: 'Not found.',
      });
      return;
    }

    if (config.launched) return next();

    if (!config.previewKey) {
      // Enabled but no preview key configured: fail closed rather than
      // open. An operator turning on API_V1_ENABLED without also setting
      // API_V1_PREVIEW_KEY should get a locked door, not an open one.
      sendProblem(res, 'preview-auth-required', {
        instance: req.originalUrl,
        detail: 'v1 preview access is not yet configured.',
      });
      return;
    }

    const suppliedKey = req.headers['x-api-preview-key'];
    if (!constantTimeEqual(String(suppliedKey || ''), config.previewKey)) {
      sendProblem(res, 'preview-auth-required', {
        instance: req.originalUrl,
        detail: 'Provide a valid X-API-Preview-Key header to access the v1 preview.',
      });
      return;
    }

    next();
  };
}

module.exports = { createFeatureGate, constantTimeEqual };
