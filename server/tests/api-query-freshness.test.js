const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual hook's effects/registry with deterministic time and
// network responses; each mounted component has its own React ref slots.
function harness({ hidden = false, fetchImpl } = {}) {
  let now = 1_000_000;
  let id = 0;
  let active;
  let calls = 0;
  const timers = new Map();
  const document = new EventTarget();
  document.visibilityState = hidden ? 'hidden' : 'visible';
  const exports = {};
  const react = {
    useRef(value) {
      const index = active.index++;
      return active.refs[index] ||= { current: value };
    },
    useState() { return [0, () => {}]; },
    useEffect(effect) { if (active.mounting) active.effects.push(effect); },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('hooks/useApiQuery.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, document, URL, AbortController, console,
    Date: { now: () => now },
    require(name) {
      if (name === 'react') return react;
      if (name === '@/lib/api-config') return { getApiUrl: () => 'https://api.example.test' };
      // Assay uses the versioned API envelope; freshness behavior is shared.
      if (name === '@/lib/api-client') return { readApiData: response => response.json() };
      throw new Error(`Unexpected import ${name}`);
    },
    setTimeout(fn, delay) { timers.set(++id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (...args) => {
      calls++;
      return fetchImpl ? fetchImpl(...args) : { ok: true, json: async () => ({ height: 101 }) };
    },
  });
  return {
    document, timers,
    get calls() { return calls; },
    get now() { return now; },
    advance(ms) { now += ms; },
    mount(options) {
      const component = { refs: [], effects: [], index: 0, mounting: true };
      const render = () => {
        active = component;
        component.index = 0;
        return exports.useApiQuery('/stats', undefined, options);
      };
      render();
      const cleanups = component.effects.map(effect => effect());
      component.mounting = false;
      return { render, unmount: () => cleanups.forEach(cleanup => cleanup?.()) };
    },
    async tick(ms) {
      now += ms;
      for (const [key, timer] of [...timers]) {
        if (timer.at <= now) { timers.delete(key); await timer.fn(); }
      }
    },
  };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('stale ISR data stays visible and refreshes immediately, deduplicated across subscribers', async () => {
  let resolve;
  const live = harness({ fetchImpl: () => new Promise(r => { resolve = r; }) });
  const options = { refreshInterval: 60_000, initialData: { height: 100 }, initialFetchedAt: live.now - 300_000 };
  const first = live.mount(options);
  const second = live.mount(options);
  assert.equal(live.calls, 1);
  assert.equal(first.render().data.height, 100);
  assert.equal(first.render().loading, false);
  assert.equal(first.render().isRefreshing, true);
  resolve({ ok: true, json: async () => ({ height: 101 }) });
  await flush();
  assert.equal(second.render().data.height, 101);
  assert.equal(first.render().error, null);
});

test('fresh seed is refreshed when its remaining lifetime expires, not a full interval after mounting', async () => {
  const live = harness();
  live.mount({ refreshInterval: 60_000, initialData: { height: 100 }, initialFetchedAt: live.now - 50_000 });
  assert.equal(live.calls, 0);
  await live.tick(9_999);
  assert.equal(live.calls, 0);
  await live.tick(1);
  assert.equal(live.calls, 1);
});

test('hidden seeded page waits, then catches up once on visibility return', async () => {
  const live = harness({ hidden: true });
  live.mount({ refreshInterval: 60_000, initialData: { height: 100 }, initialFetchedAt: live.now - 300_000 });
  assert.equal(live.calls, 0);
  assert.equal(live.timers.size, 0);
  live.document.visibilityState = 'visible';
  live.document.dispatchEvent(new Event('visibilitychange'));
  live.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(live.calls, 1);
  await flush();
  assert.equal(live.timers.size, 1);
});

test('failed catch-up preserves last good data and backs off before retrying', async () => {
  let fail = true;
  const live = harness({ fetchImpl: async () => fail
    ? { ok: false, status: 503 }
    : { ok: true, json: async () => ({ height: 102 }) } });
  const view = live.mount({ refreshInterval: 60_000, initialData: { height: 100 }, initialFetchedAt: live.now - 300_000 });
  await flush();
  assert.equal(view.render().data.height, 100);
  assert.equal(view.render().error, 'HTTP 503');
  assert.equal(view.render().loading, false);
  await live.tick(119_999);
  assert.equal(live.calls, 1);
  fail = false;
  await live.tick(1);
  assert.equal(view.render().data.height, 102);
  assert.equal(view.render().error, null);
});

test('unseeded queries still fetch once and a recent shared response is not fetched again', async () => {
  const live = harness();
  const first = live.mount({ refreshInterval: 60_000 });
  await flush();
  const second = live.mount({ refreshInterval: 60_000, initialData: { height: 99 }, initialFetchedAt: live.now - 300_000 });
  assert.equal(live.calls, 1);
  assert.equal(first.render().data.height, 101);
  assert.equal(second.render().data.height, 101);
});
