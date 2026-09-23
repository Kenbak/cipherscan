const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: name => dependencies[name] ?? require(name) });
  return exports;
}
const numbers = load('lib/format-numbers.ts');
const { transformExpressBlockData } = load('app/block/[height]/components/transformBlockData.ts', { '@/lib/format-numbers': numbers });

test('archived vin/vout retain addresses and zatoshi values through frontend normalization', () => {
  const data = transformExpressBlockData({ height: 100, isOrphaned: true, transactionCount: 2, transactions: [{
    txid: 'a'.repeat(64), tx_index: 1, is_coinbase: false,
    vin: [{ prev_txid: 'b'.repeat(64), prev_vout: 0, value: 100000000, address: 'from' }],
    vout: [{ vout_index: 0, value: 99990000, address: 'to' }],
  }] });
  assert.equal(data.transactions[0].vin[0].address, 'from');
  assert.equal(data.transactions[0].vin[0].coinbase, undefined);
  assert.equal(data.transactions[0].vin[0].value, 1);
  assert.equal(data.transactions[0].vout[0].scriptPubKey.addresses[0], 'to');
  assert.equal(data.transactions[0].vout[0].value, 0.9999);
  assert.equal(data.totalFees, 0.0001);
  assert.equal(data.transactionCount, 2);
});

test('first seen renders milliseconds in UTC and does not invent missing observations', () => {
  const { BlockFirstSeen } = load('components/BlockFirstSeen.tsx');
  const html = renderToStaticMarkup(React.createElement(BlockFirstSeen, { value: '2026-09-23T11:26:09.123Z' }));
  assert.match(html, /2026-09-23 11:26:09.123 UTC/);
  assert.match(html, /dateTime="2026-09-23T11:26:09.123Z"/i);
  for (const value of [null, undefined, 'invalid']) {
    assert.match(renderToStaticMarkup(React.createElement(BlockFirstSeen, { value })), /Not recorded/);
  }
});

test('malformed block paths are rejected before a streaming response starts', async () => {
  class NextResponse {
    constructor(body, init) { this.body = body; this.status = init.status; this.headers = new Headers(init.headers); }
    static next() { return { status: 200 }; }
  }
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('proxy.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, process: { env: { NODE_ENV: 'development' } }, setInterval: () => {},
    require: name => ({
      'next/server': { NextResponse },
      './lib/governance-request': {},
      './lib/network': {},
    })[name],
  });
  for (const id of ['bad-hash', '-1', '100000001', 'g'.repeat(64)]) {
    const response = await exports.proxy({ nextUrl: { pathname: `/block/${id}` } });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, follow');
  }
  for (const id of ['3492072', 'a'.repeat(64)]) {
    assert.equal((await exports.proxy({ nextUrl: { pathname: `/block/${id}` } })).status, 200);
  }
});
