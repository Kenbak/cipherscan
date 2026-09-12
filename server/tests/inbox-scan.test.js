const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(name => load('lib/' + name.replace('./', '') + '.ts'), module, module.exports);
  return module.exports;
}
const { scanInbox } = load('lib/inbox-scan.ts');
const { packActions, compactJobs, compactTxIdToDisplay } = load('lib/scan-records.ts');
const fixtureId = n => n.toString(16).padStart(64, '0');
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
      const body = JSON.parse(init.body); requests.push(body); assert.ok(init.signal instanceof AbortSignal);
      if (url.includes('lightwalletd')) {
        events.push(`fetch:${body.startHeight}`);
        return { ok: true, json: async () => ({ blocks: Array.from({ length: body.endHeight - body.startHeight + 1 }, (_, i) => ({ height: body.startHeight + i, time: 0 })) }) };
      }
      return { ok: true, json: async () => ({ transactions: body.txids.map(txid => ({ txid, hex: '00' })) }) };
    },
    scanner: {
      filterCompactBlocks: async blocks => { events.push(`filter:${blocks[0].height}`); return [{ txid: fixtureId(blocks[0].height), height: blocks[0].height, timestamp: 0 }]; },
      decryptMemos: async txs => txs.map(tx => ({ txid: tx.txid, outputs: [0, 1].map(output_index => ({ output_index, memo: 'fixture', amount: 0, amount_zatoshis: 0, pool: 'orchard' })) })),
    },
    onProgress: () => {}, onMessages: () => {},
  };
  return { options, controller, requests, events };
}
test('long ranges are contiguous, bounded and prefetched; all memos delivered progressively', async () => {
  const { options, requests, events } = setup(50001);
  const filter = options.scanner.filterCompactBlocks;
  options.scanner.filterCompactBlocks = async blocks => { const result = await filter(blocks); await new Promise(resolve => setImmediate(resolve)); events.push(`filtered:${blocks[0].height}`); return result; };
  const counts = []; options.onMessages = messages => counts.push(messages.length);
  const result = await scanInbox(options);
  const ranges = requests.filter(r => r.startHeight);
  assert.equal(ranges.length, 6);
  assert.deepEqual(ranges[0], { startHeight: 1, endHeight: 9999, format: 'inbox-stream-v1' });
  assert.deepEqual(ranges[1], { startHeight: 10000, endHeight: 19999, format: 'inbox-stream-v1' });
  assert.deepEqual(ranges.at(-1), { startHeight: 50000, endHeight: 50001, format: 'inbox-stream-v1' });
  assert.ok(ranges.every(r => r.endHeight - r.startHeight + 1 <= 10000));
  assert.ok(events.indexOf('fetch:10000') < events.indexOf('filtered:1'));
  assert.equal(counts[0], 2); assert.equal(counts.at(-1), 12);
  assert.ok(counts.every((n, i) => !i || n > counts[i - 1]));
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
  options.scanner.filterCompactBlocks = async () => Array.from({ length: 201 }, (_, i) => ({ txid: fixtureId(i), height: 1, timestamp: 0 }));
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
  assert.ok(phases.includes('filtering')); assert.ok(phases.includes('decrypting'));
});

test('a failed raw prefetch is handled and fails the scan instead of skipping notes', async () => {
  const { options } = setup(1); const original = options.fetcher;
  options.scanner.filterCompactBlocks = async () => Array.from({ length: 101 }, (_, i) => ({ txid: fixtureId(i), height: 1, timestamp: 0 }));
  options.fetcher = async (url, init) => JSON.parse(init.body).txids?.[0] === fixtureId(100) ? Promise.reject(new Error('raw offline')) : original(url, init);
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

const { readCompactRange } = load('lib/scan-stream.ts');
const chainHash = n => n.toString(16).padStart(64, '0');
const streamBlock = height => ({ height, time: 1, hash: chainHash(height), prevHash: chainHash(height - 1), vtx: [] });
function frames(start = 1, end = 2) {
  return [{ type: 'start', format: 'inbox-stream-v1', startHeight: start, endHeight: end }, { type: 'blocks', blocks: Array.from({ length: end - start + 1 }, (_, i) => streamBlock(start + i)) }, { type: 'end', endHeight: end, blocksScanned: end - start + 1, hash: chainHash(end) }];
}
function streamResponse(records, fragment = false) {
  const text = records.map(r => JSON.stringify(r) + '\n').join('');
  return new Response(new ReadableStream({ start(c) { const bytes = new TextEncoder().encode(text); if (fragment) for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); else c.enqueue(bytes); c.close(); } }), { headers: { 'Content-Type': 'application/x-ndjson' } });
}
async function consume(response, start = 1, end = 2, previous) {
  const all = []; for await (const blocks of readCompactRange(response, start, end, new AbortController().signal, previous)) all.push(...blocks); return all;
}
test('stream parser handles arbitrary framing and validates cross-range ancestry', async () => {
  assert.deepEqual(await consume(streamResponse(frames(), true)), [streamBlock(1), streamBlock(2)]);
  await assert.rejects(consume(streamResponse(frames()), 1, 2, chainHash(99)), /disconnected/);
});
test('stream parser rejects missing trailers, gaps, forks, incorrect counts and trailing data', async () => {
  const cases = [];
  cases.push(frames().slice(0, 2));
  let r = frames(); r[1].blocks[1].height = 3; cases.push(r);
  r = frames(); r[1].blocks[1].prevHash = chainHash(7); cases.push(r);
  r = frames(); r[2].blocksScanned = 1; cases.push(r);
  r = frames(); r.push({ type: 'blocks', blocks: [streamBlock(3)] }); cases.push(r);
  r = frames(); r[2] = { type: 'error' }; cases.push(r);
  for (const records of cases) await assert.rejects(consume(streamResponse(records)));
});
test('filtering starts before stream completion and cancellation closes the reader', async () => {
  const { options, controller } = setup(2); let source; let closed = false;
  options.fetcher = async () => new Response(new ReadableStream({ start(c) { source = c; for (const r of [frames()[0], { type: 'blocks', blocks: [streamBlock(1)] }]) c.enqueue(new TextEncoder().encode(JSON.stringify(r) + '\n')); }, cancel() { closed = true; } }), { headers: { 'Content-Type': 'application/x-ndjson' } });
  let filtered = false;
  options.scanner.filterCompactBlocks = async () => { filtered = true; return []; };
  const scan = scanInbox(options); const rejected = assert.rejects(scan, { name: 'AbortError' });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(filtered); // The second block and trailer have never arrived.
  controller.abort(); await rejected; await new Promise(resolve => setImmediate(resolve));
  assert.ok(closed);
});

test('memo links use display-order IDs while raw retrieval retains compact wire IDs', async () => {
  const { options, requests } = setup(1);
  const wire = '0123456789abcdef'.repeat(4);
  const display = 'efcdab8967452301'.repeat(4);
  assert.equal(compactTxIdToDisplay(wire), display);
  assert.throws(() => compactTxIdToDisplay('bad'));
  options.scanner.filterCompactBlocks = async () => [{ txid: wire, height: 1, timestamp: 0 }];
  const result = await scanInbox(options);
  assert.deepEqual(requests.find(r => r.txids).txids, [wire]);
  assert.ok(result.messages.every(m => m.txid === display));
});

test('compact filtering continues during a stalled memo download; completion waits for memos', async () => {
  const { options, events } = setup(50001); const original = options.fetcher;
  let release; const held = new Promise(resolve => { release = resolve; });
  let completed = false;
  options.fetcher = async (url, init) => { if (url.includes('/raw/')) await held; return original(url, init); };
  const scan = scanInbox(options).then(result => { completed = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(events.includes('filter:50000'));
  assert.equal(completed, false);
  release();
  assert.equal((await scan).messages.length, 12);
});

test('slow memo decryption bounds discovery backlog and cancellation wakes the blocked producer', async () => {
  const { options, controller, requests } = setup(90000);
  let filtered = 0;
  options.scanner.filterCompactBlocks = async blocks => { filtered++; return Array.from({ length: 100 }, (_, i) => ({ txid: fixtureId(blocks[0].height + i), height: blocks[0].height, timestamp: 0 })); };
  let release; const held = new Promise(resolve => { release = resolve; });
  options.scanner.decryptMemos = async () => { await held; return []; };
  const scan = scanInbox(options);
  const rejection = assert.rejects(scan, { name: 'AbortError' });
  await new Promise(resolve => setImmediate(resolve));
  // 100 decrypting, 100 prefetched, 200 queued and one just-filtered frame.
  assert.equal(filtered, 5);
  assert.deepEqual(requests.filter(r => r.txids).map(r => r.txids.length), [100, 100]);
  controller.abort();
  await rejection;
  release();
});
