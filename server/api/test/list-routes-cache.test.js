const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');

function captureRoutes(relativePath, overrides = {}) {
  const handlers = new Map();
  const middleware = [];
  const router = {
    use(callback) { middleware.push(callback); },
  };
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    router[method] = (route, ...callbacks) => handlers.set(`${method}:${route}`, callbacks.at(-1));
  }

  const filename = path.resolve(__dirname, '..', relativePath);
  const originalLoad = Module._load;
  Module._load = function loadWithOverrides(request, parent, isMain) {
    if (request === 'express') return { Router: () => router };
    if (Object.prototype.hasOwnProperty.call(overrides, request)) return overrides[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[filename];
    require(filename);
  } finally {
    Module._load = originalLoad;
    delete require.cache[filename];
  }
  return { handlers, middleware };
}

function memoryListCache() {
  const entries = new Map();
  const calls = [];
  return {
    calls,
    async getOrLoad(options) {
      calls.push(options);
      const key = JSON.stringify([options.family, options.params]);
      if (entries.has(key)) {
        return {
          value: entries.get(key),
          state: 'HIT',
          cacheDurationMs: 0,
          loadTimings: [],
          totalDurationMs: 0,
          refreshScheduled: false,
          key,
        };
      }
      const timings = [];
      const value = await options.load({
        async measure(name, operation) {
          const result = await operation();
          timings.push({ name, durationMs: 0 });
          return result;
        },
      });
      if (options.cacheable && options.shouldCache(value)) entries.set(key, value);
      return {
        value,
        state: 'MISS',
        cacheDurationMs: 0,
        loadTimings: timings,
        totalDurationMs: 0,
        refreshScheduled: false,
        key,
      };
    },
  };
}

function recordingListCache(value = { success: true }) {
  const calls = [];
  return {
    calls,
    async getOrLoad(options) {
      calls.push(options);
      return {
        value,
        state: 'MISS',
        cacheDurationMs: 0,
        loadTimings: [],
        totalDurationMs: 0,
        refreshScheduled: false,
        key: 'recorded',
      };
    },
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    headers: new Map(),
    body: undefined,
    set(name, value) { this.headers.set(name.toLowerCase(), value); return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

async function invoke(captured, route, { query = {}, locals }) {
  const req = { query, params: {}, body: {}, app: { locals } };
  const res = responseRecorder();
  for (const callback of captured.middleware) {
    await new Promise((resolve, reject) => {
      try { callback(req, res, resolve); } catch (error) { reject(error); }
    });
  }
  await captured.handlers.get(`get:${route}`)(req, res);
  return res;
}

test('transaction list preserves its payload and skips PostgreSQL on a cache hit', async () => {
  const captured = captureRoutes('routes/transactions.js');
  const listCache = memoryListCache();
  const rows = [
    { txid: 'a'.repeat(64), block_height: '100', tx_index: 2 },
    { txid: 'b'.repeat(64), block_height: '99', tx_index: 1 },
  ];
  let queryCount = 0;
  const pool = {
    async query(sql) {
      queryCount += 1;
      return sql.includes('pg_class') ? { rows: [{ count: '3' }] } : { rows };
    },
  };
  const locals = { pool, listCache };

  const miss = await invoke(captured, '/api/transactions/list', {
    query: { limit: '2' },
    locals,
  });
  const hit = await invoke(captured, '/api/transactions/list', {
    query: { limit: '2' },
    locals,
  });

  assert.equal(queryCount, 2);
  assert.deepEqual(hit.body, miss.body);
  assert.deepEqual(miss.body, {
    success: true,
    transactions: rows,
    pagination: {
      total: 3,
      totalPages: 2,
      limit: 2,
      hasNext: true,
      hasPrev: false,
      nextCursor: 99,
      nextCursorIdx: 1,
      prevCursor: 100,
      prevCursorIdx: 2,
    },
  });
  assert.equal(miss.headers.get('x-cipherscan-cache'), 'MISS');
  assert.equal(hit.headers.get('x-cipherscan-cache'), 'HIT');
  assert.deepEqual(
    [listCache.calls[0].freshTtlSeconds, listCache.calls[0].staleTtlSeconds],
    [15, 300],
  );
  assert.deepEqual(listCache.calls[0].params, {
    limit: 2,
    cursor: null,
    cursorIdx: null,
    direction: 'next',
    type: 'all',
  });
});

test('shielded list preserves its payload and skips PostgreSQL on a cache hit', async () => {
  const captured = captureRoutes('routes/transactions.js');
  const listCache = memoryListCache();
  const row = {
    txid: 'c'.repeat(64),
    block_height: '88',
    block_time: '1700000000',
    has_sapling: false,
    has_orchard: true,
    has_ironwood: false,
    orchard_actions: '2',
    ironwood_actions: '0',
    shielded_spends: '1',
    shielded_outputs: '1',
  };
  let queryCount = 0;
  const pool = {
    async query(sql) {
      queryCount += 1;
      return sql.includes('COUNT(*)') ? { rows: [{ count: '1' }] } : { rows: [row] };
    },
  };
  const locals = { pool, listCache };
  const query = {
    limit: '2',
    flow_type: 'fully_shielded',
    cursor_id: '999',
    direction: 'prev',
  };

  const miss = await invoke(captured, '/api/shielded/list', { query, locals });
  const hit = await invoke(captured, '/api/shielded/list', { query, locals });

  assert.equal(queryCount, 2);
  assert.deepEqual(hit.body, miss.body);
  assert.deepEqual(miss.body, {
    success: true,
    flows: [{
      id: 0,
      txid: row.txid,
      blockHeight: 88,
      blockTime: 1700000000,
      flowType: 'fully_shielded',
      amountZec: null,
      pool: 'orchard',
      actions: 4,
      addresses: [],
    }],
    pagination: {
      total: 1,
      totalPages: 1,
      limit: 2,
      hasNext: false,
      hasPrev: false,
      nextCursor: 1700000000,
      nextCursorId: row.txid,
      prevCursor: 1700000000,
      prevCursorId: row.txid,
    },
  });
  assert.equal(miss.headers.get('x-cipherscan-cache'), 'MISS');
  assert.equal(hit.headers.get('x-cipherscan-cache'), 'HIT');
  assert.equal(listCache.calls[0].params.cursorId, null);
  assert.equal(listCache.calls[0].params.direction, 'next');
});

test('block list caches the exact response, including finalized state', async () => {
  const captured = captureRoutes('routes/blocks.js', {
    '../mining-pools': {
      getPoolName: () => 'Example Pool',
      getPoolInfo: () => ({ name: 'Example Pool' }),
    },
    '../coinbase-data': { decodeCoinbaseText: () => null },
  });
  const listCache = memoryListCache();
  const block = {
    height: '100',
    hash: 'd'.repeat(64),
    timestamp: 1700000000,
    transaction_count: 2,
    miner_address: 't-test',
  };
  let queryCount = 0;
  const pool = {
    async query(sql) {
      queryCount += 1;
      return sql.includes('MAX(height)')
        ? { rows: [{ max_height: '100' }] }
        : { rows: [{ ...block }] };
    },
  };
  let rpcCount = 0;
  const locals = {
    pool,
    listCache,
    redisClient: null,
    async callZebraRPC() { rpcCount += 1; return { height: 99 }; },
  };

  const query = { limit: '1', direction: 'prev' };
  const miss = await invoke(captured, '/api/blocks/list', { query, locals });
  const hit = await invoke(captured, '/api/blocks/list', { query, locals });

  assert.equal(queryCount, 2);
  assert.equal(rpcCount, 1);
  assert.deepEqual(hit.body, miss.body);
  assert.deepEqual(miss.body, {
    success: true,
    blocks: [{ ...block, finality_status: 'NotYetFinalized', miner_pool: 'Example Pool' }],
    pagination: {
      page: 1,
      totalPages: 100,
      total: 100,
      limit: 1,
      hasNext: true,
      hasPrev: false,
      nextCursor: 100,
      prevCursor: 100,
    },
  });
  assert.equal(hit.headers.get('x-cipherscan-cache'), 'HIT');
  assert.equal(listCache.calls[0].params.direction, 'next');
});

test('rich list preserves calculations and skips all three queries on a cache hit', async () => {
  const captured = captureRoutes('routes/address.js');
  const listCache = memoryListCache();
  let queryCount = 0;
  const pool = {
    async query(sql) {
      queryCount += 1;
      if (sql.includes('LEFT JOIN address_labels')) {
        return { rows: [{
          address: 't-rich',
          balance: '500000000',
          total_received: '700000000',
          total_sent: '200000000',
          tx_count: '4',
          first_seen: 10,
          last_seen: 20,
          label: null,
          category: null,
          description: null,
          verified: false,
          logo_url: null,
        }] };
      }
      if (sql.includes('COUNT(*)')) return { rows: [{ count: '1' }] };
      return { rows: [{ top10: '500000000', top100: '500000000', total_transparent: '1000000000' }] };
    },
  };
  const locals = { pool, listCache };

  const miss = await invoke(captured, '/api/rich-list', { query: { limit: '1' }, locals });
  const hit = await invoke(captured, '/api/rich-list', { query: { limit: '1' }, locals });

  assert.equal(queryCount, 3);
  assert.deepEqual(hit.body, miss.body);
  assert.equal(miss.body.addresses[0].balance, 5);
  assert.deepEqual(miss.body.concentration, {
    top10: 5,
    top100: 5,
    totalTransparent: 10,
    top10Pct: 50,
    top100Pct: 50,
  });
  assert.equal(hit.headers.get('x-cipherscan-cache'), 'HIT');
  assert.deepEqual(
    [listCache.calls[0].freshTtlSeconds, listCache.calls[0].staleTtlSeconds],
    [60, 600],
  );
});

test('all cursor-based list routes use the archive TTL policy', async () => {
  const transactions = captureRoutes('routes/transactions.js');
  const blocks = captureRoutes('routes/blocks.js', {
    '../mining-pools': { getPoolName: () => null, getPoolInfo: () => null },
    '../coinbase-data': { decodeCoinbaseText: () => null },
  });
  const listCache = recordingListCache();
  const locals = { pool: {}, listCache, redisClient: null, callZebraRPC: null };

  await invoke(transactions, '/api/transactions/list', {
    query: { cursor: '100', cursor_idx: '2' },
    locals,
  });
  await invoke(transactions, '/api/shielded/list', {
    query: { cursor: '1700000000', cursor_id: '2' },
    locals,
  });
  await invoke(blocks, '/api/blocks/list', {
    query: { cursor: '100' },
    locals,
  });

  assert.equal(listCache.calls.length, 3);
  for (const call of listCache.calls) {
    assert.equal(call.cacheable, true);
    assert.equal(call.freshTtlSeconds, 300);
    assert.equal(call.staleTtlSeconds, 3600);
  }
});

test('malformed list identities are normalized safely and marked uncacheable', async () => {
  const transactions = captureRoutes('routes/transactions.js');
  const blocks = captureRoutes('routes/blocks.js', {
    '../mining-pools': { getPoolName: () => null, getPoolInfo: () => null },
    '../coinbase-data': { decodeCoinbaseText: () => null },
  });
  const addresses = captureRoutes('routes/address.js');
  const listCache = recordingListCache();
  const locals = { pool: {}, listCache, redisClient: null, callZebraRPC: null };

  await invoke(transactions, '/api/transactions/list', {
    query: { limit: '10items' },
    locals,
  });
  await invoke(transactions, '/api/shielded/list', {
    query: { min_zec: '1e2' },
    locals,
  });
  await invoke(blocks, '/api/blocks/list', {
    query: { cursor: 'garbage', direction: 'sideways' },
    locals,
  });
  await invoke(addresses, '/api/rich-list', {
    query: { offset: '9'.repeat(400) },
    locals,
  });

  assert.equal(listCache.calls.length, 4);
  assert.ok(listCache.calls.every(({ cacheable }) => cacheable === false));
  assert.equal(listCache.calls[2].params.cursor, null);
  assert.equal(listCache.calls[3].params.offset, null);
});
