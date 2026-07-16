const test = require('node:test');
const assert = require('node:assert/strict');

const { discoverNextHalving } = require('../api/routes/network-analytics');

const CURRENT_ERA_START = 2_726_400;
const NEXT_HALVING = 4_406_400;

function subsidyAt(height) {
  if (height < CURRENT_ERA_START) {
    return { totalblocksubsidy: 3.125, miner: 2.5 };
  }
  if (height < NEXT_HALVING) {
    return {
      totalblocksubsidy: 1.5625,
      miner: 1.25,
      fundingstreamstotal: 0.125,
      lockboxtotal: 0.1875,
    };
  }
  return {
    totalblocksubsidy: 0.78125,
    miner: 0.78125,
    fundingstreamstotal: 0,
    lockboxtotal: 0,
  };
}

test('discovers exact halving boundaries entirely through RPC', async () => {
  const requestedHeights = [];
  const callZebraRPC = async (method, params) => {
    assert.equal(method, 'getblocksubsidy');
    const height = params?.[0];
    assert.ok(Number.isSafeInteger(height), 'every subsidy lookup must specify a height');
    requestedHeights.push(height);
    return subsidyAt(height);
  };

  const currentHeight = 3_414_715;
  const result = await discoverNextHalving(callZebraRPC, currentHeight);

  assert.equal(result.currentSubsidy, 1.5625);
  assert.equal(result.halvingBlock, NEXT_HALVING);
  assert.equal(result.blocksRemaining, NEXT_HALVING - currentHeight);
  assert.equal(result.eraStartBlock, CURRENT_ERA_START);
  assert.equal(result.nextSubsidy, 0.78125);
  assert.equal(result.nextMinerReward, 0.78125);
  assert.ok(requestedHeights.includes(currentHeight));
  assert.ok(requestedHeights.includes(NEXT_HALVING));
});
