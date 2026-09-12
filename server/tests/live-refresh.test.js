const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(overrides = {}) {
  const exports = {};
  const document = new EventTarget();
  document.visibilityState = 'visible';
  const window = new EventTarget();
  const timers = new Map();
  let id = 0;
  const context = {
    exports, document, window, AbortController,
    setTimeout: (fn) => { timers.set(++id, fn); return id; },
    clearTimeout: (id) => timers.delete(id),
    ...overrides,
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/live-refresh.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return { ...exports, document, window, timers,
    tick: async () => {
      const [key, fn] = timers.entries().next().value;
      timers.delete(key);
      await fn();
    },
  };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('deadline remains armed after headers; stalled body aborts and subsequent fetch succeeds', async () => {
  let signal;
  let calls = 0;
  const live = load({ fetch: async (_url, options) => {
    assert.equal(options.cache, 'no-store');
    signal = options.signal;
    if (++calls > 1) return { ok: true, json: async () => ({ blocks: [101] }) };
    return { ok: true, json: () => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }) };
  } });
  const pending = live.fetchLiveJson('/blocks');
  const rejected = assert.rejects(pending, /aborted/);
  await flush();
  assert.equal(live.timers.size, 1, 'body is still protected by the timeout');
  await live.tick();
  await rejected;
  assert.equal(signal.aborted, true);
  assert.deepEqual(await live.fetchLiveJson('/blocks'), { blocks: [101] });
  assert.equal(live.timers.size, 0);
});

test('HTTP errors reject and clear the deadline', async () => {
  const live = load({ fetch: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(live.fetchLiveJson('/blocks'), /503/);
  assert.equal(live.timers.size, 0);
});

test('polling catches up immediately, pauses hidden, resumes once despite concurrent lifecycle events', async () => {
  const live = load();
  let calls = 0;
  let resolve;
  const stop = live.startLiveRefresh(() => {
    calls++;
    return new Promise(r => { resolve = r; });
  });
  assert.equal(calls, 1);
  live.window.dispatchEvent(new Event('focus'));
  live.window.dispatchEvent(new Event('online'));
  assert.equal(calls, 1);
  live.document.visibilityState = 'hidden';
  live.document.dispatchEvent(new Event('visibilitychange'));
  resolve(); await flush();
  assert.equal(live.timers.size, 0);
  live.document.visibilityState = 'visible';
  live.document.dispatchEvent(new Event('visibilitychange'));
  live.window.dispatchEvent(new Event('pageshow'));
  assert.equal(calls, 2);
  resolve(); await flush();
  assert.equal(live.timers.size, 1);
  live.window.dispatchEvent(new Event('online'));
  assert.equal(calls, 3);
  assert.equal(live.timers.size, 0);
  stop(); resolve(); await flush();
  assert.equal(live.timers.size, 0);
  live.window.dispatchEvent(new Event('focus'));
  assert.equal(calls, 3);
});

test('poll continues without socket events after a request failure handled by the consumer', async () => {
  let calls = 0;
  const live = load();
  const stop = live.startLiveRefresh(async () => {
    calls++;
    try { if (calls === 1) throw new Error('offline'); } catch { /* retain last good rows */ }
  });
  await flush();
  await live.tick();
  assert.equal(calls, 2);
  await live.tick();
  assert.equal(calls, 3);
  stop();
  assert.equal(live.timers.size, 0);
});
