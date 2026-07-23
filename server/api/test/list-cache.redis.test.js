const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const test = require('node:test');

const { createListCache } = require('../list-cache');

const redisUrl = process.env.TEST_REDIS_URL;

function scheduledTasks() {
  const pending = new Set();
  return {
    schedule(task) {
      pending.add(task);
      void task.finally(() => pending.delete(task));
    },
    async flush() {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
  };
}

test('real Redis: MISS/HIT, TTL, stale refresh, locking, and fail-open', {
  skip: !redisUrl && 'set TEST_REDIS_URL to run the Redis integration test',
  timeout: 20_000,
}, async (t) => {
  const { createClient } = require('redis');
  const client = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 1_000,
      reconnectStrategy: false,
    },
  });
  const namespace = `test-${randomUUID()}`;
  const prefix = `cipherscan:list:v1:${namespace}`;

  async function cleanup() {
    if (!client.isReady) return;
    const keys = [];
    for await (const item of client.scanIterator({
      MATCH: `${prefix}:*`,
      COUNT: 100,
    })) {
      if (Array.isArray(item)) keys.push(...item);
      else keys.push(item);
    }
    for (const key of keys) await client.del(key);
  }

  t.after(async () => {
    try {
      await cleanup();
      if (client.isReady) await client.quit();
      else if (client.isOpen) client.destroy();
    } catch {
      if (client.isOpen) client.destroy();
    }
  });
  client.on('error', () => {});
  await client.connect();
  await cleanup();

  const tasks = scheduledTasks();
  const cache = createListCache({
    redisClient: client,
    enabled: true,
    namespace,
    schedule: tasks.schedule,
    redisTimeoutMs: 500,
  });
  let loads = 0;
  const options = {
    family: 'blocks',
    params: { page: 1, limit: 20 },
    freshTtlSeconds: 5,
    staleTtlSeconds: 20,
    load: async () => ({ generation: ++loads }),
  };

  const miss = await cache.getOrLoad(options);
  const hit = await cache.getOrLoad(options);
  assert.equal(miss.state, 'MISS');
  assert.equal(hit.state, 'HIT');
  assert.deepEqual(hit.value, { generation: 1 });
  assert.equal(loads, 1);

  const ttl = await client.ttl(miss.key);
  assert.ok(ttl > 0 && ttl <= options.staleTtlSeconds, `unexpected cache TTL: ${ttl}`);

  const boundedTasks = scheduledTasks();
  const boundedCache = createListCache({
    redisClient: client,
    enabled: true,
    namespace,
    maxEntries: 2,
    schedule: boundedTasks.schedule,
    redisTimeoutMs: 500,
  });
  const boundedKeys = [];
  for (let page = 1; page <= 3; page += 1) {
    const result = await boundedCache.getOrLoad({
      ...options,
      family: 'bounded',
      params: { page },
      load: async () => ({ page }),
    });
    boundedKeys.push(result.key);
    await boundedTasks.flush();
  }
  assert.equal(await client.exists(boundedKeys[0]), 0);
  assert.equal(await client.exists(boundedKeys[1]), 1);
  assert.equal(await client.exists(boundedKeys[2]), 1);
  assert.equal(await client.ttl(`${prefix}:index:bounded`), -1);

  const entry = JSON.parse(await client.get(miss.key));
  const now = Date.now();
  entry.freshUntil = Math.max(entry.storedAt, now - 1);
  entry.staleUntil = now + 15_000;
  await client.set(miss.key, JSON.stringify(entry), { EX: options.staleTtlSeconds });

  const stale = await cache.getOrLoad(options);
  assert.equal(stale.state, 'STALE');
  assert.deepEqual(stale.value, { generation: 1 });
  assert.equal(stale.refreshScheduled, true);
  await tasks.flush();
  const refreshed = await cache.getOrLoad(options);
  assert.equal(refreshed.state, 'HIT');
  assert.deepEqual(refreshed.value, { generation: 2 });

  const staleAgain = JSON.parse(await client.get(miss.key));
  const secondNow = Date.now();
  staleAgain.freshUntil = Math.max(staleAgain.storedAt, secondNow - 1);
  staleAgain.staleUntil = secondNow + 15_000;
  await client.set(miss.key, JSON.stringify(staleAgain), { EX: options.staleTtlSeconds });
  const lockKey = `${miss.key}:refresh-lock`;
  await client.set(lockKey, 'external-owner', { NX: true, EX: 30 });
  const loadsBeforeLockTest = loads;
  const lockedStale = await cache.getOrLoad(options);
  await tasks.flush();
  assert.equal(lockedStale.state, 'STALE');
  assert.equal(loads, loadsBeforeLockTest, 'an existing distributed lock must suppress refresh work');
  assert.equal(await client.get(lockKey), 'external-owner');
  await client.del(lockKey);

  const disconnected = client.duplicate();
  disconnected.on('error', () => {});
  const failOpenCache = createListCache({
    redisClient: disconnected,
    enabled: true,
    namespace,
  });
  const failOpen = await failOpenCache.getOrLoad({
    ...options,
    params: { page: 2 },
    load: async () => 'live-fallback',
  });
  assert.equal(failOpen.state, 'MISS');
  assert.equal(failOpen.value, 'live-fallback');
  assert.equal(disconnected.isReady, false);
});
