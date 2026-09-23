const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

async function request(router, pool, path) {
  const app = express();
  app.locals.pool = pool;
  app.use(router);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    return { status: res.status, data: await res.json() };
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('reorg sides expose independent observations; header/detection times are never fallbacks', async () => {
  const router = require('../api/routes/reorgs');
  const row = { id: 1, height: 100, hash: 'a'.repeat(64), canonical_block_hash: 'b'.repeat(64),
    timestamp: 1700000000, canonical_timestamp: 1700000001, detected_at: '2026-09-23T11:00:00Z',
    first_seen_at: '2026-09-23T10:59:58.123Z', canonical_first_seen_at: '2026-09-23T10:59:59.456Z',
    observation_source: 'local-node-rpc', poll_interval_ms: 1000 };
  const pool = { async query(sql) { return { rows: sql.includes('COUNT(*)') ? [{ total: '1' }] : [row] }; } };
  let result = await request(router, pool, '/api/uncles');
  assert.equal(result.status, 200);
  assert.equal(result.data.orphanedBlocks[0].firstSeenAt, row.first_seen_at);
  assert.equal(result.data.orphanedBlocks[0].canonicalBlock.firstSeenAt, row.canonical_first_seen_at);
  delete row.first_seen_at;
  delete row.canonical_first_seen_at;
  result = await request(router, pool, '/api/uncles');
  assert.equal(result.data.orphanedBlocks[0].firstSeenAt, null);
  assert.equal(result.data.orphanedBlocks[0].canonicalBlock.firstSeenAt, null);
  delete row.canonical_block_hash;
  row.canonical_hash = 'c'.repeat(64);
  result = await request(router, pool, '/api/uncles');
  assert.equal(result.data.orphanedBlocks[0].canonicalBlock, null);
});

test('daily hashrate uses observed elapsed time and UTC buckets, including partial days', async () => {
  const router = express.Router();
  require('../api/routes/network-analytics').registerNetworkAnalyticsRoutes(router);
  const pool = { async query(sql) {
    assert.match(sql, /AT TIME ZONE 'UTC'/);
    return { rows: [{ day: '2026-09-23', avg_difficulty: '100', block_count: '3', first_ts: '1000', last_ts: '1150' }] };
  } };
  const result = await request(router, pool, '/api/network/hashrate-history?period=30d');
  assert.equal(result.status, 200);
  assert.equal(result.data.points[0].date, '2026-09-23');
  assert.equal(result.data.points[0].hashrate, 100 * 8192 * 2 / 150);
});
