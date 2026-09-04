/**
 * server/api/v1/config.js
 *
 * Central env parsing for the /v1 contract layer. Nothing here has a side
 * effect at import time beyond reading process.env, so it is safe to import
 * from tests without a running server.
 *
 * Env vars (all optional unless noted):
 *
 *   API_V1_ENABLED            "true" to serve any /v1 route at all. Default: disabled.
 *   API_V1_PREVIEW_KEY        Shared secret required (via X-API-Preview-Key
 *                             header) to reach /v1 while in preview. If unset
 *                             while API_V1_ENABLED=true, /v1 is treated as
 *                             fully gated closed (fail closed, not open) —
 *                             see middleware/feature-gate.js.
 *   API_V1_LAUNCHED           "true" once the preview key requirement should
 *                             be dropped (post-launch). Default: false.
 *   V1_INTERNAL_API_BASE_URL  Base URL of the legacy Express API that v1
 *                             adapters proxy to internally (loopback or
 *                             private network). Default: http://127.0.0.1:3001
 *   V1_INTERNAL_SERVICE_KEY   If set, sent as X-Service-Key on internal
 *                             loopback calls so they bypass the legacy
 *                             rate limiter (see server.js SERVICE_API_KEYS).
 *   V1_INTERNAL_TIMEOUT_MS    Per-request timeout for internal dispatch.
 *                             Default: 8000.
 *   V1_INTERNAL_MAX_RESPONSE_BYTES
 *                             Max buffered size of a single internal-dispatch
 *                             response body. Default: 50 * 1024 * 1024 (50MB),
 *                             matching the existing upstream Zebra RPC cap in
 *                             server/lib/zebra-rpc.js (MAX_RPC_RESPONSE_BYTES)
 *                             — v1 must not reject a legacy payload the rest
 *                             of the stack already treats as valid (e.g. the
 *                               measured ~10.4MB /api/migration/scatter
 *                               response, or a large block). This is a
 *                               transport safety cap against a truly runaway
 *                               response, not a product-level size limit.
 *   NEXT_PUBLIC_NETWORK       Reused from the rest of the app: mainnet |
 *                             testnet | crosslink-testnet. Surfaced in
 *                             every v1 response's meta.network.
 *
 *   --- Scan endpoint (v1-only) safety controls ---
 *   These endpoints (/v1/scan/orchard, /v1/scan/lightwalletd) are public and
 *   proxy straight through to legacy handlers that already bound cost
 *   server-side (1,000,000 / 50,000 block ranges respectively, see
 *   server/api/routes/scan.js). v1 adds its OWN, stricter, independently
 *   configurable range caps and per-IP rate limits so the more-discoverable
 *   /v1 surface can't hand out a bigger cost knob than legacy intended.
 *
 *   V1_SCAN_ORCHARD_MAX_RANGE            Default: 50000 blocks/request.
 *   V1_SCAN_ORCHARD_RATE_LIMIT_MAX       Default: 5 requests.
 *   V1_SCAN_ORCHARD_RATE_LIMIT_WINDOW_MS Default: 60000 (1 minute).
 *   V1_SCAN_LIGHTWALLETD_MAX_RANGE            Default: 10000 blocks/request
 *                                              (lightwalletd scan is far more
 *                                              expensive per block: gRPC +
 *                                              parallel streaming + optional
 *                                              disk cache writes).
 *   V1_SCAN_LIGHTWALLETD_RATE_LIMIT_MAX       Default: 3 requests.
 *   V1_SCAN_LIGHTWALLETD_RATE_LIMIT_WINDOW_MS Default: 60000 (1 minute).
 */

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

const DEFAULT_MAX_RESPONSE_BYTES = 50 * 1024 * 1024; // 50MB — see docblock above

function parseIntOr(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function loadV1Config(env = process.env) {
  return {
    enabled: parseBool(env.API_V1_ENABLED, false),
    launched: parseBool(env.API_V1_LAUNCHED, false),
    previewKey: env.API_V1_PREVIEW_KEY || '',
    internalBaseUrl: (env.V1_INTERNAL_API_BASE_URL || 'http://127.0.0.1:3001').replace(/\/+$/, ''),
    internalServiceKey: env.V1_INTERNAL_SERVICE_KEY || '',
    internalTimeoutMs: parseIntOr(env.V1_INTERNAL_TIMEOUT_MS, 8000),
    maxResponseBytes: parseIntOr(env.V1_INTERNAL_MAX_RESPONSE_BYTES, DEFAULT_MAX_RESPONSE_BYTES),
    network: env.NEXT_PUBLIC_NETWORK || 'testnet',
    scan: {
      orchard: {
        maxRange: parseIntOr(env.V1_SCAN_ORCHARD_MAX_RANGE, 50_000),
        rateLimit: {
          max: parseIntOr(env.V1_SCAN_ORCHARD_RATE_LIMIT_MAX, 5),
          windowMs: parseIntOr(env.V1_SCAN_ORCHARD_RATE_LIMIT_WINDOW_MS, 60_000),
        },
      },
      lightwalletd: {
        maxRange: parseIntOr(env.V1_SCAN_LIGHTWALLETD_MAX_RANGE, 10_000),
        rateLimit: {
          max: parseIntOr(env.V1_SCAN_LIGHTWALLETD_RATE_LIMIT_MAX, 3),
          windowMs: parseIntOr(env.V1_SCAN_LIGHTWALLETD_RATE_LIMIT_WINDOW_MS, 60_000),
        },
      },
    },
  };
}

module.exports = { loadV1Config, parseBool, DEFAULT_MAX_RESPONSE_BYTES };
