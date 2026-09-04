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
    async query(sql, params = []) {
      if (/SELECT COUNT\(\*\)::int AS cnt FROM fork_monitor_nodes/.test(sql)) {
        return { rows: [{ cnt: nodes.size }] };
      }
      if (/SELECT owner_token_hash FROM fork_monitor_nodes/.test(sql)) {
        const node = nodes.get(params[0]);
        return { rows: node ? [{ owner_token_hash: node.ownerTokenHash }] : [] };
      }
      if (/INSERT INTO fork_monitor_nodes/.test(sql)) {
        nodes.set(params[0], { ownerTokenHash: params[8] });
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

  const body = JSON.stringify({ name: 'owned-node', tip: 42 });
  const created = await request(server, '/api/crosslink/fork-monitor/report', { method: 'POST', body });
  assert.equal(created.status, 200);
  const creation = await created.json();
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
