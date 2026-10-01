const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const router = require('../api/routes/stats');
const { calculatePrivacyScore } = require('../lib/privacy-score');

async function requestStats(snapshot, rollingFails = false) {
  const app = express();
  app.locals.pool = { async query(sql) {
    if (sql.includes('FROM privacy_stats')) return { rows: [snapshot] };
    if (sql.includes('FROM privacy_trends_daily')) return { rows: [{ date: '2026-09-05', privacy_score: 88, pool_size: 0 }] };
    if (sql.includes('FROM transactions')) {
      if (rollingFails) throw new Error('Rolling inputs unavailable');
      return { rows: [{ shielded: 50, transparent: 50, fully_shielded: 25 }] };
    }
    if (sql.includes('FROM turnstile_daily')) return { rows: [{ deshielded: 100, reshielded: 25 }] };
    throw new Error('Unexpected query');
  } };
  app.use(router);
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/privacy-stats`);
    assert.equal(response.status, 200);
    return await response.json();
  } finally { await new Promise(resolve => server.close(resolve)); }
}
const timestamp = new Date('2026-09-06T08:00:00Z');

test('headline score stays with its snapshot rather than a different daily score', async () => {
  for (const total of [39, 0]) {
    const breakdown = { usage: { score: 17.5, max: 33, percent: 52.9 } };
    const result = await requestStats({ privacy_score: total, privacy_score_breakdown: breakdown, updated_at: timestamp });
    assert.equal(result.metrics.privacyScore, total);
    assert.deepEqual(result.metrics.scoreBreakdown, breakdown);
    assert.equal(result.metrics.scoreUpdatedAt, timestamp.toISOString());
    assert.equal(result.metrics.scoreSource, 'snapshot');
    assert.equal(result.trends.daily[0].privacyScore, 88);
  }
});

test('fallback returns a recalculated total paired with its recalculated breakdown', async () => {
  const result = await requestStats({ privacy_score: 2, chain_supply: 1000, shielded_pool_size: 200, updated_at: timestamp });
  const expected = calculatePrivacyScore({ recentShieldedPercent: 50, recentFullyShieldedPercent: 50, supplyShieldedPercent: 20, reshieldPercent: 25 });
  assert.equal(result.metrics.privacyScore, expected.total);
  assert.deepEqual(result.metrics.scoreBreakdown, expected.breakdown);
  assert.equal(result.metrics.scoreSource, 'rolling-fallback');
  assert.ok(Date.parse(result.metrics.scoreUpdatedAt) > timestamp.getTime());
});

test('failed fallback keeps unavailable breakdown and score distinct from zero', async () => {
  const result = await requestStats({ privacy_score: null, updated_at: timestamp }, true);
  assert.equal(result.metrics.privacyScore, null);
  assert.equal(result.metrics.scoreBreakdown, null);
});
