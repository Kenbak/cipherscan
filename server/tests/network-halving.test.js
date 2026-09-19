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
  assert.equal(result.halvingStatus, 'available');
});

test('a threefold spacing subsidy adjustment is not reported as a halving', async () => {
  const activation = 3_600_000; // Synthetic fixture, not a proposed activation height.
  const result = await discoverNextHalving(async (_, [height]) => height < activation
    ? subsidyAt(height) : { totalblocksubsidy: 0.52083333 }, 3_500_000);
  assert.equal(result.halvingStatus, 'unavailable');
  assert.equal(result.halvingUnavailableReason, 'non-halving-subsidy-change');
  assert.equal(result.halvingBlock, null);
  assert.equal(result.eraProgress, null);
  assert.equal(result.nextSubsidy, null);
  assert.equal(result.currentSubsidy, 1.5625);
});

test('increasing or gradually changing subsidies do not produce a guessed halving', async () => {
  for (const changed of [1.6, 1.56249999]) {
    const result = await discoverNextHalving(async (_, [height]) => ({
      totalblocksubsidy: height < 3_600_000 ? 1.5625 : changed,
    }), 3_500_000);
    assert.equal(result.halvingStatus, 'unavailable');
    assert.equal(result.minerReward, null);
    assert.equal(result.fundingStreams, null);
    assert.equal(result.lockbox, null);
  }
});

test('integer-zatoshi halvings work without treating the previous spacing adjustment as an era start', async () => {
  const result = await discoverNextHalving(async (_, [height]) => ({ totalblocksubsidy:
    height < 3_600_000 ? 1.5625 : height < 5_000_000 ? 0.52083333 : 0.26041666,
  }), 3_700_000);
  assert.equal(result.halvingBlock, 5_000_000);
  assert.equal(result.halvingStatus, 'available');
  assert.equal(result.eraStartBlock, null);
  assert.equal(result.eraProgress, null);
});

test('unknown distant halvings and zero subsidy retain current observations', async () => {
  for (const current of [1.5625, 0]) {
    let calls = 0;
    const result = await discoverNextHalving(async () => { calls++; return { totalblocksubsidy: current }; }, 3_500_000);
    assert.equal(result.halvingStatus, 'unavailable');
    assert.equal(result.halvingBlock, null);
    assert.equal(result.currentSubsidy, current);
    assert.ok(calls <= 41);
  }
});

test('missing or malformed subsidy observations cannot create a boundary', async () => {
  for (const missing of [null, undefined, -1, NaN, '0.78125', 0.000000001]) {
    await assert.rejects(discoverNextHalving(async (_, [height]) => ({
      totalblocksubsidy: height === 3_500_000 ? 1.5625 : missing,
    }), 3_500_000), /Subsidy observation unavailable/);
  }
});
