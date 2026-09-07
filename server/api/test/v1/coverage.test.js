const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const express = require('express');
const { MANIFEST } = require('../../v1/inventory/manifest');
const createV1Router = require('../../v1');

test('every adapter dispatches its declared method/path, preserves data and uses the v1 envelope', async t => {
  const legacy = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://legacy');
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const entry = MANIFEST.find(e => e.method === req.method && e.legacyPath.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, 'sample') === url.pathname);
      res.setHeader('Content-Type', 'application/json');
      if (!entry) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Unexpected upstream route' })); }
      const data = {
        success: true, height: 42, route: url.pathname, method: req.method,
        body: raw ? JSON.parse(raw) : null,
        query: Object.fromEntries(url.searchParams),
        precisionExample: '900719925474099312345', zero: 0, unavailable: null,
        nested: { success: false, records: [{ label: 'retained', amount: '0' }] },
        serviceKeyPresent: Boolean(req.headers['x-service-key']), nodeToken: req.headers['x-node-token'] ?? null,
      };
      if (entry.v1.path === '/v1/addresses/:address') Object.assign(data, { balance: 10000000000000000, balanceZat: '10000000000000003', totalReceived: 10000000000000000, totalReceivedZat: '10000000000000004', totalSent: 1, totalSentZat: '1' });
      if (entry.v1.shape === 'list') Object.assign(data, { [entry.v1.listKey]: [], pagination: { total: 0 } });
      res.end(JSON.stringify(data));
    });
  }).listen(0, '127.0.0.1');
  await once(legacy, 'listening');
  const router = createV1Router({ API_V1_ENABLED: 'true', API_V1_LAUNCHED: 'true', NEXT_PUBLIC_NETWORK: 'mainnet', V1_INTERNAL_SERVICE_KEY: 'internal-only', V1_INTERNAL_API_BASE_URL: `http://127.0.0.1:${legacy.address().port}` });
  const app = express(); app.use('/v1', router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    for (const entry of MANIFEST.filter(e => e.v1.status === 'adapter')) {
      await t.test(`${entry.method} ${entry.v1.path}`, async () => {
        const path = entry.v1.path.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, 'sample');
        const init = { method: entry.method, headers: { 'Content-Type': 'application/json', 'X-Node-Token': 'owner-only', 'Authorization': 'Bearer must-not-forward' } };
        if (entry.method === 'POST') init.body = JSON.stringify({ startHeight: 1, endHeight: 2, rawTx: 'aa', txids: [] });
        const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, init);
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.meta.network, 'mainnet');
        assert.equal(body.meta.source.observedAt, null, 'request generation must not masquerade as data observation');
        assert.equal(body.meta.source.indexedHeight, null);
        if (entry.v1.shape === 'list') {
          assert.deepEqual(body.data, []);
          assert.equal(body.meta.page.hasNext, false);
          assert.equal(body.meta.page.nextCursor, null);
        } else {
          assert.equal(body.data.route, entry.legacyPath.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, 'sample'));
          assert.equal(body.data.method, entry.method);
          if (entry.v1.path === '/v1/addresses/:address') {
            assert.equal(body.data.balance, '10000000000000003');
            assert.equal(body.data.totalReceived, '10000000000000004');
            assert.equal(body.data.totalSent, '1');
          }
          assert.equal(body.data.precisionExample, '900719925474099312345');
          assert.equal(body.data.zero, 0);
          assert.equal(body.data.unavailable, null);
          assert.equal(Object.hasOwn(body.data, 'success'), false);
          assert.deepEqual(body.data.nested, { success: false, records: [{ label: 'retained', amount: '0' }] });
          assert.equal(body.data.serviceKeyPresent, !entry.v1.forwardNodeToken && !entry.v1.forwardPaymentAuth);
          assert.equal(body.data.nodeToken, entry.v1.forwardNodeToken ? 'owner-only' : null);
          if (entry.method === 'POST') assert.deepEqual(body.data.body, JSON.parse(init.body));
        }
      });
    }
  } finally {
    router.__stopRateLimiters();
    server.closeAllConnections(); legacy.closeAllConnections();
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => legacy.close(resolve))]);
  }
});
