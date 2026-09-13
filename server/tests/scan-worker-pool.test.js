const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const records = { exports: {} };
new Function('module', 'exports', compile(fs.readFileSync('lib/scan-records.ts', 'utf8')))(records, records.exports);

function setup() {
  const workers = [];
  class Worker {
    constructor() { this.dead = false; this.messages = []; workers.push(this); }
    terminate() { this.dead = true; }
    postMessage(message) {
      this.messages.push(message);
      if (message.operation === 'init') queueMicrotask(() => this.reply(message, null));
      // Other operations are completed by the test, including deliberately late responses.
    }
    reply(message, result) { this.onmessage?.({ data: { type: 'session-result', id: message.id, result } }); }
  }
  const module = { exports: {} };
  const source = fs.readFileSync('hooks/useWasmWorkerPool.ts', 'utf8')
    .replace("new URL('../workers/wasm-filter.worker.ts', import.meta.url)", "'fixture-worker'");
  const react = { useCallback: fn => fn, useEffect: () => {}, useRef: value => ({ current: value }), useState: value => [value, () => {}] };
  new Function('require', 'module', 'exports', 'Worker', 'navigator', compile(source))(
    name => name === 'react' ? react : records.exports, module, module.exports, Worker, { hardwareConcurrency: 2 },
  );
  return { pool: module.exports.useWasmWorkerPool(), workers };
}
const block = [{ height: 1, time: 0, vtx: [{ hash: 'fixture', actions: [{
  nullifier: '00'.repeat(32), cmx: '00'.repeat(32), ephemeralKey: '00'.repeat(32), ciphertext: '00'.repeat(52),
}] }] }];

test('cancel rejects pending WASM and late responses cannot corrupt a restarted scan', async () => {
  const { pool, workers } = setup();
  await pool.begin('synthetic-key');
  const first = pool.filterCompactBlocks(block);
  const rejected = assert.rejects(first, { name: 'AbortError' });
  const old = workers[0]; const oldMessage = old.messages.at(-1);
  pool.cancel(); await rejected;
  assert.ok(old.dead);
  await pool.begin('another-synthetic-key');
  const next = pool.filterCompactBlocks(block);
  old.reply(oldMessage, [0]);
  const current = workers[1]; current.reply(current.messages.at(-1), [0]);
  assert.deepEqual(await next, [{ txid: 'fixture', height: 1, timestamp: 0 }]);
  pool.cancel();
});

test('worker errors reject the scan instead of leaving a promise pending', async () => {
  const { pool, workers } = setup();
  await pool.begin('synthetic-key');
  const filtered = pool.filterCompactBlocks(block);
  const rejected = assert.rejects(filtered, /Scan worker failed/);
  workers[0].onerror(); await rejected;
  pool.cancel(); assert.ok(workers[0].dead);
});
