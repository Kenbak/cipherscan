const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) {
  const module = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(module, module.exports);
  return module.exports;
}
const { scanInbox } = load('lib/inbox-scan.ts');
const { packActions } = load('lib/scan-records.ts');
const action = { nullifier: '00'.repeat(32), cmx: '01'.repeat(32), ephemeralKey: '02'.repeat(32), ciphertext: '03'.repeat(52) };

test('binary records preserve pool, exact field boundaries and reject malformed input', () => {
  const bytes = packActions([action, { ...action, pool: 'orchard' }, { ...action, pool: 'ironwood' }]);
  assert.equal(bytes.length, 149 * 3);
  assert.deepEqual([bytes[0], bytes[149], bytes[298]], [0, 1, 2]);
  assert.equal(bytes[33], 1); assert.equal(bytes[65], 2); assert.equal(bytes[97], 3);
  assert.throws(() => packActions([{ ...action, cmx: 'xx'.repeat(32) }]));
  assert.throws(() => packActions([{ ...action, pool: 'unknown' }]));
});

function setup(endHeight = 20003) {
  const controller = new AbortController();
  const requests = [];
  const events = [];
  const options = {
    apiUrl: '', startHeight: 1, endHeight, signal: controller.signal,
    fetcher: async (url, init) => {
      const body = JSON.parse(init.body); requests.push(body); assert.equal(init.signal, controller.signal);
      if (url.includes('lightwalletd')) {
        events.push(`fetch:${body.startHeight}`);
        return { ok: true, json: async () => ({ blocks: Array.from({ length: body.endHeight - body.startHeight + 1 }, (_, i) => ({ height: body.startHeight + i, time: 0 })) }) };
      }
      return { ok: true, json: async () => ({ transactions: body.txids.map(txid => ({ txid, hex: '00' })) }) };
    },
    scanner: {
      filterCompactBlocks: async blocks => { events.push(`filter:${blocks[0].height}`); return [{ txid: `tx${blocks[0].height}`, height: blocks[0].height, timestamp: 0 }]; },
      decryptMemos: async txs => txs.map(tx => ({ txid: tx.txid, outputs: [0, 1].map(output_index => ({ output_index, memo: 'fixture', amount: 0, amount_zatoshis: 0, pool: 'orchard' })) })),
    },
    onProgress: () => {}, onMessages: () => {},
  };
  return { options, controller, requests, events };
}
test('long ranges are contiguous, bounded and prefetched; all memos delivered progressively', async () => {
  const { options, requests, events } = setup(50001);
  const counts = []; options.onMessages = messages => counts.push(messages.length);
  const result = await scanInbox(options);
  const ranges = requests.filter(r => r.startHeight);
  assert.equal(ranges.length, 6);
  assert.deepEqual(ranges[0], { startHeight: 1, endHeight: 9999 });
  assert.deepEqual(ranges[1], { startHeight: 10000, endHeight: 19999 });
  assert.deepEqual(ranges.at(-1), { startHeight: 50000, endHeight: 50001 });
  assert.ok(ranges.every(r => r.endHeight - r.startHeight + 1 <= 10000));
  assert.ok(events.indexOf('fetch:10000') < events.indexOf('filter:1'));
  assert.deepEqual(counts, [2, 4, 6, 8, 10, 12]);
  assert.equal(result.matches, 6); assert.equal(result.messages.length, 12);
});
test('missing blocks cannot silently complete a scan', async () => {
  const { options } = setup(2);
  options.fetcher = async () => ({ ok: true, json: async () => ({ blocks: [{ height: 1 }] }) });
  await assert.rejects(scanInbox(options), /Incomplete compact/);
});
test('first download overlaps initialization but filtering waits for prepared keys', async () => {
  const { options, events } = setup(1);
  let ready;
  options.initialize = () => new Promise(resolve => { ready = resolve; });
  const scan = scanInbox(options);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['fetch:1']);
  ready();
  await scan;
  assert.ok(events.includes('filter:1'));
});
test('initialization failure rejects promptly even with an outstanding download', async () => {
  const { options } = setup(1);
  options.fetcher = () => new Promise(() => {});
  options.initialize = async () => { throw new Error('invalid viewing key'); };
  await assert.rejects(scanInbox(options), /invalid viewing key/);
});
test('missing raw transactions fail visibly', async () => {
  const { options } = setup(1); const original = options.fetcher;
  options.fetcher = async (url, init) => url.includes('/raw/') ? { ok: true, json: async () => ({ transactions: [] }) } : original(url, init);
  await assert.rejects(scanInbox(options), /unavailable/);
});
test('cancellation while filtering prevents memo fetch and publishing', async () => {
  const { options, controller, requests } = setup();
  options.scanner.filterCompactBlocks = async () => { controller.abort(); return []; };
  options.onMessages = () => assert.fail('published cancelled results');
  await assert.rejects(scanInbox(options), { name: 'AbortError' });
  assert.ok(requests.every(r => !r.txids));
});
test('a failed prefetch rejects the scan without an unhandled rejection', async () => {
  const { options } = setup(); const original = options.fetcher;
  options.fetcher = async (url, init) => JSON.parse(init.body).startHeight === 10000 ? Promise.reject(new Error('offline')) : original(url, init);
  await assert.rejects(scanInbox(options), /offline/);
});
