'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const http = require('node:http');
function request(url, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: { get: name => res.headers[name] ?? null }, json: async () => JSON.parse(body) }));
    });
    req.on('error', reject);
    req.end();
  });
}
const { createLocalPreview } = require('../../dev-v1');

test('local preview rejects foreign origins, rebinding hosts, and all mutations before dispatch', async () => {
  // No upstream listener: denied requests must never reach the upstream.
  const preview = createLocalPreview({ upstream: 'http://127.0.0.1:1', port: 3002 });
  const server = preview.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await request(`${base}/v1/transactions/broadcast`, { method, headers: { Host: '127.0.0.1:3002' } });
      assert.equal(response.status, 405);
      assert.equal((await response.json()).detail, 'This local mainnet preview is read-only.');
    }
    const rebinding = await request(`${base}/v1/openapi.json`, { headers: { Host: 'attacker.example:3002' } });
    assert.equal(rebinding.status, 403);
    const foreign = await request(`${base}/v1/openapi.json`, { headers: { Host: 'localhost:3002', Origin: 'https://attacker.example' } });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.headers.get('access-control-allow-origin'), null);
    const allowed = await request(`${base}/v1/openapi.json`, { headers: { Host: 'localhost:3002', Origin: 'http://localhost:3000' } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.equal(allowed.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.ok((await allowed.json()).paths['/v1/network/stats']);
  } finally {
    preview.stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});

test('preview refuses credential-bearing, non-origin and cleartext public upstreams', () => {
  for (const upstream of ['https://user:secret@example.com', 'https://example.com/api', 'http://example.com', 'https://example.com/?secret=1']) {
    assert.throws(() => createLocalPreview({ upstream }));
  }
});
