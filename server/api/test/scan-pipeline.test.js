const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { compactBlockToJSON, isCompleteRange } = require('../lib/compact-blocks');
const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-cache-test-'));
process.env.COMPACT_BLOCK_CACHE_DIR = cacheDir;
const router = require('../routes/scan');

test('protobuf pool identity survives the JSON/cache representation', () => {
  const action = { nullifier: Buffer.alloc(32), cmx: Buffer.alloc(32), ephemeralKey: Buffer.alloc(32), ciphertext: Buffer.alloc(52) };
  const result = compactBlockToJSON({ height: 1, vtx: [{ actions: [action], ironwoodActions: [action] }] });
  assert.deepEqual(result.vtx[0].actions.map(a => a.pool), ['orchard', 'ironwood']);
  assert.equal(result.vtx[0].actions[0].ciphertext.length, 104);
  assert.ok(isCompleteRange([{ height: '5' }, { height: '6' }], 5, 6));
  assert.ok(!isCompleteRange([{ height: 5 }, { height: 5 }], 5, 6));
});

test('cache boundary, partial cache and incomplete upstream regression', async t => {
  let calls = []; let incomplete = false;
  class Client {
    close() {}
    GetBlockRange({ start, end }) {
      calls.push([start.height, end.height]);
      const stream = new EventEmitter();
      setImmediate(() => {
        for (let height = start.height; height <= end.height - (incomplete ? 1 : 0); height++) stream.emit('data', { height, time: 0, vtx: [] });
        stream.emit('end');
      });
      return stream;
    }
  }
  const app = express(); app.use(express.json());
  app.locals.CompactTxStreamer = Client;
  app.locals.grpc = { credentials: { createInsecure: () => ({}) } };
  app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.close(); fs.rmSync(cacheDir, { recursive: true, force: true }); });
  const post = (startHeight, endHeight, format) => fetch(`http://127.0.0.1:${server.address().port}/api/lightwalletd/scan`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startHeight, endHeight, format }),
  });
  fs.writeFileSync(path.join(cacheDir, 'blocks_10000_19999.json'), JSON.stringify({ blocks: Array.from({ length: 9000 }, (_, i) => ({ height: 10000 + i })) }));
  const partial = await post(10000, 19999);
  assert.equal(partial.status, 200);
  assert.equal((await partial.json()).blocks.length, 10000);
  assert.deepEqual(calls, [[10000, 19999]]);
  calls = [];
  const boundary = await post(19999, 20001);
  assert.equal(boundary.status, 200);
  assert.deepEqual((await boundary.json()).blocks.map(b => Number(b.height)), [19999, 20000, 20001]);
  assert.deepEqual(calls, [[20000, 20001]]);
  const packed = await post(10000, 10002, 'inbox-v1');
  assert.equal(packed.status, 200);
  const body = await packed.json();
  assert.equal(body.format, 'inbox-v1');
  assert.deepEqual(body.blocks.map(b => b.height), [10000, 10001, 10002]);
  assert.ok(body.blocks.every(b => Array.isArray(b.vtx)));
  assert.equal((await post(10000, 10002, 'unknown')).status, 400);
  incomplete = true;
  assert.equal((await post(30000, 30002)).status, 502);
  assert.equal((await post(1, 50001)).status, 400);
});
