const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const migrationRouter = require('../api/routes/migration');

const TXID = 'a'.repeat(64);
const TIP_HASH = 'b'.repeat(64);

function createPool({ cursorHash = TIP_HASH } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('ORDER BY height DESC LIMIT 1')) {
        return { rows: [{ height: '3450000', hash: TIP_HASH }] };
      }
      if (sql.includes('SELECT hash FROM blocks WHERE height')) {
        return { rows: [{ hash: cursorHash }] };
      }
      if (sql.includes('SELECT ABS(value_balance_ironwood) AS amount_zat')) {
        return { rows: [{ amount_zat: '100000000' }, { amount_zat: '123456789' }] };
      }
      if (sql.includes('SELECT') && sql.includes('t.txid')) {
        return {
          rows: [{
            txid: TXID,
            block_height: '3449990',
            block_time: '1788498000',
            amount_zat: '100000000',
            ironwood_actions: '1',
            orchard_actions: '2',
            orchard_anchor: 'c'.repeat(64),
            fee: '10000',
            expiry_height: '3450030',
            locktime: '0',
            anchor_compliant: true,
          }],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

async function request(pool, path, headers = {}) {
  const app = express();
  app.locals.pool = pool;
  app.locals.redisClient = null;
  app.locals.listCache = null;
  app.locals.callZebraRPC = async () => null;
  app.use(migrationRouter);
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const { port } = server.address();
    return await fetch(`http://127.0.0.1:${port}${path}`, { headers });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('compact scatter defaults to seven days and returns exact zatoshi strings', async () => {
  const pool = createPool();
  const response = await request(pool, '/api/migration/scatter/compact');
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.version, 1);
  assert.equal(body.range, '7d');
  assert.equal(body.points.length, 1);
  assert.equal(body.points[0][2], '100000000');
  assert.equal(body.points[0][3], TXID);
  assert.equal(body.points[0].length, body.schema.length);
  assert.equal(body.summary.total, 2);
  assert.match(response.headers.get('cache-control'), /s-maxage=30/);

  const compactQuery = pool.calls.find(({ sql }) => sql.includes('t.txid'));
  assert.ok(compactQuery.sql.includes('t.block_time >= $1'));
  assert.equal(compactQuery.params.length, 1);
});

test('compact scatter emits a strong ETag and honors If-None-Match', async () => {
  const first = await request(createPool(), '/api/migration/scatter/compact?range=30d');
  const etag = first.headers.get('etag');
  assert.ok(etag?.startsWith('"'));

  const second = await request(
    createPool(),
    '/api/migration/scatter/compact?range=30d',
    { 'if-none-match': etag },
  );
  assert.equal(second.status, 304);
});

test('compact scatter rejects malformed cursors', async () => {
  const response = await request(
    createPool(),
    '/api/migration/scatter/compact?afterHeight=not-a-height',
  );
  assert.equal(response.status, 400);
});

test('compact tail forces a reset when the canonical cursor hash changed', async () => {
  const response = await request(
    createPool({ cursorHash: 'd'.repeat(64) }),
    `/api/migration/scatter/compact?afterHeight=3449000&afterHash=${TIP_HASH}`,
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.resetRequired, true);
  assert.deepEqual(body.points, []);
});

test('manifest exposes finalized fixed chunks without transaction rows', async () => {
  const response = await request(createPool(), '/api/migration/scatter/compact?manifest=1');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.chunkBlocks, 10000);
  assert.ok(body.chunks.every((chunk) => chunk.end - chunk.start + 1 === 10000));
  assert.equal(body.points, undefined);
});

