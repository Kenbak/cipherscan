const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const crosslinkRouter = require('../routes/crosslink');
const { reportTimestamps } = require('../routes/crosslink/_helpers');

function createPool() {
  const nodes = new Map();
  return {
    nodes,
    async connect() { return this; },
    release() {},
    async query(sql, params = []) {
      if (/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL|SELECT pg_advisory_xact_lock)/.test(sql)) return { rows: [] };
      if (/DELETE FROM fork_monitor_nodes\s+WHERE \(ttl/.test(sql)) {
        for (const [name, node] of nodes) {
          if (node.expired) nodes.delete(name);
        }
        return { rows: [] };
      }
      if (/SELECT COUNT\(\*\)::int AS cnt FROM fork_monitor_nodes/.test(sql)) {
        return { rows: [{ cnt: nodes.size }] };
      }
      if (/SELECT owner_token_hash FROM fork_monitor_nodes/.test(sql)) {
        const node = nodes.get(params[0]);
        return { rows: node ? [{ owner_token_hash: node.ownerTokenHash }] : [] };
      }
      if (/INSERT INTO fork_monitor_nodes/.test(sql)) {
        nodes.set(params[0], { ownerTokenHash: params[8], tip: params[1], ttl: params[6] });
        return { rows: [], rowCount: 1 };
      }
      if (/DELETE FROM fork_monitor_nodes\s+WHERE name = \$1/.test(sql)) {
        const [name, isService, tokenHash] = params;
        const node = nodes.get(name);
        const allowed = Boolean(node && (isService || node.ownerTokenHash === tokenHash));
        if (allowed) nodes.delete(name);
        return { rows: [], rowCount: allowed ? 1 : 0 };
      }
      throw new Error(`Unexpected query in test: ${sql}`);
    },
  };
}

async function listen(app) {
  const server = await new Promise((resolve) => {
    const candidate = app.listen(0, '127.0.0.1', () => resolve(candidate));
  });
  return server;
}

async function request(server, path, options = {}) {
  const address = server.address();
  return fetch(`http://127.0.0.1:${address.port}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
}

test('fork-monitor registrations require the issued ownership token to update or delete', async (t) => {
  const previousServiceKeys = process.env.SERVICE_API_KEYS;
  process.env.SERVICE_API_KEYS = 'test-service-key';
  t.after(() => {
    reportTimestamps.clear();
    if (previousServiceKeys === undefined) delete process.env.SERVICE_API_KEYS;
    else process.env.SERVICE_API_KEYS = previousServiceKeys;
  });

  const writePool = createPool();
  const app = express();
  app.use(express.json());
  app.locals.pool = writePool;
  app.locals.writePool = writePool;
  app.locals.callZebraRPC = async () => null;
  app.locals.redisClient = null;
  app.use(crosslinkRouter);
  const server = await listen(app);
  t.after(() => server.close());

  const body = JSON.stringify({ name: 'owned-node', tip: 42, ttl: '__proto__' });
  const created = await request(server, '/api/crosslink/fork-monitor/report', { method: 'POST', body });
  assert.equal(created.status, 200);
  const creation = await created.json();
  assert.equal(writePool.nodes.get('owned-node').ttl, '24h');
  assert.match(creation.ownershipToken, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(
    writePool.nodes.get('owned-node').ownerTokenHash,
    crypto.createHash('sha256').update(creation.ownershipToken).digest('hex'),
  );

  reportTimestamps.clear();
  const rejectedUpdate = await request(server, '/api/crosslink/fork-monitor/report', {
    method: 'POST',
    body,
    headers: { 'x-node-token': 'wrong-token' },
  });
  assert.equal(rejectedUpdate.status, 409);

  reportTimestamps.clear();
  const acceptedUpdate = await request(server, '/api/crosslink/fork-monitor/report', {
    method: 'POST',
    body,
    headers: { 'x-node-token': creation.ownershipToken },
  });
  assert.equal(acceptedUpdate.status, 200);
  assert.equal((await acceptedUpdate.json()).ownershipToken, undefined);

  const rejectedDelete = await request(server, '/api/crosslink/fork-monitor/report/owned-node', {
    method: 'DELETE',
    headers: { 'x-node-token': 'wrong-token' },
  });
  assert.equal(rejectedDelete.status, 404);

  const acceptedDelete = await request(server, '/api/crosslink/fork-monitor/report/owned-node', {
    method: 'DELETE',
    headers: { 'x-node-token': creation.ownershipToken },
  });
  assert.equal(acceptedDelete.status, 200);
  assert.equal(writePool.nodes.has('owned-node'), false);
});

async function registryServer(t, pool) {
  const app = express();
  app.use(express.json());
  app.locals.pool = pool;
  app.locals.writePool = pool;
  app.locals.redisClient = null;
  app.use(crosslinkRouter);
  const server = await listen(app);
  t.after(() => { reportTimestamps.clear(); server.close(); });
  return server;
}

test('full registry preserves owners and still accepts authenticated reports', async t => {
  const pool = createPool();
  const token = 'owner-token';
  for (let i = 0; i < 100; i++) pool.nodes.set(`node-${i}`, {
    ownerTokenHash: crypto.createHash('sha256').update(token).digest('hex'), tip: 1,
  });
  const server = await registryServer(t, pool);
  const rejected = await request(server, '/api/crosslink/fork-monitor/report', {
    method: 'POST', body: JSON.stringify({ name: 'outsider', tip: 2 }),
  });
  assert.equal(rejected.status, 409);
  assert.equal(pool.nodes.size, 100);
  assert.ok(pool.nodes.has('node-0'));
  const accepted = await request(server, '/api/crosslink/fork-monitor/report', {
    method: 'POST', body: JSON.stringify({ name: 'node-0', tip: 3 }),
    headers: { 'x-node-token': token },
  });
  assert.equal(accepted.status, 200);
  assert.equal(pool.nodes.get('node-0').tip, 3);
});

test('expired registrations free capacity without evicting a live owner', async t => {
  const pool = createPool();
  for (let i = 0; i < 100; i++) pool.nodes.set(`node-${i}`, { ownerTokenHash: 'hash', expired: i === 99 });
  const server = await registryServer(t, pool);
  const result = await request(server, '/api/crosslink/fork-monitor/report', {
    method: 'POST', body: JSON.stringify({ name: 'replacement', tip: 2 }),
  });
  assert.equal(result.status, 200);
  assert.equal(pool.nodes.size, 100);
  assert.ok(pool.nodes.has('node-0'));
  assert.equal(pool.nodes.has('node-99'), false);
});

test('one client cannot fill the registry by rotating names', async t => {
  const pool = createPool();
  const server = await registryServer(t, pool);
  let denied = false;
  for (let i = 0; i < 6; i++) {
    const result = await request(server, '/api/crosslink/fork-monitor/report', {
      method: 'POST', body: JSON.stringify({ name: `rotating-${i}`, tip: 2 }),
    });
    if (result.status === 429) { denied = true; assert.ok(result.headers.get('retry-after')); break; }
    assert.equal(result.status, 200);
  }
  assert.equal(denied, true);
  assert.ok(pool.nodes.size <= 5);
});
