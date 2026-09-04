const assert = require('node:assert/strict');
const test = require('node:test');

/**
 * pool-routing.js keeps its circuit-breaker/replica state as module-level
 * singletons (by design — it's meant to be configured once at server
 * startup). To keep each test case isolated, every test gets a fresh
 * module instance via the require-cache trick rather than sharing state
 * across test cases within this file.
 */
function freshPoolRouting() {
  const modulePath = require.resolve('../pool-routing');
  delete require.cache[modulePath];
  return require(modulePath);
}

function fakePool(overrides = {}) {
  return {
    query: async () => ({ rows: [] }),
    connect: async () => ({ release: () => {} }),
    on: () => {},
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
    ...overrides,
  };
}

test('withTimeout resolves with the underlying value when it settles first', async () => {
  const routing = freshPoolRouting();
  const result = await routing.withTimeout(Promise.resolve('ok'), 50, 'op');
  assert.equal(result, 'ok');
});

test('withTimeout rejects with a labeled error once the bound elapses, regardless of the underlying promise', async () => {
  const routing = freshPoolRouting();
  const neverSettles = new Promise(() => {});
  await assert.rejects(
    routing.withTimeout(neverSettles, 20, 'replica health check'),
    /replica health check timed out after 20ms/,
  );
});

test('withTimeout does not surface an unhandled rejection when the underlying promise rejects after the timeout wins', async () => {
  const routing = freshPoolRouting();
  let rejectLate;
  const late = new Promise((_, reject) => { rejectLate = reject; });

  await assert.rejects(routing.withTimeout(late, 10, 'op'));

  // If this rejection is unobserved, Node emits an 'unhandledRejection' —
  // fail the test explicitly if that happens instead of relying on the
  // process-level warning alone.
  const unhandled = [];
  const onUnhandled = (err) => unhandled.push(err);
  process.on('unhandledRejection', onUnhandled);
  rejectLate(new Error('replica connection dropped after the deadline'));
  await new Promise((resolve) => setImmediate(resolve));
  process.off('unhandledRejection', onUnhandled);
  assert.deepEqual(unhandled, []);
});

test('getWritePool throws until configured, then returns exactly the configured primary', () => {
  const routing = freshPoolRouting();
  assert.throws(() => routing.getWritePool(), /primary pool not configured/);

  const primary = fakePool();
  routing.configure({ primary });
  assert.equal(routing.getWritePool(), primary);
  assert.equal(routing.hasReplica(), false);
  assert.equal(routing.getReadPool(), primary, 'falls back to primary with no replica configured');
});

test('queryWithReplicaFallback routes to a healthy replica and never touches the primary', async () => {
  const routing = freshPoolRouting();
  const primaryCalls = [];
  const replicaCalls = [];
  const primary = fakePool({ query: async (text) => { primaryCalls.push(text); return { rows: [{ h: 100 }] }; } });
  const replica = fakePool({ query: async (text) => { replicaCalls.push(text); return { rows: [{ h: 100 }] }; } });
  routing.configure({ primary, replica });

  const result = await routing.queryWithReplicaFallback('SELECT MAX(height) AS h FROM blocks');
  assert.deepEqual(result.rows, [{ h: 100 }]);
  assert.equal(replicaCalls.length, 1);
  assert.equal(primaryCalls.length, 0);
});

test('queryWithReplicaFallback falls back to the primary on a replica error, and opens the circuit after repeated failures', async () => {
  const routing = freshPoolRouting();
  const primaryCalls = [];
  const primary = fakePool({ query: async (text) => { primaryCalls.push(text); return { rows: [{ ok: 1 }] }; } });
  const replica = fakePool({ query: async () => { throw new Error('replica unreachable'); } });
  routing.configure({ primary, replica });

  assert.equal(routing.getCircuitState().state, 'CLOSED');

  // Each failed replica attempt falls back to the primary immediately —
  // callers never see the replica's error.
  for (let i = 0; i < 3; i += 1) {
    const result = await routing.queryWithReplicaFallback('SELECT 1');
    assert.deepEqual(result.rows, [{ ok: 1 }]);
  }
  assert.equal(primaryCalls.length, 3);

  const circuit = routing.getCircuitState();
  assert.equal(circuit.state, 'OPEN', 'three consecutive failures must open the circuit');
  assert.equal(circuit.consecutiveFailures, 3);
});

test('replicaLagBlocks computes the height difference and caches the result for the check interval', async () => {
  const routing = freshPoolRouting();
  let replicaCallCount = 0;
  const primary = fakePool({ query: async () => ({ rows: [{ h: '110' }] }) });
  const replica = fakePool({
    query: async () => {
      replicaCallCount += 1;
      return { rows: [{ h: '107' }] };
    },
  });
  routing.configure({ primary, replica });

  const lag = await routing.replicaLagBlocks();
  assert.equal(lag, 3);
  assert.equal(replicaCallCount, 1);

  // An immediate second call is well within LAG_CHECK_INTERVAL_MS (30s) and
  // must be served from cache, not re-query the replica.
  const cachedLag = await routing.replicaLagBlocks();
  assert.equal(cachedLag, 3);
  assert.equal(replicaCallCount, 1, 'cached lag must not re-query the replica');
});

test('replicaLagBlocks returns Infinity (never a false "in sync") when the comparison query fails', async () => {
  const routing = freshPoolRouting();
  const primary = fakePool({ query: async () => ({ rows: [{ h: 100 }] }) });
  const replica = fakePool({ query: async () => { throw new Error('replica connection reset'); } });
  routing.configure({ primary, replica });

  const lag = await routing.replicaLagBlocks();
  assert.equal(lag, Infinity);
});

test('replicaLagBlocks is a no-op returning 0 when no replica is configured', async () => {
  const routing = freshPoolRouting();
  routing.configure({ primary: fakePool() });
  assert.equal(await routing.replicaLagBlocks(), 0);
});

test('createSmartReadPool falls back to the primary on ANY replica query error, without throwing to the caller', async () => {
  const routing = freshPoolRouting();
  const primaryCalls = [];
  const primary = fakePool({ query: async (text) => { primaryCalls.push(text); return { rows: [{ ok: true }] }; } });
  const replica = fakePool({ query: async () => { throw new Error('replica down'); } });
  routing.configure({ primary, replica });

  const smartPool = routing.createSmartReadPool();
  const result = await smartPool.query('SELECT 1');
  assert.deepEqual(result.rows, [{ ok: true }]);
  assert.equal(primaryCalls.length, 1);
});

test('configureFromEnv applies REPLICA_QUERY_TIMEOUT_MS as both statement_timeout and query_timeout on the replica pool', () => {
  const routing = freshPoolRouting();
  const originalUrl = process.env.REPLICA_DATABASE_URL;
  process.env.REPLICA_DATABASE_URL = 'postgres://user:pass@127.0.0.1:5999/nonexistent_test_db';

  try {
    routing.configureFromEnv({ primary: fakePool() });
    assert.equal(routing.hasReplica(), true);

    const replicaPool = routing.getReadPool();
    assert.equal(replicaPool.options.statement_timeout, routing.REPLICA_QUERY_TIMEOUT_MS);
    assert.equal(replicaPool.options.query_timeout, routing.REPLICA_QUERY_TIMEOUT_MS);
    assert.equal(replicaPool.options.application_name, 'cipherscan-api-replica');

    // Never actually connects during this test — release the (unconnected)
    // pool's resources immediately rather than leaving it dangling.
    replicaPool.end().catch(() => {});
  } finally {
    if (originalUrl === undefined) delete process.env.REPLICA_DATABASE_URL;
    else process.env.REPLICA_DATABASE_URL = originalUrl;
  }
});

test('configureFromEnv without REPLICA_DATABASE_URL leaves the routing single-primary', () => {
  const routing = freshPoolRouting();
  const originalUrl = process.env.REPLICA_DATABASE_URL;
  delete process.env.REPLICA_DATABASE_URL;

  try {
    routing.configureFromEnv({ primary: fakePool() });
    assert.equal(routing.hasReplica(), false);
    assert.deepEqual(routing.getCircuitState(), {
      state: 'CLOSED',
      consecutiveFailures: 0,
      openedAt: null,
      replicaConfigured: false,
      cachedLagBlocks: 0,
    });
  } finally {
    if (originalUrl === undefined) delete process.env.REPLICA_DATABASE_URL;
    else process.env.REPLICA_DATABASE_URL = originalUrl;
  }
});
