/**
 * Integration/contract tests for the mounted /v1 router.
 *
 * Strategy: start a tiny mock "legacy API" over plain node:http (standing
 * in for server/api/server.js + routes/**), then mount the real
 * createV1Router() on its own express app pointed at that mock via
 * V1_INTERNAL_API_BASE_URL. All assertions go through real HTTP requests
 * (global fetch) — no route-file internals are imported or duplicated.
 *
 * Run: node --test server/api/test/v1/routes.test.js
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');
const express = require('express');

const createV1Router = require('../../v1/index');
const { decodeCursor } = require('../../v1/lib/cursor');

/** Builds a JSON body of at least `minBytes`, made of small tx-like records (like /api/migration/scatter). */
function buildLargeScatterPayload(minBytes) {
  const rows = [];
  let approxBytes = 50; // wrapper overhead
  let i = 0;
  while (approxBytes < minBytes) {
    const row = {
      txid: i.toString(16).padStart(64, '0'),
      block_height: 3_000_000 + i,
      block_time: 1_700_000_000 + i,
      ironwood_in_zat: '100000000',
      orchard_out_zat: '50000000',
      is_coinbase: false,
      privacy: i % 2 === 0 ? 'denominated' : 'distinctive',
    };
    rows.push(row);
    approxBytes += 180; // rough per-row JSON size, refined by the real check below
    i++;
  }
  const body = { success: true, denominatedCount: rows.length, distinctiveCount: 0, rows };
  // Top up precisely in case the per-row estimate undershot.
  const text = JSON.stringify(body);
  if (Buffer.byteLength(text) < minBytes) {
    const padNeeded = minBytes - Buffer.byteLength(text) + 16;
    body.padding = 'x'.repeat(padNeeded);
  }
  return body;
}

function startMockLegacyServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://internal');
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'GET' && url.pathname === '/api/info') {
      return send(200, { blocks: 42, height: 42 });
    }

    if (req.method === 'GET' && url.pathname === '/api/blocks/list') {
      const cursor = url.searchParams.get('cursor');
      if (!cursor) {
        return send(200, {
          success: true,
          blocks: [{ height: 100, total_fees: '12345' }],
          pagination: { limit: 50, hasNext: true, hasPrev: false, nextCursor: 99, prevCursor: null },
        });
      }
      // second page — echoes back what it received so the test can assert forwarding worked
      return send(200, {
        success: true,
        blocks: [{ height: Number(cursor), total_fees: '999', echoedDirection: url.searchParams.get('direction') }],
        pagination: { limit: 50, hasNext: false, hasPrev: true, nextCursor: null, prevCursor: 1 },
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/block/missing') {
      return send(404, { error: 'Block not found' });
    }

    if (req.method === 'GET' && url.pathname === '/api/block/slow') {
      // Never responds within the test's configured timeout.
      setTimeout(() => send(200, { height: 1 }), 5000);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/tx/broadcast') {
      return send(200, { success: true, txid: 'deadbeef' });
    }

    if (req.method === 'GET' && url.pathname === '/api/network/health') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
        ETag: '"mock-etag-123"',
        'X-CipherScan-Cache': 'hit',
        'RateLimit-Limit': '600',
        'RateLimit-Remaining': '599',
        'RateLimit-Reset': '42',
        // Deliberately unsafe headers that must NOT be relayed onto the v1 response:
        'Set-Cookie': 'session=should-not-leak; HttpOnly',
        'X-Powered-By': 'Express',
        Server: 'nginx/should-not-leak',
      });
      return res.end(JSON.stringify({ success: true, healthy: true }));
    }

    if (req.method === 'GET' && url.pathname === '/api/migration/scatter') {
      const minBytes = Number(url.searchParams.get('__test_min_bytes')) || 0;
      if (minBytes > 0) {
        return send(200, buildLargeScatterPayload(minBytes));
      }
      return send(200, { success: true, denominatedCount: 0, distinctiveCount: 0, rows: [] });
    }

    if (req.method === 'POST' && url.pathname === '/api/scan/orchard') {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        const { startHeight, endHeight } = JSON.parse(raw || '{}');
        send(200, {
          startHeight,
          endHeight,
          totalBlocks: endHeight - startHeight + 1,
          orchardTransactions: 0,
          transactions: [],
        });
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/lightwalletd/scan') {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        const { startHeight, endHeight } = JSON.parse(raw || '{}');
        send(200, { success: true, blocksScanned: 0, startHeight, endHeight, cachedBlocks: 0, fetchedBlocks: 0, blocks: [] });
      });
      return;
    }

    send(404, { error: 'not found in mock' });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function startV1App(envOverrides) {
  const app = express();
  const router = createV1Router(envOverrides);
  app.use('/v1', router);
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function withServers(envExtra, fn) {
  const legacy = await startMockLegacyServer();
  const legacyPort = legacy.address().port;
  const v1 = await startV1App({
    API_V1_ENABLED: 'true',
    API_V1_LAUNCHED: 'true',
    NEXT_PUBLIC_NETWORK: 'testnet',
    V1_INTERNAL_API_BASE_URL: `http://127.0.0.1:${legacyPort}`,
    V1_INTERNAL_TIMEOUT_MS: '500',
    ...envExtra,
  });
  const v1Port = v1.address().port;
  try {
    await fn(`http://127.0.0.1:${v1Port}`);
  } finally {
    await new Promise((r) => v1.close(r));
    await new Promise((r) => legacy.close(r));
  }
}

// ---------------------------------------------------------------------------
// Feature gate
// ---------------------------------------------------------------------------

test('feature gate: API_V1_ENABLED=false -> generic 404, indistinguishable from an unmounted route', async () => {
  await withServers({ API_V1_ENABLED: 'false', API_V1_LAUNCHED: 'false' }, async (base) => {
    const res = await fetch(`${base}/v1/network/info`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.title, 'API Version Not Enabled');
  });
});

test('feature gate: enabled + not launched + no preview key -> 401', async () => {
  await withServers({ API_V1_LAUNCHED: 'false', API_V1_PREVIEW_KEY: 'secret123' }, async (base) => {
    const res = await fetch(`${base}/v1/network/info`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.title, 'Preview Access Required');
  });
});

test('feature gate: enabled + not launched + wrong preview key -> 401', async () => {
  await withServers({ API_V1_LAUNCHED: 'false', API_V1_PREVIEW_KEY: 'secret123' }, async (base) => {
    const res = await fetch(`${base}/v1/network/info`, { headers: { 'X-API-Preview-Key': 'wrong' } });
    assert.equal(res.status, 401);
  });
});

test('feature gate: enabled + not launched + correct preview key -> passes through', async () => {
  await withServers({ API_V1_LAUNCHED: 'false', API_V1_PREVIEW_KEY: 'secret123' }, async (base) => {
    const res = await fetch(`${base}/v1/network/info`, { headers: { 'X-API-Preview-Key': 'secret123' } });
    assert.equal(res.status, 200);
  });
});

test('feature gate: enabled + no preview key configured -> fails closed (401), never open', async () => {
  await withServers({ API_V1_LAUNCHED: 'false', API_V1_PREVIEW_KEY: '' }, async (base) => {
    const res = await fetch(`${base}/v1/network/info`);
    assert.equal(res.status, 401);
  });
});

test('feature gate: launched=true -> no preview key needed', async () => {
  await withServers({ API_V1_LAUNCHED: 'true' }, async (base) => {
    const res = await fetch(`${base}/v1/network/info`);
    assert.equal(res.status, 200);
  });
});

test('OpenAPI contract is served inside the same v1 feature gate', async () => {
  await withServers({ API_V1_LAUNCHED: 'true' }, async (base) => {
    const res = await fetch(`${base}/v1/openapi.json`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control'), /max-age=300/);
    const document = await res.json();
    assert.equal(document.openapi, '3.1.0');
    assert.ok(document.paths['/v1/blocks']);
  });
});

// ---------------------------------------------------------------------------
// Envelope / passthrough shape
// ---------------------------------------------------------------------------

test('passthrough adapter: /v1/network/info wraps the legacy body in {data, meta}', async () => {
  await withServers({}, async (base) => {
    const res = await fetch(`${base}/v1/network/info`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
    const body = await res.json();
    assert.deepEqual(body.data, { blocks: 42, height: 42 });
    assert.ok(body.meta.requestId);
    assert.equal(body.meta.network, 'testnet');
    assert.ok(body.meta.generatedAt);
    assert.ok(body.meta.cache);
    assert.ok(res.headers.get('x-request-id'));
  });
});

// ---------------------------------------------------------------------------
// List shape + cursor round-trip + zatoshi conversion
// ---------------------------------------------------------------------------

test('list adapter: /v1/blocks returns items as data + meta.page, and converts total_fees to a zatoshi string', async () => {
  await withServers({}, async (base) => {
    const res = await fetch(`${base}/v1/blocks`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(Array.isArray(body.data), true);
    assert.equal(body.data[0].height, 100);
    assert.equal(body.data[0].total_fees, '12345');
    assert.equal(typeof body.data[0].total_fees, 'string');
    assert.equal(body.meta.page.hasNext, true);
    assert.equal(body.meta.page.hasPrev, false);
    assert.ok(body.meta.page.nextCursor);
    assert.equal(body.meta.page.prevCursor, null);

    const decoded = decodeCursor(body.meta.page.nextCursor);
    assert.equal(decoded.cursor, 99);
    assert.equal(decoded.direction, 'next');
  });
});

test('list adapter: a returned cursor round-trips correctly to the next page', async () => {
  await withServers({}, async (base) => {
    const first = await (await fetch(`${base}/v1/blocks`)).json();
    const cursor = first.meta.page.nextCursor;

    const second = await fetch(`${base}/v1/blocks?cursor=${encodeURIComponent(cursor)}`);
    assert.equal(second.status, 200);
    const body = await second.json();
    assert.equal(body.data[0].height, 99); // mock echoes the forwarded cursor value as height
    assert.equal(body.data[0].echoedDirection, 'next');
    assert.equal(body.meta.page.hasNext, false);
    assert.equal(body.meta.page.hasPrev, true);
  });
});

test('list adapter: a malformed cursor is rejected with a 400 validation-error, not a 500', async () => {
  await withServers({}, async (base) => {
    const res = await fetch(`${base}/v1/blocks?cursor=not-a-real-cursor`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.title, 'Validation Error');
    assert.equal(body.errors[0].field, 'cursor');
  });
});

// ---------------------------------------------------------------------------
// Error relay
// ---------------------------------------------------------------------------

test('adapter relays a legacy 404 as an RFC 9457 not-found problem, preserving the safe detail message', async () => {
  await withServers({}, async (base) => {
    const res = await fetch(`${base}/v1/blocks/missing`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type'), /^application\/problem\+json/);
    const body = await res.json();
    assert.equal(body.title, 'Resource Not Found');
    assert.equal(body.detail, 'Block not found');
    assert.ok(body.type.startsWith('https://'));
  });
});

test('adapter converts an internal-dispatch timeout into a 504 upstream-timeout problem', async () => {
  await withServers({}, async (base) => {
    const res = await fetch(`${base}/v1/blocks/slow`);
    assert.equal(res.status, 504);
    const body = await res.json();
    assert.equal(body.title, 'Upstream Service Timeout');
  });
});

// ---------------------------------------------------------------------------
// Scan endpoints: public → must be adapters with v1-layer cost validation +
// per-IP rate limiting (not stubs) — see requirement (2) / manifest notes.
// ---------------------------------------------------------------------------

test('scan/orchard: missing fields fail v1 validation with a 400, without ever dispatching to legacy', async () => {
  await withServers({}, async (base) => {
    const res = await fetch(`${base}/v1/scan/orchard`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.title, 'Validation Error');
    assert.ok(body.errors.some((e) => e.field === 'startHeight'));
    assert.ok(body.errors.some((e) => e.field === 'endHeight'));
  });
});

test('scan/orchard: a range beyond the v1 cap is rejected even though legacy would accept it', async () => {
  await withServers({ V1_SCAN_ORCHARD_MAX_RANGE: '100' }, async (base) => {
    const res = await fetch(`${base}/v1/scan/orchard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startHeight: 0, endHeight: 1000 }), // 1001 blocks > 100 cap
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.errors[0].issue, /exceeds the v1 limit/);
  });
});

test('scan/orchard: a valid, in-range request is proxied to legacy and the result relayed', async () => {
  await withServers({ V1_SCAN_ORCHARD_MAX_RANGE: '1000' }, async (base) => {
    const res = await fetch(`${base}/v1/scan/orchard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startHeight: 100, endHeight: 200 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.totalBlocks, 101);
  });
});

test('scan/orchard: per-IP rate limit trips before a request beyond the configured max', async () => {
  await withServers({ V1_SCAN_ORCHARD_RATE_LIMIT_MAX: '1', V1_SCAN_ORCHARD_RATE_LIMIT_WINDOW_MS: '60000' }, async (base) => {
    const payload = JSON.stringify({ startHeight: 0, endHeight: 10 });
    const first = await fetch(`${base}/v1/scan/orchard`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
    assert.equal(first.status, 200);

    const second = await fetch(`${base}/v1/scan/orchard`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
    assert.equal(second.status, 429);
    assert.ok(second.headers.get('retry-after'));
    const body = await second.json();
    assert.equal(body.title, 'Too Many Requests');
  });
});

test('scan/lightwalletd: omitting endHeight is rejected at the v1 layer (legacy would default to chain tip)', async () => {
  await withServers({}, async (base) => {
    const res = await fetch(`${base}/v1/scan/lightwalletd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startHeight: 100 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.errors.some((e) => e.field === 'endHeight' && /chain tip/.test(e.issue)));
  });
});

test('scan/lightwalletd: a valid, in-range request is proxied to legacy and the result relayed', async () => {
  await withServers({ V1_SCAN_LIGHTWALLETD_MAX_RANGE: '1000' }, async (base) => {
    const res = await fetch(`${base}/v1/scan/lightwalletd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startHeight: 100, endHeight: 200 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.startHeight, 100);
    assert.equal(body.data.endHeight, 200);
  });
});

// ---------------------------------------------------------------------------
// Response size cap: configurable, must not reject currently-valid public
// payloads (e.g. the measured ~10.4MB /api/migration/scatter response),
// while still rejecting a truly oversized body — see requirement (1).
// ---------------------------------------------------------------------------

test('response cap: a real >10.4MB /v1/migration/scatter payload is NOT rejected under the default (50MB) cap', async () => {
  await withServers({}, async (base) => {
    const minBytes = 11 * 1024 * 1024; // safely above the measured ~10.4MB
    const res = await fetch(`${base}/v1/migration/scatter?__test_min_bytes=${minBytes}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.rows.length > 0);
    assert.equal(body.data.rows[0].ironwood_in_zat, '100000000'); // full payload intact, not truncated
  });
});

test('response cap: a body larger than a configured (small, test-only) cap is rejected as a 502 upstream error', async () => {
  await withServers({ V1_INTERNAL_MAX_RESPONSE_BYTES: '1000' }, async (base) => {
    const res = await fetch(`${base}/v1/migration/scatter?__test_min_bytes=${5000}`);
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.title, 'Upstream Service Error');
  });
});

// ---------------------------------------------------------------------------
// Header relay allowlist — see requirement (3).
// ---------------------------------------------------------------------------

test('header relay: safe transport/cache/quota headers are relayed; unsafe ones are stripped', async () => {
  await withServers({}, async (base) => {
    const res = await fetch(`${base}/v1/network/health`);
    assert.equal(res.status, 200);

    // Allowlisted — must pass through unchanged.
    assert.equal(res.headers.get('cache-control'), 'public, s-maxage=30, stale-while-revalidate=300');
    assert.equal(res.headers.get('etag'), '"mock-etag-123"');
    assert.equal(res.headers.get('x-cipherscan-cache'), 'hit');
    assert.equal(res.headers.get('ratelimit-limit'), '600');
    assert.equal(res.headers.get('ratelimit-remaining'), '599');
    assert.equal(res.headers.get('ratelimit-reset'), '42');

    // Not allowlisted — must never reach the v1 client. (X-Powered-By is
    // also stripped, but that's Express's own default header, not a relay
    // leak — see index.js's dedicated removeHeader call and its test.)
    assert.equal(res.headers.get('set-cookie'), null);
    assert.notEqual(res.headers.get('server'), 'nginx/should-not-leak');
  });
});

test('X-Powered-By (Express\'s own default fingerprint header) is stripped on every /v1 response', async () => {
  await withServers({}, async (base) => {
    const res = await fetch(`${base}/v1/network/info`);
    assert.equal(res.headers.get('x-powered-by'), null);
  });
});

test('header relay: v1 adds its own Server-Timing entry for the internal hop', async () => {
  await withServers({}, async (base) => {
    const res = await fetch(`${base}/v1/network/health`);
    const timing = res.headers.get('server-timing');
    assert.ok(timing, 'expected a Server-Timing header');
    assert.match(timing, /internal;dur=\d+(\.\d+)?/);
  });
});

test('header relay: a legacy-originated error response also carries the allowlisted headers + Server-Timing', async () => {
  await withServers({}, async (base) => {
    const res = await fetch(`${base}/v1/blocks/missing`); // legacy mock returns 404 with no special headers, sanity-checks the path still sets Server-Timing on errors
    assert.equal(res.status, 404);
    assert.ok(res.headers.get('server-timing'));
  });
});

// ---------------------------------------------------------------------------
// Write route passthrough
// ---------------------------------------------------------------------------

test('write adapter: POST /v1/transactions/broadcast forwards the body and relays the legacy result', async () => {
  await withServers({}, async (base) => {
    const res = await fetch(`${base}/v1/transactions/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawTx: 'deadbeef' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.txid, 'deadbeef');
  });
});

// ---------------------------------------------------------------------------
// Unknown v1 route vs. disabled-feature 404 (must be distinguishable when enabled)
// ---------------------------------------------------------------------------

test('unknown /v1 route (feature enabled) returns a distinct not-found problem, not the feature-disabled one', async () => {
  await withServers({}, async (base) => {
    const res = await fetch(`${base}/v1/this-route-does-not-exist`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.title, 'Resource Not Found');
  });
});
