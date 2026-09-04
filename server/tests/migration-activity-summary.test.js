const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const migrationRouter = require('../api/routes/migration');

function createFakePool() {
  const calls = { activity: 0, summary: 0 };
  return {
    calls,
    async query(sql, params) {
      if (sql.includes('bucket_start')) {
        calls.activity++;
        // Exact zatoshi integers, as returned raw from Postgres BIGINT SUM/COUNT.
        return {
          rows: [
            { bucket_start: '1700000000', tx_count: '3', volume_zat: '123456789012' },
            { bucket_start: '1700086400', tx_count: '5', volume_zat: '987654321098' },
          ],
        };
      }
      if (sql.includes('total_tx_count')) {
        calls.summary++;
        return {
          rows: [{
            total_tx_count: '842',
            total_volume_zat: '250000000000000', // 2.5M ZEC in zatoshis — well within Number.MAX_SAFE_INTEGER
            tx_count_24h: '12',
            volume_zat_24h: '3400000000',
            tx_count_7d: '90',
            volume_zat_7d: '24000000000',
            first_height: '3428200',
            last_height: '3500000',
          }],
        };
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };
}

async function requestMigration(pool, path) {
  const app = express();
  app.locals.pool = pool;
  app.locals.redisClient = null;
  app.locals.callZebraRPC = async () => null;
  app.use(migrationRouter);

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: response.status, headers: response.headers, body: await response.json() };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('/api/migration/activity returns a small, exact-integer bucketed series (default daily)', async () => {
  const pool = createFakePool();
  const result = await requestMigration(pool, '/api/migration/activity');

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.granularity, 'day');
  assert.equal(result.body.bucketSeconds, 86400);
  assert.equal(result.body.buckets.length, 2);
  // Must be exact integers straight from SQL SUM(), never a ZEC float division.
  assert.equal(result.body.buckets[0].volumeZat, 123456789012);
  assert.equal(Number.isInteger(result.body.buckets[0].volumeZat), true);
  assert.equal(result.body.buckets[1].txCount, 5);
  assert.equal(result.headers.get('cache-control'), 'public, s-maxage=30, stale-while-revalidate=300');
  assert.equal(pool.calls.activity, 1);
});

test('/api/migration/activity supports hourly granularity with its own bucket size', async () => {
  const pool = createFakePool();
  const result = await requestMigration(pool, '/api/migration/activity?granularity=hour');

  assert.equal(result.status, 200);
  assert.equal(result.body.granularity, 'hour');
  assert.equal(result.body.bucketSeconds, 3600);
});

test('/api/migration/summary returns a small fixed-shape digest with exact zatoshi integers', async () => {
  const pool = createFakePool();
  const result = await requestMigration(pool, '/api/migration/summary');

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.totalTxCount, 842);
  assert.equal(result.body.totalVolumeZat, 250000000000000);
  assert.equal(Number.isSafeInteger(result.body.totalVolumeZat), true);
  assert.equal(result.body.txCount24h, 12);
  assert.equal(result.body.volumeZat24h, 3400000000);
  assert.equal(result.body.firstHeight, 3428200);
  assert.equal(result.body.lastHeight, 3500000);
  assert.equal(pool.calls.summary, 1);
});
