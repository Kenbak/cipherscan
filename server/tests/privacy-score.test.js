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
  assert.equal(result.breakdown.usage.max, WEIGHTS.usage);
  assert.equal(result.breakdown.depth.max, WEIGHTS.depth);
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

test('computeScoreInputsFromCounts builds rolling v2 inputs', () => {
  const { computeScoreInputsFromCounts } = require('../lib/privacy-score');
  const inputs = computeScoreInputsFromCounts({
    shielded30d: 70,
    transparent30d: 30,
    fullyShielded30d: 35,
    deshielded90dZat: 100_000_000,
    reshielded90dZat: 40_000_000,
    supplyShieldedPercent: 12.5,
  });
  assert.equal(inputs.recentShieldedPercent, 70);
  assert.equal(inputs.recentFullyShieldedPercent, 50);
  assert.equal(inputs.reshieldPercent, 40);
  assert.equal(inputs.supplyShieldedPercent, 12.5);

  const score = calculatePrivacyScore(inputs);
  assert.ok(score.total > 0 && score.total <= 100);
  assert.equal(score.breakdown.hygiene.percent, 40);
});
