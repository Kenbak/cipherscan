const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { injectDependencies } = require('../api/routes/transactions/_helpers');
const mempoolRouter = require('../api/routes/transactions/tx-mempool');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer(callZebraRPC) {
  const app = express();
  app.locals.callZebraRPC = callZebraRPC;
  app.locals.listCache = undefined; // exercise the default (disabled) list cache
  app.use(injectDependencies);
  app.use(mempoolRouter);

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

test('/api/mempool bounds concurrent getrawtransaction RPC fan-out (was unbounded Promise.all)', async () => {
  const txids = Array.from({ length: 20 }, (_, i) => `tx-${i}`);
  let active = 0;
  let maxActive = 0;
  const rpcCalls = { getrawmempool: 0, getrawtransaction: 0 };

  async function fakeRpc(method, params) {
    if (method === 'getrawmempool') {
      rpcCalls.getrawmempool++;
      return txids;
    }
    if (method === 'getrawtransaction') {
      rpcCalls.getrawtransaction++;
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(15);
      active--;
      const [txid] = params;
      return { txid, hex: '00', vin: [], vout: [{ value: 1 }], time: 1700000000, version: 4 };
    }
    throw new Error(`Unexpected RPC method: ${method}`);
  }

  const server = await startServer(fakeRpc);
  try {
    const response = await fetch(`${server.baseUrl}/api/mempool`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.transactions.length, 20);
    assert.equal(rpcCalls.getrawmempool, 1);
    assert.equal(rpcCalls.getrawtransaction, 20);
    assert.ok(maxActive <= 8, `expected bounded concurrency <= 8, saw ${maxActive}`);
    assert.ok(maxActive > 1, 'sanity check: fan-out should still run concurrently, not fully serial');
  } finally {
    await server.close();
  }
});

test('/api/mempool single-flights concurrent requests onto one getrawmempool RPC call', async () => {
  let getrawmempoolCalls = 0;

  async function fakeRpc(method) {
    if (method === 'getrawmempool') {
      getrawmempoolCalls++;
      await delay(60);
      return [];
    }
    throw new Error(`Unexpected RPC method: ${method}`);
  }

  const server = await startServer(fakeRpc);
  try {
    const [r1, r2] = await Promise.all([
      fetch(`${server.baseUrl}/api/mempool`),
      fetch(`${server.baseUrl}/api/mempool`),
    ]);
    const [b1, b2] = await Promise.all([r1.json(), r2.json()]);

    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(b1.count, 0);
    assert.equal(b2.count, 0);
    assert.equal(getrawmempoolCalls, 1, 'two concurrent requests should share one in-flight RPC call');
  } finally {
    await server.close();
  }
});

test('/api/mempool/tx/:txid reuses the shared mempool txid lookup', async () => {
  const targetTxid = 'd'.repeat(64);
  let getrawmempoolCalls = 0;

  async function fakeRpc(method, params) {
    if (method === 'getrawmempool') {
      getrawmempoolCalls++;
      return [targetTxid];
    }
    if (method === 'getrawtransaction') {
      const [txid] = params;
      return { txid, hex: '00', vin: [], vout: [{ value: 42, n: 0, scriptPubKey: {} }], version: 4, locktime: 0 };
    }
    throw new Error(`Unexpected RPC method: ${method}`);
  }

  const server = await startServer(fakeRpc);
  try {
    const response = await fetch(`${server.baseUrl}/api/mempool/tx/${targetTxid}`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.inMempool, true);
    assert.equal(body.transaction.txid, targetTxid);
    assert.equal(getrawmempoolCalls, 1);
  } finally {
    await server.close();
  }
});
