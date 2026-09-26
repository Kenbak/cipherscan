const test = require('node:test');
const assert = require('node:assert/strict');
const { networkSchedule, targetSeconds, targetSpacing, halvingIndex, halvingHeight } = require('../api/lib/network-schedule');
const info = (chain = 'main', nu7) => ({ chain, upgrades: { blossom: { name: 'Blossom', activationheight: chain === 'main' ? 653600 : 584000 }, ...(nu7 ? { nu7: { name: 'NU7', activationheight: nu7 } } : {}) } });
test('historical mainnet and testnet halving heights match the consensus clock', () => {
  assert.equal(halvingHeight(networkSchedule(info()), 1), 1046400);
  assert.equal(halvingHeight(networkSchedule(info()), 2), 2726400);
  assert.equal(halvingHeight(networkSchedule(info('test')), 1), 1116000);
  assert.equal(halvingHeight(networkSchedule(info('test')), 2), 2796000);
});
test('synthetic NU7 spacing transition preserves the halving era and extends block count', () => {
  const s = networkSchedule(info('main', 3600000)); // Test fixture, not an announced height.
  assert.equal(halvingIndex(s, 3599999), 2);
  assert.equal(halvingIndex(s, 3600000), 2);
  assert.equal(halvingHeight(s, 3), 3600000 + (4406400 - 3600000) * 3);
  assert.equal(targetSpacing(s, 3599999), 75);
  assert.equal(targetSpacing(s, 3600000), 25);
  assert.equal(targetSeconds(s, 3599999, 3600001), 100);
});
test('unknown networks, schedules and upgrades fail closed', () => {
  assert.equal(networkSchedule({}), null);
  assert.equal(networkSchedule(info('regtest')), null);
  const i = info(); i.upgrades.future = { name: 'NU8', activationheight: 9000000 };
  assert.equal(networkSchedule(i), null);
  assert.equal(networkSchedule(info('main', 1)), null);
});
