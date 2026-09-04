'use strict';

/**
 * Production-readiness checks for API_LIST_CACHE_ENABLED.
 *
 * This flag gates whether list-response caching goes through Redis at all
 * (server.js wires `createListCache({ redisClient })` with no explicit
 * `enabled`, so the module's env-var default is what actually runs in
 * production). Two properties matter for safety:
 *
 *   1. Fail-closed default: if the env var is ever unset/misconfigured,
 *      caching must be OFF (never accidentally caching without the Redis
 *      privacy hardening called out in server/deploy/README.md), not ON.
 *   2. Exact-match gate: only the literal string '1' enables it. Any other
 *      truthy-looking value ('true', 'yes', '01', whitespace) must NOT
 *      enable it, so a typo'd env value fails safe instead of silently
 *      turning caching on in an environment that never provisioned Redis.
 *
 * These tests exercise `createListCache()`'s own env-var resolution (not a
 * value the test passes in), and cross-check the repo's own config
 * templates (.env.example, docker-compose.yml, .env.docker.example) for
 * drift. No production environment file is read or written by this suite.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createListCache } = require('../list-cache');

const ENV_VAR = 'API_LIST_CACHE_ENABLED';

function withEnv(value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, ENV_VAR);
  const prev = process.env[ENV_VAR];
  try {
    if (value === undefined) delete process.env[ENV_VAR];
    else process.env[ENV_VAR] = value;
    return fn();
  } finally {
    if (had) process.env[ENV_VAR] = prev;
    else delete process.env[ENV_VAR];
  }
}

// ─── Env-var default resolution (fail-closed) ───────────────────────────────

test('API_LIST_CACHE_ENABLED unset → caching defaults to disabled', () => {
  withEnv(undefined, () => {
    const cache = createListCache({ redisClient: { isReady: true } });
    assert.equal(cache.enabled, false);
  });
});

test('API_LIST_CACHE_ENABLED="1" (exact) → caching enabled', () => {
  withEnv('1', () => {
    const cache = createListCache({ redisClient: { isReady: true } });
    assert.equal(cache.enabled, true);
  });
});

test('API_LIST_CACHE_ENABLED="0" → caching disabled', () => {
  withEnv('0', () => {
    const cache = createListCache({ redisClient: { isReady: true } });
    assert.equal(cache.enabled, false);
  });
});

test('API_LIST_CACHE_ENABLED with a truthy-looking but non-"1" value stays disabled', () => {
  for (const value of ['true', 'yes', 'on', 'TRUE', '01', ' 1', '1 ', 'enabled']) {
    withEnv(value, () => {
      const cache = createListCache({ redisClient: { isReady: true } });
      assert.equal(cache.enabled, false, `expected "${value}" to NOT enable caching`);
    });
  }
});

test('explicit `enabled` option passed by the caller always wins over the env var', () => {
  withEnv('1', () => {
    const cache = createListCache({ redisClient: { isReady: true }, enabled: false });
    assert.equal(cache.enabled, false);
  });
  withEnv(undefined, () => {
    const cache = createListCache({ redisClient: { isReady: true }, enabled: true });
    assert.equal(cache.enabled, true);
  });
});

// ─── Fail-open behavior when enabled but Redis isn't usable ────────────────
// (Guards the other half of the production story: enabling the flag must
// never turn a Redis outage into an API outage — see server/deploy/README.md
// "The API fails open to PostgreSQL if Redis is unavailable".)

test('enabled=true but no redisClient configured → getOrLoad still serves from the loader (fail-open)', async () => {
  const cache = createListCache({ enabled: true }); // no redisClient at all
  const result = await cache.getOrLoad({
    family: 'test-family',
    params: { a: 1 },
    freshTtlSeconds: 60,
    staleTtlSeconds: 600,
    load: async () => ({ ok: true }),
  });
  assert.equal(result.state, 'MISS');
  assert.deepEqual(result.value, { ok: true });
});

test('enabled=true with a not-yet-connected redisClient → getOrLoad still serves from the loader (fail-open)', async () => {
  const cache = createListCache({ enabled: true, redisClient: { isReady: false } });
  const result = await cache.getOrLoad({
    family: 'test-family',
    params: { a: 1 },
    freshTtlSeconds: 60,
    staleTtlSeconds: 600,
    load: async () => ({ ok: true }),
  });
  assert.equal(result.state, 'MISS');
  assert.deepEqual(result.value, { ok: true });
});

// ─── Config template consistency (repo files, not production secrets) ─────

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', '..', relativePath), 'utf8');
}

test('config: server/api/.env.example documents the production-safe value and Redis privacy note', () => {
  const contents = readRepoFile('server/api/.env.example');
  assert.match(contents, /^API_LIST_CACHE_ENABLED=1$/m,
    '.env.example should show the production value (1) — it documents mainnet, not a local dev default');
  assert.match(contents, /Redis must remain private/i,
    '.env.example should keep the privacy warning next to the cache flag so enabling it is never done casually');
});

test('config: docker-compose.yml defaults the flag to disabled for local/dev', () => {
  const contents = readRepoFile('docker-compose.yml');
  assert.match(contents, /API_LIST_CACHE_ENABLED:\s*\$\{API_LIST_CACHE_ENABLED:-0\}/,
    'docker-compose should default to disabled (0) so a fresh local stack without Redis hardening never silently caches');
});

test('config: .env.docker.example mirrors the docker-compose safe default', () => {
  const contents = readRepoFile('.env.docker.example');
  assert.match(contents, /^API_LIST_CACHE_ENABLED=0$/m,
    '.env.docker.example should default to disabled (0), matching docker-compose.yml');
});

test('config: all three env templates agree on the companion tuning keys', () => {
  const files = ['server/api/.env.example', '.env.docker.example'];
  for (const file of files) {
    const contents = readRepoFile(file);
    assert.match(contents, /^API_LIST_CACHE_MAX_ENTRIES=\d+$/m, `${file} should set API_LIST_CACHE_MAX_ENTRIES`);
    assert.match(contents, /^API_LIST_CACHE_REDIS_TIMEOUT_MS=\d+$/m, `${file} should set API_LIST_CACHE_REDIS_TIMEOUT_MS`);
  }
  const compose = readRepoFile('docker-compose.yml');
  assert.match(compose, /API_LIST_CACHE_MAX_ENTRIES:\s*\$\{API_LIST_CACHE_MAX_ENTRIES:-\d+\}/);
  assert.match(compose, /API_LIST_CACHE_REDIS_TIMEOUT_MS:\s*\$\{API_LIST_CACHE_REDIS_TIMEOUT_MS:-\d+\}/);
});
