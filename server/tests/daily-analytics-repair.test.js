const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRange, parsePools, clusterAmounts, applyPlan } = require('../scripts/repair-daily-analytics');

test('repairs require bounded complete UTC dates and all authoritative pool amounts', () => {
  validateRange('2026-08-01', '2026-08-31');
  for (const args of [['2026-02-30','2026-03-01'],['2025-01-01','2026-08-31'],['2026-08-31','2026-08-01'],['2026-08-01','2999-01-01']]) assert.throws(() => validateRange(...args));
  const block = { valuePools: ['sprout','sapling','orchard','ironwood','transparent'].map(id => ({ id, chainValueZat: 100 })), chainSupply: { chainValueZat: 500 } };
  assert.equal(parsePools(block).shielded, 400);
  assert.throws(() => parsePools({ ...block, valuePools: block.valuePools.slice(1) }));
  assert.throws(() => parsePools({ ...block, chainSupply: { chainValueZat: 0 } }));
});

test('amount clusters preserve counts and combine collisions after rounding', () => {
  const rows = [1,1,1,1.1,1.1,1.1].map(amount => ({ amount, usd: 0.1 }));
  assert.deepEqual(clusterAmounts(rows), [{ bucket: 1, count: 6, usd: 0.6 }]);
  assert.deepEqual(clusterAmounts([{ amount: 5,usd: 5 },{ amount: 5,usd: 5 }]), []);
});

function plan() {
  return { version: 1, from: '2026-08-01', to: '2026-08-31', anchors: [{ height: 123, hash: 'a'.repeat(64) }], rows: {
    privacy_trends_daily: [], mvrv_daily: [], swap_amount_stats_daily: [{ date: '2026-08-24', source_chain: 'eth', source_token: 'ETH', amount_bucket: 1, swap_count: 3, total_volume_usd: 900 }],
  } };
}
function fixture({ changed = false, existing = false, failInsert = false } = {}) {
  const calls = [];
  return { calls, async query(sql) {
    calls.push(sql);
    if (sql.includes('pg_try_advisory')) return { rows: [{ acquired: true }] };
    if (sql.includes('SELECT hash')) return { rows: [{ hash: (changed ? 'b' : 'a').repeat(64) }] };
    if (sql.includes('SELECT 1')) return { rowCount: existing ? 1 : 0 };
    if (sql.startsWith('INSERT') && failInsert) throw new Error('write failed');
    return { rows: [], rowCount: 1 };
  } };
}

test('missing rows commit atomically; reorgs, concurrent inserts and write failures roll back', async () => {
  const db = fixture();
  assert.equal((await applyPlan(db, plan())).swap_amount_stats_daily, 1);
  assert.equal(db.calls.at(-1), 'COMMIT');
  for (const options of [{ changed: true }, { existing: true }, { failInsert: true }]) {
    const db = fixture(options);
    await assert.rejects(applyPlan(db, plan()));
    assert.equal(db.calls.at(-1), 'ROLLBACK');
    assert.equal(db.calls.includes('COMMIT'), false);
    if (!options.failInsert) assert.equal(db.calls.some(sql => sql.startsWith('INSERT')), false);
  }
});

test('historical cost basis excludes future creations and restores only outputs spent after the day', () => {
  const { historicalCostBasis } = require('../scripts/repair-daily-analytics');
  const day = date => Date.parse(date) / 86400000;
  const prices = new Map([['2026-08-01', 10],['2026-08-02', 20],['2026-08-03', 30]]);
  const unspent = [{ created_day: day('2026-08-01'), value_zat: '100000000' }, { created_day: day('2026-08-03'), value_zat: '900000000' }];
  const spent = [{ created_day: day('2026-08-01'), spent_day: day('2026-08-02'), value_zat: '200000000' }, { created_day: day('2026-08-02'), spent_day: day('2026-08-03'), value_zat: '300000000' }];
  assert.deepEqual(historicalCostBasis('2026-08-01', unspent, spent, prices), { valueZat: '300000000', capUsd: 30 });
  assert.deepEqual(historicalCostBasis('2026-08-02', unspent, spent, prices), { valueZat: '400000000', capUsd: 70 });
  assert.throws(() => historicalCostBasis('2026-08-02', unspent, spent, new Map()));
});
