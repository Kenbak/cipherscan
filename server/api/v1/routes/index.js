/**
 * server/api/v1/routes/index.js
 *
 * Assembles the actual mounted /v1 routes from the manifest
 * (server/api/v1/inventory/manifest.js). This file has almost no logic —
 * that's intentional; it exists so route registration itself is
 * inventory-driven and cannot silently drift from the manifest that
 * server/api/test/v1/*.test.js and server/api/openapi/v1.yaml are checked
 * against.
 */

const express = require('express');
const { MANIFEST } = require('../inventory/manifest');
const { buildAdapterHandler, buildStubHandler } = require('../lib/build-route');
const { createRateLimiter } = require('../lib/rate-limit');

/**
 * Manifest entries declare `v1.path` fully-qualified (e.g. "/v1/blocks") so
 * the OpenAPI doc, README, and tests can reference the real external path.
 * This router, however, IS what the parent mounts at "/v1" (see
 * server/api/v1/index.js + README "Mount instructions") — Express would
 * otherwise double the prefix into "/v1/v1/blocks". Strip it once, here,
 * at the single place routes are actually registered.
 */
function toRouterPath(v1Path) {
  if (!v1Path.startsWith('/v1')) {
    throw new Error(`v1 routes: expected v1.path to start with "/v1", got "${v1Path}"`);
  }
  const relative = v1Path.slice('/v1'.length);
  return relative === '' ? '/' : relative;
}

/**
 * Resolves a manifest entry's `v1.rateLimitKey` (e.g. 'scanOrchard') into
 * the concrete { windowMs, max } for that endpoint from config.scan.*.
 * Kept as a lookup table (rather than baking numbers into the manifest)
 * so config.js stays the single tunable source for these values.
 */
function resolveRateLimitOptions(rateLimitKey, config) {
  const table = {
    scanOrchard: config.scan.orchard.rateLimit,
    scanLightwalletd: config.scan.lightwalletd.rateLimit,
  };
  const options = table[rateLimitKey];
  if (!options) {
    throw new Error(`v1 routes: unknown rateLimitKey "${rateLimitKey}"`);
  }
  return options;
}

/**
 * @param {ReturnType<typeof import('../lib/internal-client').createInternalClient>} internalClient
 * @param {ReturnType<typeof import('../config').loadV1Config>} config
 */
function buildV1Routes(internalClient, config) {
  const router = express.Router();
  let mounted = 0;
  const limiters = []; // for test/shutdown cleanup (limiter._stop())

  for (const entry of MANIFEST) {
    if (entry.v1.status === 'excluded') continue;

    const method = entry.method.toLowerCase();
    if (typeof router[method] !== 'function') {
      throw new Error(`v1 routes: unsupported HTTP method "${entry.method}" for ${entry.legacyPath}`);
    }

    const handler = entry.v1.status === 'adapter'
      ? buildAdapterHandler(entry, internalClient, config)
      : buildStubHandler(entry);

    const middlewares = [];
    if (entry.v1.rateLimitKey) {
      const options = resolveRateLimitOptions(entry.v1.rateLimitKey, config);
      const limiter = createRateLimiter({ ...options, key: entry.v1.path });
      limiters.push(limiter);
      middlewares.push(limiter);
    }

    router[method](toRouterPath(entry.v1.path), ...middlewares, handler);
    mounted++;
  }

  router.mountedCount = mounted;
  router.__stopRateLimiters = () => limiters.forEach((l) => l._stop?.());
  return router;
}

module.exports = { buildV1Routes };
