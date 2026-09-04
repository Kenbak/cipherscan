/**
 * server/api/v1/lib/scan-validation.js
 *
 * v1-layer cost/range validation for the two scan endpoints
 * (POST /v1/scan/orchard, POST /v1/scan/lightwalletd).
 *
 * These are intentionally STRICTER than the legacy handlers' own checks
 * (server/api/routes/scan.js) — legacy accepts ranges up to 1,000,000
 * (orchard) / 50,000 (lightwalletd) blocks, and lightwalletd additionally
 * lets `endHeight` default to the current chain tip. That's a reasonable
 * default for the existing internal/first-party callers, but a public,
 * more-discoverable /v1 surface should not inherit an open-ended "scan to
 * tip" request shape or the largest range legacy will tolerate. Combined
 * with per-IP rate limiting (lib/rate-limit.js), this bounds worst-case
 * cost per caller instead of just documenting the risk.
 *
 * Each validator returns `{ ok: true }` or `{ ok: false, errors: [{field, issue}] }`
 * and never throws — build-route.js turns a failed validation into a 400
 * validation-error problem+json response without dispatching to legacy.
 */

function isSafeNonNegativeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * @param {any} body - req.body for POST /v1/scan/orchard
 * @param {object} config - loadV1Config() result (config.scan.orchard.maxRange)
 */
function validateOrchardScanRequest(body, config) {
  const errors = [];
  const { startHeight, endHeight } = body || {};

  if (!isSafeNonNegativeInteger(startHeight)) {
    errors.push({ field: 'startHeight', issue: 'required, must be a non-negative integer' });
  }
  if (!isSafeNonNegativeInteger(endHeight)) {
    errors.push({ field: 'endHeight', issue: 'required, must be a non-negative integer' });
  }
  if (errors.length) return { ok: false, errors };

  if (startHeight > endHeight) {
    errors.push({ field: 'startHeight', issue: 'must be <= endHeight' });
  }

  const maxRange = config.scan.orchard.maxRange;
  const requestedRange = endHeight - startHeight + 1;
  if (requestedRange > maxRange) {
    errors.push({
      field: 'endHeight',
      issue: `requested range (${requestedRange} blocks) exceeds the v1 limit of ${maxRange} blocks per request`,
    });
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

/**
 * @param {any} body - req.body for POST /v1/scan/lightwalletd
 * @param {object} config - loadV1Config() result (config.scan.lightwalletd.maxRange)
 */
function validateLightwalletdScanRequest(body, config) {
  const errors = [];
  const { startHeight, endHeight } = body || {};

  if (!isSafeNonNegativeInteger(startHeight) || startHeight < 1) {
    errors.push({ field: 'startHeight', issue: 'required, must be an integer >= 1' });
  }

  // Unlike the legacy handler, v1 does NOT default a missing endHeight to
  // the current chain tip — that shape lets a caller request an
  // unboundable-until-resolved range. v1 requires an explicit, bounded
  // range up front.
  if (endHeight === undefined || endHeight === null) {
    errors.push({
      field: 'endHeight',
      issue: 'required at the v1 layer (unlike the legacy endpoint, v1 does not default to the current chain tip — provide an explicit bounded range)',
    });
  } else if (!isSafeNonNegativeInteger(endHeight)) {
    errors.push({ field: 'endHeight', issue: 'must be a non-negative integer' });
  }

  if (errors.length) return { ok: false, errors };

  if (startHeight > endHeight) {
    errors.push({ field: 'startHeight', issue: 'must be <= endHeight' });
  }

  const maxRange = config.scan.lightwalletd.maxRange;
  const requestedRange = endHeight - startHeight + 1;
  if (requestedRange > maxRange) {
    errors.push({
      field: 'endHeight',
      issue: `requested range (${requestedRange} blocks) exceeds the v1 limit of ${maxRange} blocks per request`,
    });
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

const VALIDATORS = {
  scanOrchard: validateOrchardScanRequest,
  scanLightwalletd: validateLightwalletdScanRequest,
};

module.exports = { validateOrchardScanRequest, validateLightwalletdScanRequest, VALIDATORS };
