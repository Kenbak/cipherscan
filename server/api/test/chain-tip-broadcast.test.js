const assert = require('node:assert/strict');
const test = require('node:test');
const { setImmediate: setImmediatePromise } = require('node:timers/promises');

const { createChainTipBroadcaster } = require('../chain-tip-broadcast');

// Deterministic "clock": every sleep advances a manual counter instead of
// waiting on a real timer, and the broadcaster's injected `now` reads that
// same counter — so a bounded polling loop terminates in a fixed number of
// simulated milliseconds without slowing the test suite down with real
// waits, and without the flakiness of racing real Date.now() against
// microtask-only sleeps.
function fakeClock(startAt = 0) {
  let now = startAt;
  return {
    now: () => now,
    advance(ms) { now += ms; },
  };
}

function harness(overrides = {}) {
  const broadcasts = [];
  const errors = [];
  const clock = overrides.clock || fakeClock();
  const sleepFn = async (ms) => {
    clock.advance(ms);
    await setImmediatePromise();
  };

  const broadcaster = createChainTipBroadcaster({
    queryBlockByHeight: overrides.queryBlockByHeight,
    broadcast: (block) => broadcasts.push(block),
    getChainTip: overrides.getChainTip || (() => ({ height: 0, hash: '' })),
    sleepFn,
    now: clock.now,
    onError: (context, err) => errors.push({ context, message: err.message }),
    initialPollIntervalMs: 10,
    initialMaxWaitMs: overrides.initialMaxWaitMs ?? 50,
    selfCorrectPollIntervalMs: 10,
    selfCorrectMaxWaitMs: overrides.selfCorrectMaxWaitMs ?? 100,
  });

  return { broadcaster, broadcasts, errors, clock };
}

async function flush(times = 10) {
  for (let i = 0; i < times; i += 1) await setImmediatePromise();
}

test('broadcasts the full row immediately when the primary already has it', async () => {
  let calls = 0;
  const { broadcaster, broadcasts } = harness({
    queryBlockByHeight: async (height) => {
      calls += 1;
      return { height, hash: 'h100', transaction_count: 5 };
    },
  });

  await broadcaster.handleChainTipChange({ height: 100, hash: 'h100' });

  assert.equal(calls, 1, 'should not poll again once the row is found on the first try');
  assert.equal(broadcasts.length, 1);
  assert.deepEqual(broadcasts[0], { height: 100, hash: 'h100', transaction_count: 5 });
});

test('bounds the initial wait and broadcasts a partial tip when the indexer has not caught up', async () => {
  const { broadcaster, broadcasts } = harness({
    queryBlockByHeight: async () => null, // indexer never catches up within the bounded window
    getChainTip: () => ({ height: 200, hash: 'h200' }),
  });

  await broadcaster.handleChainTipChange({ height: 200, hash: 'h200' });

  assert.equal(broadcasts.length, 1);
  assert.deepEqual(broadcasts[0], { height: 200, hash: 'h200' }, 'partial broadcast has only height+hash');
});

test('self-corrects with the complete row once the indexer catches up, without waiting on the initial call', async () => {
  let indexed = false;
  const { broadcaster, broadcasts } = harness({
    queryBlockByHeight: async (height) => {
      if (!indexed) return null;
      return { height, hash: 'h300', transaction_count: 12 };
    },
    getChainTip: () => ({ height: 300, hash: 'h300' }),
  });

  await broadcaster.handleChainTipChange({ height: 300, hash: 'h300' });
  assert.equal(broadcasts.length, 1);
  assert.deepEqual(broadcasts[0], { height: 300, hash: 'h300' }, 'first broadcast is the bounded-wait partial');

  // The indexer catches up while the (already-scheduled) self-correction
  // poller is still running in the background.
  indexed = true;
  await flush(20);

  assert.equal(broadcasts.length, 2, 'self-correction should broadcast the complete row exactly once');
  assert.deepEqual(broadcasts[1], { height: 300, hash: 'h300', transaction_count: 12 });
});

test('does not self-correct a height superseded by a newer tip (next block or reorg)', async () => {
  let indexed = false;
  let currentTip = { height: 400, hash: 'h400' };
  const { broadcaster, broadcasts } = harness({
    queryBlockByHeight: async (height) => {
      if (!indexed) return null;
      return { height, hash: 'h400', transaction_count: 3 };
    },
    getChainTip: () => currentTip,
  });

  await broadcaster.handleChainTipChange({ height: 400, hash: 'h400' });
  assert.equal(broadcasts.length, 1, 'only the partial broadcast so far');

  // A newer block supersedes height 400 before the indexer catches up on
  // the original height's row.
  currentTip = { height: 401, hash: 'h401' };
  indexed = true;
  await flush(20);

  assert.equal(broadcasts.length, 1, 'stale self-correction for a superseded height must not be broadcast');
});

test('a persistent query failure during the initial wait still bounds to a partial broadcast and reports errors', async () => {
  const { broadcaster, broadcasts, errors } = harness({
    queryBlockByHeight: async () => {
      throw new Error('connection terminated unexpectedly');
    },
  });

  await broadcaster.handleChainTipChange({ height: 500, hash: 'h500' });

  assert.equal(broadcasts.length, 1);
  assert.deepEqual(broadcasts[0], { height: 500, hash: 'h500' });
  assert.ok(errors.length > 0);
  assert.equal(errors[0].context, 'poll');
  assert.match(errors[0].message, /connection terminated/);
});

test('does not spawn duplicate self-correction pollers for the same height', async () => {
  let indexed = false;
  const { broadcaster, broadcasts } = harness({
    queryBlockByHeight: async () => {
      if (!indexed) return null;
      return { height: 600, hash: 'h600', transaction_count: 1 };
    },
    getChainTip: () => ({ height: 600, hash: 'h600' }),
  });

  // First tip event exhausts its initial wait and schedules self-correction.
  await broadcaster.handleChainTipChange({ height: 600, hash: 'h600' });
  assert.equal(broadcasts.length, 1);
  assert.equal(broadcaster._pendingSelfCorrectionCount(), 1);

  // A duplicate tip event for the identical height while self-correction
  // is still pending reports its own (identical) partial tip, but must
  // NOT register a second background poller for the same height.
  await broadcaster.handleChainTipChange({ height: 600, hash: 'h600' });
  assert.equal(broadcasts.length, 2, 'each event still reports its own partial tip');
  assert.equal(broadcaster._pendingSelfCorrectionCount(), 1, 'still only one pending self-correction for height 600');

  indexed = true;
  await flush(20);

  assert.equal(broadcasts.length, 3, 'exactly one self-correction broadcast — not two');
  assert.deepEqual(broadcasts[2], { height: 600, hash: 'h600', transaction_count: 1 });
  assert.equal(broadcaster._pendingSelfCorrectionCount(), 0, 'pollers must eventually clean up');
});

test('constructor validates its required callbacks', () => {
  assert.throws(() => createChainTipBroadcaster({}), /queryBlockByHeight is required/);
  assert.throws(
    () => createChainTipBroadcaster({ queryBlockByHeight: async () => null }),
    /broadcast is required/,
  );
  assert.throws(
    () => createChainTipBroadcaster({
      queryBlockByHeight: async () => null,
      broadcast: () => {},
    }),
    /getChainTip is required/,
  );
});
