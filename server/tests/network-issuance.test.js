const test = require('node:test');
const assert = require('node:assert/strict');
const { registerNetworkAnalyticsRoutes } = require('../api/routes/network-analytics');
const { observedBlockCadence, subsidyZat } = require('../api/lib/network-issuance');

function blocks(spacing = 75, height = 3_500_000) {
  return Array.from({ length: 121 }, (_, index) => ({ height: height - index, timestamp: 1_800_000_000 - index * spacing }));
}

async function request(path, { snapshots = null, trends = [], blockRows = blocks(), subsidy = 1.5625, redisClient = null, rpc } = {}) {
  const routes = new Map();
  registerNetworkAnalyticsRoutes({ get: (path, handler) => routes.set(path, handler) });
  const pool = { async query(sql) {
    if (sql.includes('information_schema.tables')) return { rows: snapshots === null ? [] : [{}] };
    if (sql.includes('FROM chain_snapshots')) return { rows: snapshots };
    if (sql.includes('FROM privacy_trends_daily')) return { rows: trends };
    if (sql.includes('SELECT height, timestamp FROM blocks')) return { rows: blockRows };
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const callZebraRPC = rpc || (async (method, params) => {
    if (method === 'getblockcount') return 3_500_000;
    assert.equal(method, 'getblocksubsidy');
    assert.equal(params[0], 3_500_000, 'subsidy is pinned to the observed node height');
    return { totalblocksubsidy: subsidy };
  });
  let body;
  let status = 200;
  const res = { json(value) { body = value; return this; }, status(value) { status = value; return this; } };
  await routes.get(path)({ query: {}, app: { locals: { pool, callZebraRPC, redisClient } } }, res);
  return { status, body };
}

const daily = (date, chain_supply) => ({ date, chain_supply });

test('emission preserves supply decreases, zero change, and exact single-zatoshi movements', async () => {
  const { status, body } = await request('/api/network/emission', { trends: [
    daily('2026-09-01', '1700000000000000'),
    daily('2026-09-02', '1699999999999999'),
    daily('2026-09-03', '1699999999999999'),
    daily('2026-09-04', '1700000000000000'),
  ] });
  assert.equal(status, 200);
  assert.equal(body.supplyHistory[1].circulatingZat, 1699999999999999);
  assert.ok(body.supplyHistory[1].circulating < body.supplyHistory[0].circulating);
  assert.deepEqual(body.dailyEmission.map(p => p.emissionZat), [-1, 0, 1]);
  assert.deepEqual(body.dailyEmission.map(p => p.emission), [-0.00000001, 0, 0.00000001]);
  assert.equal(body.dailyEmissionMeaning, 'net-chain-supply-change');
  assert.equal(body.supplyHistoryTable, 'privacy_trends_daily');
});

test('snapshots remain authoritative observations without fabricated days or monotonic smoothing', async () => {
  const { body } = await request('/api/network/emission', { snapshots: [
    { snapshot_time: '2026-09-01T00:00:00Z', chain_supply_zat: '1700000000000000', block_height: '3500000' },
    { snapshot_time: '2026-09-04T00:00:00Z', chain_supply_zat: '1699999999999999', block_height: '3500001' },
  ], trends: [daily('2026-09-01', '100'), daily('2026-09-04', '400')] });
  assert.equal(body.supplyHistory.length, 2);
  assert.equal(body.supplyHistoryTable, 'chain_snapshots');
  assert.equal(body.circulatingZat, 1699999999999999);
  assert.equal(body.supplyObservedAt, '2026-09-04T00:00:00Z');
  assert.equal(body.dailyEmission[0].emission, null, 'three-day changes are not called daily issuance');
});

test('missing and invalid supply is unavailable, never silently zero or carried forward', async () => {
  for (const invalid of [null, undefined, '', 0, '0', '123oops', '-1', '1.5', '2100000000000001', Number.MAX_SAFE_INTEGER + 1]) {
    const { body } = await request('/api/network/emission', { trends: [
      daily('2026-09-01', '100'), daily('2026-09-02', invalid), daily('2026-09-03', '105'), daily('2026-09-04', invalid),
    ] });
    assert.equal(body.supplyHistory[1].circulating, null);
    assert.equal(body.circulating, null);
    assert.equal(body.remaining, null);
    assert.equal(body.circulatingPct, null);
    assert.ok(body.dailyEmission.every(point => point.emission === null));
  }
  const { body } = await request('/api/network/emission');
  assert.equal(body.circulating, null);
  assert.equal(body.supplyHistorySource, 'none');
});

test('daily subsidy estimates adapt to observed 75-second and 25-second cadences', async () => {
  for (const spacing of [75, 25]) {
    const { body } = await request('/api/network/emission', { blockRows: blocks(spacing) });
    assert.equal(body.dailyEmissionEstimate, 1.5625 * 86400 / spacing);
    assert.equal(body.cadence.intervalSeconds, spacing);
    assert.equal(body.cadence.intervals, 120);
    assert.equal(body.cadence.source, 'indexed-block-timestamps');
  }
});

test('incomplete, lagging, or unusable cadence produces no fabricated timing estimate', async () => {
  for (const rows of [[], blocks().slice(0, 1), blocks().slice(1), blocks().filter((_, i) => i !== 30), blocks(0), blocks(-25)]) {
    const { body } = await request('/api/network/emission', { blockRows: rows });
    assert.equal(body.dailyEmissionEstimate, null);
    assert.equal(body.cadence, null);
  }
  const rows = blocks();
  rows[50].timestamp = rows[49].timestamp + 1; // Interior timestamps need not be monotonic.
  const cadence = await observedBlockCadence({ query: async () => ({ rows }) }, 3_500_000);
  assert.equal(cadence.intervalSeconds, 75);
});

test('subsidy failures do not hide supply observations or invent daily issuance', async () => {
  for (const subsidy of [null, NaN, -1, 0.000000001]) {
    const { body } = await request('/api/network/emission', { subsidy, trends: [daily('2026-09-01', '100')] });
    assert.equal(body.circulatingZat, 100);
    assert.equal(body.dailyEmissionEstimate, null);
  }
  assert.equal(subsidyZat(0), 0);
  assert.equal(subsidyZat(0.52083333), 52083333);
});

test('halving route ignores legacy cached countdowns and does not cache unfamiliar transitions', async () => {
  const keys = [];
  const { body } = await request('/api/network/halving', {
    rpc: async (method, params) => method === 'getblockcount' ? 3_500_000 : ({
      totalblocksubsidy: params[0] < 3_600_000 ? 1.5625 : 0.52083333,
    }),
    redisClient: { isOpen: true, async get(key) {
      keys.push(key);
      return key === 'zcash:halving_info' ? JSON.stringify({ halvingBlock: 3_600_000 }) : null;
    }, async setEx() { assert.fail('unavailable countdown must not be cached'); } },
  });
  assert.deepEqual(keys, ['zcash:halving_info:v2']);
  assert.equal(body.halvingStatus, 'unavailable');
  assert.equal(body.estimatedSeconds, null);
  assert.equal(body.estimatedDate, null);
  assert.equal(body.currentSubsidy, 1.5625);
});

test('halving route extrapolates observed cadence and caches for five minutes', async () => {
  const stored = [];
  const { body } = await request('/api/network/halving', {
    blockRows: blocks(25),
    rpc: async (method, params) => method === 'getblockcount' ? 3_500_000 : ({ totalblocksubsidy:
      params[0] < 2_726_400 ? 3.125 : params[0] < 4_406_400 ? 1.5625 : 0.78125,
    }),
    redisClient: { isOpen: true, async get() { return null; }, async setEx(...args) { stored.push(args); } },
  });
  assert.equal(body.estimatedSeconds, (4_406_400 - 3_500_000) * 25);
  assert.equal(stored[0][1], 300);
});
