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
const { packActions, compactJobs } = load('lib/scan-records.ts');
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
  assert.deepEqual(ranges[0], { startHeight: 1, endHeight: 9999, format: 'inbox-v1' });
  assert.deepEqual(ranges[1], { startHeight: 10000, endHeight: 19999, format: 'inbox-v1' });
  assert.deepEqual(ranges.at(-1), { startHeight: 50000, endHeight: 50001, format: 'inbox-v1' });
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

test('packed transport preserves exact legacy bytes, metadata and 512-action boundaries', () => {
  const { compactBlockToInbox } = require('../api/lib/compact-blocks');
  const blocks = [{ height: 1, time: 7, vtx: [{ hash: 'first', actions: Array.from({ length: 513 }, (_, i) => ({ ...action, pool: i % 2 ? 'orchard' : 'ironwood' })) }, { hash: 'second', actions: [action] }] }, { height: 2, time: 8, vtx: [] }];
  const packed = blocks.map(compactBlockToInbox);
  assert.deepEqual(compactJobs(packed), compactJobs(blocks));
  assert.deepEqual(compactJobs(packed).map(j => j.transactions.length), [512, 2]);
  for (const records of ['!', 'AA==', Buffer.from([3, ...new Array(148).fill(0)]).toString('base64')]) {
    assert.throws(() => compactJobs([{ height: 1, time: 0, vtx: [{ hash: 'bad', records }] }]));
  }
  assert.throws(() => compactBlockToInbox({ vtx: [{ actions: [{ ...action, ciphertext: 'ff' }] }] }));
});

test('memo download is one batch ahead, publishes completed transactions early and avoids duplicates', async () => {
  const { options, requests } = setup(1);
  options.scanner.filterCompactBlocks = async () => Array.from({ length: 201 }, (_, i) => ({ txid: `tx${i}`, height: 1, timestamp: 0 }));
  const snapshots = []; options.onMessages = messages => snapshots.push(messages.length);
  const phases = []; options.onPhase = phase => phases.push(phase);
  let release; const held = new Promise(resolve => { release = resolve; });
  let batches = 0;
  options.scanner.decryptMemos = async (txs, publish) => {
    batches++;
    const results = txs.map(tx => ({ txid: tx.txid, outputs: [{ memo: 'fixture', output_index: 0 }] }));
    publish(results[0]);
    if (batches === 1) await held;
    return results;
  };
  const scan = scanInbox(options);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requests.filter(r => r.txids).map(r => r.txids.length), [100, 100]);
  assert.deepEqual(snapshots, [1]); // First memo appears before the batch finishes.
  release();
  const result = await scan;
  assert.equal(result.messages.length, 201);
  assert.equal(new Set(result.messages.map(m => m.txid)).size, 201);
  assert.deepEqual(requests.filter(r => r.txids).map(r => r.txids.length), [100, 100, 1]);
  assert.deepEqual(phases.slice(0, 4), ['fetching', 'filtering', 'memos', 'decrypting']);
});

test('a failed raw prefetch is handled and fails the scan instead of skipping notes', async () => {
  const { options } = setup(1); const original = options.fetcher;
  options.scanner.filterCompactBlocks = async () => Array.from({ length: 101 }, (_, i) => ({ txid: `tx${i}`, height: 1, timestamp: 0 }));
  options.fetcher = async (url, init) => JSON.parse(init.body).txids?.[0] === 'tx100' ? Promise.reject(new Error('raw offline')) : original(url, init);
  await assert.rejects(scanInbox(options), /raw offline/);
});

test('cancellation prevents late memo callbacks from publishing', async () => {
  const { options, controller } = setup(1);
  options.onMessages = () => assert.fail('published cancelled memo');
  options.scanner.decryptMemos = async (txs, publish) => {
    controller.abort();
    publish({ txid: txs[0].txid, outputs: [{ memo: 'fixture' }] });
    return [];
  };
  await assert.rejects(scanInbox(options), { name: 'AbortError' });
});

test('a missing decryption result cannot silently hide a matching transaction', async () => {
  const { options } = setup(1);
  options.scanner.decryptMemos = async () => [];
  await assert.rejects(scanInbox(options), /Incomplete memo decryption/);
});
