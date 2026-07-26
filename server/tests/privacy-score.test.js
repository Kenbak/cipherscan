const test = require('node:test');
const assert = require('node:assert/strict');
const { calculatePrivacyScore, WEIGHTS } = require('../lib/privacy-score');

test('privacy score v2 weights sum to 100', () => {
  const total = WEIGHTS.usage + WEIGHTS.quality + WEIGHTS.depth + WEIGHTS.hygiene;
  assert.equal(total, 100);
});

test('privacy score v2 returns breakdown and caps at 100', () => {
  const result = calculatePrivacyScore({
    recentShieldedPercent: 100,
    recentFullyShieldedPercent: 100,
    supplyShieldedPercent: 100,
    reshieldPercent: 100,
  });
  assert.equal(result.total, 100);
  assert.equal(result.breakdown.usage.max, 35);
  assert.equal(result.version, 2);
});

test('privacy score v2 scales linearly for partial adoption', () => {
  const result = calculatePrivacyScore({
    recentShieldedPercent: 10,
    recentFullyShieldedPercent: 0,
    supplyShieldedPercent: 12.4,
    reshieldPercent: 0,
  });
  assert.ok(result.total >= 1 && result.total <= 20);
  assert.ok(result.breakdown.usage.score > 0);
});
