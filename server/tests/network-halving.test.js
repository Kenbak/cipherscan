const test = require('node:test');
const assert = require('node:assert/strict');
const { discoverNextHalving } = require('../api/routes/network-analytics');
const info = { chain: 'main', upgrades: { b: { name: 'Blossom', activationheight: 653600 }, n: { name: 'NU7', activationheight: 3600000 } } };
test('NU7 subsidy reduction is not a halving; future halving follows the segmented clock', async () => {
  const requested = [];
  const rpc = async (method, [height]) => { assert.equal(method, 'getblocksubsidy'); requested.push(height); return { totalblocksubsidy: height < 3600000 ? 1.5625 : 0.52083333, miner: 0.4 }; };
  const result = await discoverNextHalving(rpc, 3500000, info);
  assert.equal(result.halvingBlock, 6019200);
  assert.equal(result.eraStartBlock, 2726400);
  assert.equal(result.halvingStatus, 'available');
  assert.deepEqual(requested, [3500000, 6019200]);
});
test('future NSM reward unavailability does not erase a known halving boundary', async () => {
  const result = await discoverNextHalving(async (_, [height]) => {
    if (height > 3700000) throw new Error('Parent NSM balance unavailable');
    return { totalblocksubsidy: 0.52083333 };
  }, 3700000, info);
  assert.equal(result.halvingBlock, 6019200);
  assert.equal(result.nextSubsidy, null);
  assert.equal(result.nextMinerReward, null);
  assert.equal(result.minerReward, null);
});
test('unknown network schedules remain unavailable and malformed current subsidy fails', async () => {
  const result = await discoverNextHalving(async () => ({ totalblocksubsidy: 1 }), 3500000, { chain: 'regtest' });
  assert.equal(result.halvingStatus, 'unavailable');
  for (const value of [null, -1, NaN, '1', 0.000000001]) await assert.rejects(discoverNextHalving(async () => ({ totalblocksubsidy: value }), 3500000, info));
});
