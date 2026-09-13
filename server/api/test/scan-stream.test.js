const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { EventEmitter } = require('node:events');
const express = require('express');
const { streamInbox } = require('../lib/scan-stream');
const hash = n => Buffer.from(n.toString(16).padStart(64, '0'), 'hex');
const block = height => ({ height, time: 1, hash: hash(height), prevHash: hash(height - 1), vtx: [] });
const grpc = { credentials: { createInsecure: () => ({}) } };

test('server delivers initial blocks before upstream completes and rejects incomplete ranges', async t => {
  let release; let incomplete = false; let closed = 0;
  const gate = new Promise(resolve => { release = resolve; });
  class Client {
    close() { closed++; }
    GetBlockRange() {
      const call = Readable.from((async function* () { for (let h = 1; h <= 128; h++) yield block(h); await gate; if (!incomplete) { yield block(129); yield block(130); } })());
      call.cancel = () => call.destroy(); return call;
    }
  }
  const app = express(); app.get('/', (req, res) => streamInbox(res, Client, grpc, 1, 130));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/`;
  const response = await fetch(url); assert.equal(response.headers.get('content-encoding'), 'gzip'); const reader = response.body.getReader(); let text = '';
  while (!text.includes('"type":"blocks"')) text += Buffer.from((await reader.read()).value).toString();
  assert.ok(!text.includes('"type":"end"'));
  release();
  while (true) { const part = await reader.read(); if (part.done) break; text += Buffer.from(part.value).toString(); }
  const records = text.trim().split('\n').map(JSON.parse);
  assert.equal(records.at(-1).blocksScanned, 130);
  assert.deepEqual(records.filter(r => r.type === 'blocks').flatMap(r => r.blocks).map(b => b.height), Array.from({ length: 130 }, (_, i) => i + 1));
  incomplete = true;
  const failed = (await (await fetch(url)).text()).trim().split('\n').map(JSON.parse);
  assert.equal(failed.at(-1).type, 'error'); assert.ok(!failed.some(r => r.type === 'end')); assert.equal(closed, 2);
});

test('response backpressure bounds upstream consumption; disconnect cancels upstream', async () => {
  let produced = 0; let cancelled = 0; let closed = false;
  class Client {
    close() { closed = true; }
    GetBlockRange() {
      const call = Readable.from((async function* () { for (let h = 1; h <= 1000; h++) { produced++; yield block(h); } })());
      call.cancel = () => { cancelled++; call.destroy(); }; return call;
    }
  }
  const res = new EventEmitter(); res.destroyed = false; res.setHeader = () => {}; res.end = () => {};
  res.write = text => !text.includes('"type":"blocks"');
  const streaming = streamInbox(res, Client, grpc, 1, 1000);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(produced >= 32 && produced < 64);
  res.destroyed = true; res.emit('close'); await streaming;
  assert.ok(cancelled && closed); assert.equal(res.listenerCount('drain'), 0);
});
